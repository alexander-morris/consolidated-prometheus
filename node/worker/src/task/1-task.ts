import { getOrcaClient } from "@_koii/task-manager/extensions";
import { namespaceWrapper, TASK_ID } from "@_koii/namespace-wrapper";
import { triggerAuditUpdate } from "../utils/auditUpdate";
import { createAggregatorRepo } from "../utils/aggregatorRepo";
import "dotenv/config";

// --- ADD SDK IMPORT ---
// Adjust path based on your final project structure and how you build/link the SDK
// Assuming task_sdk is a sibling to the 'node' directory and using relative paths for now.
// For a proper build, this might be an npm package import if you publish the SDK.
import { TaskEventHandler, OrcaToTaskMessage, LogEntryPayload, NamespaceLike } from "../../../../task_sdk/typescript/src"; // Adjust path as needed
import { LogLevel } from '@koii-network/task-node'; // For custom handlers if they use LogLevel
// --- END SDK IMPORT ---

interface PodCallBody {
  taskId: string;
  roundNumber: number;
  stakingKey: string;
  pubKey: string;
  stakingSignature: string;
  publicSignature: string;
  addPRSignature: string;
}

// --- SDK SETUP ---
// It's crucial to get the actual Namespace instance provided by the Koii Node environment.
// The koii-node/src/main/controllers/startTask.ts creates a Namespace instance
// and it becomes available in the forked task process's global scope or via arguments.
// This is a placeholder for how that instance is accessed. 
// It might be `globalThis.namespaceInstance` or passed in some other way by the task runner.

// Try to access the namespace instance (this is highly dependent on the task runner environment)
const getNamespace = (): NamespaceLike | null => {
    if ((globalThis as any).namespace) {
        return (globalThis as any).namespace as NamespaceLike;
    }
    // In koii-node, it seems `namespaceInstance` is made global from `main/node/helpers/Namespace.ts`
    // This is a guess based on Koii Node structure. Actual availability needs verification.
    if ((globalThis as any).namespaceInstance) {
        console.log("[Task SDK] Found globalThis.namespaceInstance");
        return (globalThis as any).namespaceInstance as NamespaceLike;
    }
    // Add other potential ways the namespace object might be exposed to the task script
    console.warn("[Task SDK] Namespace instance not found in globalThis.namespace or globalThis.namespaceInstance. GUI notifications from SDK might not work correctly.");
    return null;
};

const namespaceInstance = getNamespace();
let taskEventHandler: TaskEventHandler | null = null;

if (namespaceInstance) {
    taskEventHandler = new TaskEventHandler(namespaceInstance);
    console.log("[Task SDK] TaskEventHandler initialized.");

    // ** CRITICAL INTEGRATION POINT: How messages from Orca get to this process **
    // This needs to be confirmed based on how @_koii/orca-node (or task-manager)
    // actually bridges messages from its local listener to this forked JS process.
    // 
    // OPTION 1: Using process.on('message') - Most common for forked processes
    process.on('message', (message: any) => {
        console.log('[Task SDK] Received IPC message from parent/bridge:', message);
        // Add a check to ensure it's an OrcaToTaskMessage structure before passing
        if (message && message.eventType && message.payload && message.taskId) {
            taskEventHandler?.handleIncomingMessage(message as OrcaToTaskMessage);
        } else {
            console.warn('[Task SDK] Received IPC message that does not look like an OrcaToTaskMessage:', message);
        }
    });
    console.log("[Task SDK] Attached IPC message listener (process.on('message')).");

    // OPTION 2: If @_koii/orca-node uses a global event emitter (example name)
    // if ((globalThis as any).orcaMessageEmitter && typeof (globalThis as any).orcaMessageEmitter.on === 'function') {
    //     console.log("[Task SDK] Found global orcaMessageEmitter. Attaching listener.");
    //     (globalThis as any).orcaMessageEmitter.on('orcaAgentMessage', (message: OrcaToTaskMessage) => {
    //         taskEventHandler?.handleIncomingMessage(message);
    //     });
    // }

    // Example of registering a custom handler for a specific Orca event type
    taskEventHandler.on<LogEntryPayload>("log_entry", (payload, fullMessage) => {
        // Custom logic for log_entry if needed, beyond the default GUI notification
        console.log(`[Task SDK Custom Handler] Orca Log for ${fullMessage.taskId}: [${payload.level}] ${payload.message}`);
        // If you want to prevent the default handler (which calls notifyGui), you might need a flag or specific SDK design.
        // For now, default handler will also run and call notifyGui.
    });

} else {
    console.error("[Task SDK] Could not initialize TaskEventHandler because Namespace instance was not found.");
}
// --- END SDK SETUP ---

export async function task(roundNumber: number): Promise<void> {
  /**
   * Run your task and store the proofs to be submitted for auditing
   * It is expected you will store the proofs in your container
   * The submission of the proofs is done in the submission function
   */
  console.log(`[Worker Task] EXECUTE TASK FOR ROUND ${roundNumber}`);
  taskEventHandler?.notifyGui(LogLevel.Info, `Worker task round ${roundNumber} started execution.`, "TaskRoundStart");

  try {
    const orcaClient = await getOrcaClient();
    if (!orcaClient) {
        taskEventHandler?.notifyGui(LogLevel.Error, "Failed to get Orca client.", "OrcaClientError");
        throw new Error("No Orca Client available in worker task");
    }
    const stakingKeypair = await namespaceWrapper.getSubmitterAccount();
    if (!stakingKeypair) {
      taskEventHandler?.notifyGui(LogLevel.Error, "No staking keypair found.", "StakingKeypairError");
      throw new Error("No staking keypair found");
    }

    const stakingKey = stakingKeypair.publicKey.toBase58();
    const pubKey = await namespaceWrapper.getMainAccountPubkey();
    if (!pubKey) {
      taskEventHandler?.notifyGui(LogLevel.Error, "No main account public key found.", "MainPubkeyError");
      throw new Error("No public key found");
    }

    taskEventHandler?.send_status_update( // Assuming TaskEventHandler gets send_status_update etc.
        `Preparing to create aggregator repo for round ${roundNumber}.`, 10
    ); // This method doesn't exist on TaskEventHandler, this is conceptual for direct call to orca-agent
       // Correct usage for task -> GUI: taskEventHandler?.notifyGui(LogLevel.Info, msg, action)

    await createAggregatorRepo(orcaClient, roundNumber, stakingKey, pubKey, stakingKeypair.secretKey);
    taskEventHandler?.notifyGui(LogLevel.Info, `Aggregator repo creation process initiated for round ${roundNumber}.`, "AggregatorRepoStart");

    if (roundNumber >= 4) {
      taskEventHandler?.notifyGui(LogLevel.Info, `Triggering audit update for past round ${roundNumber - 4}.`, "AuditUpdateTrigger");
      await triggerAuditUpdate(TASK_ID || "", roundNumber - 4, stakingKeypair, orcaClient);
    }

    taskEventHandler?.notifyGui(LogLevel.Info, `Attempting to run leader task logic for round ${roundNumber}.`, "LeaderTaskAttempt");
    const leaderPrUrl = await runTask(roundNumber, "leader", orcaClient, stakingKey, pubKey, stakingKeypair.secretKey);
    if (!leaderPrUrl) {
      taskEventHandler?.notifyGui(LogLevel.Info, `Leader task did not produce PR, attempting worker task logic for round ${roundNumber}.`, "WorkerTaskAttempt");
      const workerPrUrl = await runTask(
        roundNumber,
        "worker",
        orcaClient,
        stakingKey,
        pubKey,
        stakingKeypair.secretKey,
      );
      if (!workerPrUrl) {
        taskEventHandler?.notifyGui(LogLevel.Warn, `Neither leader nor worker task produced a PR for round ${roundNumber}.`, "NoPRProduced");
        console.log("[Worker Task] Did not create PR for round", roundNumber);
      } else {
        taskEventHandler?.notifyGui(LogLevel.Info, `Worker task produced PR: ${workerPrUrl} for round ${roundNumber}.`, "WorkerPRCreated");
      }
    } else {
      taskEventHandler?.notifyGui(LogLevel.Info, `Leader task produced PR: ${leaderPrUrl} for round ${roundNumber}.`, "LeaderPRCreated");
    }
    taskEventHandler?.notifyGui(LogLevel.Info, `Worker task round ${roundNumber} completed execution phase.`, "TaskRoundEnd");

  } catch (error) {
    console.error("[Worker Task] EXECUTE TASK ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    taskEventHandler?.notifyGui(LogLevel.Error, `Worker task round ${roundNumber} failed: ${errorMessage}`, "TaskRoundError");
    // Potentially rethrow or handle as per task requirements
  }
}

async function runTask(
  roundNumber: number,
  taskType: "worker" | "leader",
  orcaClient: any, // Type this if possible, e.g., from @_koii/task-manager/extensions
  stakingKey: string,
  pubKey: string,
  secretKey: Uint8Array,
): Promise<string | null> {
  const sdkFriendlyTaskType = taskType.charAt(0).toUpperCase() + taskType.slice(1);
  taskEventHandler?.notifyGui(LogLevel.Info, `runTask: ${sdkFriendlyTaskType} type for round ${roundNumber} initiated.`, `Run${sdkFriendlyTaskType}Start`);
  try {
    const taskConfig = {
      worker: {
        fetchAction: "fetch-todo",
        addAction: "add-todo-pr",
        endpoint: `worker-task/${roundNumber}`,
      },
      leader: {
        fetchAction: "fetch-issue",
        addAction: "add-issue-pr",
        endpoint: `leader-task/${roundNumber}`,
      },
    };
    const fetchTodoPayload = {
      taskId: TASK_ID,
      roundNumber,
      githubUsername: process.env.GITHUB_USERNAME,
      stakingKey,
      pubKey,
      action: taskConfig[taskType].fetchAction,
    };
    const addPRPayload = {
      taskId: TASK_ID,
      roundNumber,
      githubUsername: process.env.GITHUB_USERNAME,
      stakingKey,
      pubKey,
      action: taskConfig[taskType].addAction,
    };

    const stakingSignature = await namespaceWrapper.payloadSigning(fetchTodoPayload, secretKey);
    const publicSignature = await namespaceWrapper.payloadSigning(fetchTodoPayload);
    const addPRSignature = await namespaceWrapper.payloadSigning(addPRPayload, secretKey);

    if (!stakingSignature || !publicSignature || !addPRSignature) {
      throw new Error("Signature generation failed");
    }

    const podCallBody: PodCallBody = {
      taskId: TASK_ID!,
      roundNumber,
      stakingKey,
      pubKey,
      stakingSignature,
      publicSignature,
      addPRSignature,
    };

    // Example of where Orca might be called and then would use Python SDK to send messages back
    // The OrcaTaskClient (Python) would send messages like "status_update" or "log_entry"
    // which would then be handled by `taskEventHandler.handleIncomingMessage` if the bridge is set up.
    taskEventHandler?.notifyGui(LogLevel.Info, `runTask: Preparing podCall for ${sdkFriendlyTaskType} - ${taskConfig[taskType].endpoint}.`, `Run${sdkFriendlyTaskType}PodCallPrep`);
    const response = await orcaClient.podCall(taskConfig[taskType].endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(podCallBody),
    });

    if (response?.data?.success) {
      taskEventHandler?.notifyGui(LogLevel.Info, `runTask: ${sdkFriendlyTaskType} podCall successful, PR URL: ${response.data.pr_url}.`, `Run${sdkFriendlyTaskType}PodCallSuccess`);
      return response.data.pr_url;
    } else {
      const errorDetail = response?.data?.error || "Unknown error from podCall";
      console.error(`[Worker Task] ${taskType} task podCall failed:`, errorDetail);
      taskEventHandler?.notifyGui(LogLevel.Error, `runTask: ${sdkFriendlyTaskType} podCall failed: ${errorDetail}`, `Run${sdkFriendlyTaskType}PodCallFail`);
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Worker Task] ${taskType} task error in runTask:`, error);
    taskEventHandler?.notifyGui(LogLevel.Error, `runTask: Error in ${sdkFriendlyTaskType} logic: ${errorMessage}`, `Run${sdkFriendlyTaskType}Error`);
    return null;
  }
}

// The submission, audit, distribution, routes, and setup functions are not directly instrumented here
// as they don't typically involve direct, ongoing communication with an Orca agent
// in the same way `1-task.ts` does during its execution phase.
// If they do trigger long-running Orca processes that should report back, they'd need similar SDK setup.
