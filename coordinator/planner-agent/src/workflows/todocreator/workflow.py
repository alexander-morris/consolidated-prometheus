"""Task decomposition workflow implementation."""

import os
import uuid
from github import Github
from prometheus_swarm.workflows.base import Workflow
from prometheus_swarm.utils.logging import log_key_value, log_error
from src.workflows.todocreator import phases
from prometheus_swarm.workflows.utils import (
    check_required_env_vars,
    cleanup_repository,
    validate_github_auth,
    setup_repository,
    get_current_files,
)
from src.workflows.todocreator.utils import (
    TaskModel,
    insert_task_to_mongodb,
    IssueModel,
    insert_issue_to_mongodb,
    SystemPromptModel,
    insert_system_prompt_to_mongodb,
)


class Task:
    def __init__(self, title: str, description: str, acceptance_criteria: list[str]):
        self.title = title
        self.description = description
        self.acceptance_criteria = acceptance_criteria

    def to_dict(self) -> dict:
        """Convert task to dictionary format."""
        return {
            "title": self.title,
            "description": self.description,
            "acceptance_criteria": self.acceptance_criteria,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Task":
        """Create task from dictionary."""
        return cls(
            title=data["title"],
            description=data["description"],
            acceptance_criteria=data["acceptance_criteria"],
        )


class TodoCreatorWorkflow(Workflow):
    def __init__(
        self,
        client,
        prompts,
        source_url,
        fork_url,
        issue_spec,
        bounty_id,
    ):
        # Extract owner and repo name from URL
        # URL format: https://github.com/owner/repo
        parts = source_url.strip("/").split("/")
        repo_owner = parts[-2]
        repo_name = parts[-1]
        fork_parts = fork_url.strip("/").split("/")
        fork_owner = fork_parts[-2]

        super().__init__(
            client=client,
            prompts=prompts,
            repo_url=source_url,
            repo_owner=repo_owner,
            repo_name=repo_name,
            fork_owner=fork_owner,
            fork_url=fork_url,
            bounty_id=bounty_id,
        )
        self.issue_spec = issue_spec

    def setup(self):
        """Set up repository and workspace."""
        check_required_env_vars(["GITHUB_TOKEN", "GITHUB_USERNAME"])
        validate_github_auth(os.getenv("GITHUB_TOKEN"), os.getenv("GITHUB_USERNAME"))

        # Get the default branch from GitHub
        try:
            gh = Github(os.getenv("GITHUB_TOKEN"))
            repo = gh.get_repo(
                f"{self.context['repo_owner']}/{self.context['repo_name']}"
            )
            self.context["base_branch"] = repo.default_branch
            log_key_value("Default branch", self.context["base_branch"])
        except Exception as e:
            log_error(e, "Failed to get default branch, using 'main'")
            self.context["base_branch"] = "main"

        # Set up repository directory
        setup_result = setup_repository(
            self.context["repo_url"],
            github_token=os.getenv("GITHUB_TOKEN"),
            github_username=os.getenv("GITHUB_USERNAME"),
        )
        if not setup_result["success"]:
            raise Exception(f"Failed to set up repository: {setup_result['message']}")

        self.context["repo_path"] = setup_result["data"]["clone_path"]
        self.original_dir = setup_result["data"]["original_dir"]

        # Enter repo directory
        os.chdir(self.context["repo_path"])

        # Get current files for context
        self.context["current_files"] = get_current_files()

        # Add feature spec to context
        self.context["issue_spec"] = self.issue_spec

    def cleanup(self):
        """Cleanup workspace."""
        # Make sure we're not in the repo directory before cleaning up
        cleanup_repository(self.original_dir, self.context.get("repo_path", ""))

    def run(self):
        generate_issues_result = self.generate_issues()
        tasks = []
        for issue in generate_issues_result["data"]["issues"]:
            self.context["feature_spec"] = issue
            task_result = self.generate_tasks(issue["uuid"])
            if task_result:
                tasks.append(task_result["data"]["tasks"])

        # Generate a single system prompt for all issues and tasks
        system_prompt_result = self.generate_system_prompts(
            generate_issues_result["data"]["issues"], tasks
        )

        return {
            "success": True,
            "message": "Issue generation workflow completed",
            "data": {
                "issues": generate_issues_result["data"]["issues"],
                "tasks": [
                    [task.to_dict() for task in task_list] for task_list in tasks
                ],
                "system_prompt": (
                    system_prompt_result["data"]["prompt"]
                    if system_prompt_result
                    else None
                ),
                "issue_spec": self.issue_spec,
                "repo_owner": self.context["repo_owner"],
                "repo_name": self.context["repo_name"],
            },
        }

    def generate_issues(self):
        """Execute the issue generation workflow."""

        issues = []
        try:
            self.setup()
            # ==================== Generate issues ====================
            generate_issues_phase = phases.IssueGenerationPhase(workflow=self)
            generate_issues_result = generate_issues_phase.execute()
            # Check Issue Generation Result
            if not generate_issues_result or not generate_issues_result.get("success"):
                log_error(
                    Exception(generate_issues_result.get("error", "No result")),
                    "Issue generation failed",
                )
                return None

            # TODO: save it to db
            previous_issue_uuid = None
            for issue in generate_issues_result["data"]["issues"]:
                issue_model = IssueModel(
                    title=issue["title"],
                    description=issue["description"],
                    repoOwner=self.context["repo_owner"],
                    repoName=self.context["repo_name"],
                    uuid=issue["uuid"],
                    bountyId=self.context["bounty_id"],
                    forkOwner=self.context["fork_owner"],
                    forkUrl=self.context["fork_url"],
                    predecessorUuid=previous_issue_uuid,
                )
                insert_issue_to_mongodb(issue_model)
                previous_issue_uuid = issue["uuid"]
                # print("Issue inserted to MongoDB")
            return generate_issues_result
        except Exception as e:
            log_error(e, "Issue generation workflow failed")
            print(e)
            return {
                "success": False,
                "message": f"Issue generation workflow failed: {str(e)}",
                "data": {"issues": issues},
            }

    def generate_tasks(self, issue_uuid):
        """Execute the task decomposition workflow."""
        tasks = []
        try:
            self.setup()
            # ==================== Decompose feature into tasks ====================
            decompose_phase = phases.TaskDecompositionPhase(workflow=self)
            decomposition_result = decompose_phase.execute()
            # Check Decomposition Result
            if not decomposition_result or not decomposition_result.get("success"):
                log_error(
                    Exception(decomposition_result.get("error", "No result")),
                    "Task decomposition failed",
                )
                return None

            # Temporary save the tasks data in a variable
            tasks_data = decomposition_result["data"].get("tasks", [])
            task_count = decomposition_result["data"].get("task_count", 0)
            # Check Decomposition Result
            if not tasks_data:
                log_error(
                    Exception("No tasks generated"),
                    "Task decomposition failed",
                )
                return None
            log_key_value("Tasks created Number", task_count)

            # Save the tasks data in the context, prepare for the validation phase
            self.context["subtasks"] = tasks_data
            log_key_value("Subtasks Number", len(self.context["subtasks"]))

            # ==================== Validation phase ====================
            validation_phase = phases.TaskValidationPhase(workflow=self)
            validation_result = validation_phase.execute()

            if not validation_result or not validation_result.get("success"):
                log_error(
                    Exception(validation_result.get("error", "No result")),
                    "Task validation failed",
                )
                return None

            # Get the decisions from the validation result
            decisions = validation_result["data"]["decisions"]

            # TODO: Rework until all the tasks are valid
            # save the audited tasks in the context, prepare for the regeneration phase
            self.context["auditedSubtasks"] = []
            # decisions_flag =  True
            for task_uuid, decision in decisions.items():
                # decision["decision"] = False
                if not decision["decision"]:
                    task = next(
                        (task for task in tasks_data if task["uuid"] == task_uuid), None
                    )
                    if task:
                        self.context["auditedSubtasks"].append(task)
                    # decisions_flag = False

            # save the decisions in the context, prepare for the regeneration phase
            self.context["feedbacks"] = decisions

            # ==================== Regeneration phase ====================
            if len(self.context["auditedSubtasks"]) > 0:
                regenerate_phase = phases.TaskRegenerationPhase(workflow=self)
                regenerate_result = regenerate_phase.execute()
                if not regenerate_result or not regenerate_result.get("success"):
                    log_error(
                        Exception(regenerate_result.get("error", "No result")),
                        "Task regeneration failed",
                    )
                # replace the tasks with the new tasks
                regenerated_tasks_data = regenerate_result["data"]["tasks"]
                # replace the self.context["subtasks"] with the new tasks
                for task in regenerated_tasks_data:
                    index = next(
                        (
                            i
                            for i, t in enumerate(tasks_data)
                            if t["uuid"] == task["uuid"]
                        ),
                        None,
                    )
                    if index is not None:
                        # decisions[task["uuid"]]["decision"] = True
                        tasks_data[index] = task
                    else:
                        tasks_data.append(task)
            log_key_value("Regenerated tasks", len(tasks_data))
            # save the regenerated tasks in the context, prepare for the dependency phase
            self.context["subtasks"] = tasks_data
            # ==================== Dependency Phase ====================
            # # TODO: Refine the Dependency Phase
            for task in tasks_data:
                self.context["target_task"] = task
                dependency_phase = phases.TaskDependencyPhase(workflow=self)
                dependency_result = dependency_phase.execute()
                if dependency_result is None or not dependency_result.get("success"):
                    log_error(
                        Exception(
                            dependency_result.get("error", "No result")
                            if dependency_result
                            else "No results returned from phase"
                        ),
                        "Task dependency failed, continuing with empty dependencies",
                    )
                    task["dependency_tasks"] = []
                    continue
                # save the dependency tasks in the context, prepare for the MongoDB insertion phase
                try:
                    task["dependency_tasks"] = dependency_result["data"][task["uuid"]]
                except Exception as e:
                    log_error(e, "Task dependency failed for task: " + task["title"])
                    task["dependency_tasks"] = []

            # ==================== MongoDB Insertion Phase ====================
            # Insert into MongoDB
            for task in tasks_data:
                try:
                    # Check if task UUID exists in decisions and has a decision value
                    if task["uuid"] in decisions and decisions[task["uuid"]].get(
                        "decision", False
                    ):
                        task_model = TaskModel(
                            title=task["title"],
                            description=task["description"],
                            acceptanceCriteria="\n".join(task["acceptance_criteria"]),
                            repoOwner=self.context["repo_owner"],
                            repoName=self.context["repo_name"],
                            dependencyTasks=task["dependency_tasks"],
                            uuid=task["uuid"],
                            issueUuid=issue_uuid,
                            bountyId=self.context["bounty_id"],
                        )
                        insert_task_to_mongodb(task_model)
                except Exception as e:
                    log_error(
                        e,
                        f"Failed to process task {task.get('title', 'unknown')} "
                        f"with UUID {task.get('uuid', 'unknown')}",
                    )
                    continue

            # Return the final result
            return {
                "success": True,
                "message": f"Created {task_count} tasks for the feature",
                "data": {"tasks": tasks},
            }

        except Exception as e:
            log_error(e, "Task decomposition workflow failed")
            return {
                "success": False,
                "message": f"Task decomposition workflow failed: {str(e)}",
                "data": None,
            }
        finally:
            self.cleanup()

    def generate_system_prompts(self, issues, tasks):
        """Execute the system prompt generation workflow."""
        try:
            # Set up context for system prompt generation
            self.context["tasks"] = tasks
            self.context["issues"] = issues
            self.context["issue_spec"] = self.issue_spec

            # Generate system prompt
            system_prompt_phase = phases.SystemPromptGenerationPhase(workflow=self)
            system_prompt_result = system_prompt_phase.execute()

            if not system_prompt_result or not system_prompt_result.get("success"):
                log_error(
                    Exception(system_prompt_result.get("error", "No result")),
                    "System prompt generation failed",
                )
                return None

            # Insert system prompt into MongoDB
            try:
                system_prompt_model = SystemPromptModel(
                    prompt=system_prompt_result["data"]["prompt"],
                    bountyId=self.context["bounty_id"],
                )
                insert_system_prompt_to_mongodb(system_prompt_model)
            except Exception as e:
                log_error(e, "Failed to insert system prompt into MongoDB")
                # Continue even if MongoDB insertion fails
                pass

            return system_prompt_result
        except Exception as e:
            log_error(e, "System prompt generation workflow failed")
            print(e)
            return {
                "success": False,
                "message": f"System prompt generation workflow failed: {str(e)}",
                "data": {"prompt": None},
            }
