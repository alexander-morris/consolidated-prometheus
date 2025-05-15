import os
import sys
import json # For printing JSON to stdout
import datetime
import time

# No longer importing OrcaTaskClient directly, 
# as this script will now just format the message and print to stdout
# for the orchestrator to pick up and send via IPC.

# This script will now print multiple JSON messages, one per line, to stdout.
# The orchestrator will need to process stdout line by line.

def create_message(task_id: str, event_type: str, payload: dict) -> dict:
    return {
        "taskId": task_id,
        "eventType": event_type,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "payload": payload
    }

def main():
    print("[MockOrcaAgent] Starting mock orca agent (direct stdout mode for E2E - Full Suite).", file=sys.stderr) # Log to stderr
    
    # ORCA_TASK_ID is still needed for the message content
    task_id = os.environ.get("ORCA_TASK_ID")
    if not task_id:
        print("[MockOrcaAgent] WARNING: ORCA_TASK_ID environment variable not set. Using default.", file=sys.stderr)
        task_id = "e2e_full_suite_orca_task"

    print(f"[MockOrcaAgent] Using Task ID: {task_id}", file=sys.stderr)

    messages_to_send = []

    # 1. Status Update
    messages_to_send.append(create_message(task_id, "status_update", {
        # This specific phrasing/progress is expected by Scenario S3 assertions in run_e2e_test.js
        "message": "MockOrcaAgent (direct stdout) reporting: E2E Test Status Update",
        "progress": 33
    }))

    # 2. Log Entry (Info)
    messages_to_send.append(create_message(task_id, "log_entry", {
        "level": "info",
        "message": "This is an informational log from MockOrcaAgent for E2E-S4.",
        "details": {"scenario": "S4", "step": "log_info"}
    }))
    
    # 3. Status Update (mid-progress)
    messages_to_send.append(create_message(task_id, "status_update", {
        "message": "MockOrcaAgent E2E-S4: Processing data...",
        "progress": 55
    }))

    # 4. Log Entry (Warn)
    messages_to_send.append(create_message(task_id, "log_entry", {
        "level": "warn",
        "message": "This is a warning log from MockOrcaAgent for E2E-S4."
    }))

    # 5. Task Error (simulated non-fatal)
    messages_to_send.append(create_message(task_id, "task_error", {
        "message": "Simulated non-fatal error during E2E-S4.",
        "error_details": {"code": "NET_TEMP_FAIL", "recoverable": True},
        "stack_trace": "Traceback: ...\n  File \"mock_module.py\", line 42, in process_data\n    something_failed_temporarily()"
    }))

    # 6. Log Entry (Error)
    messages_to_send.append(create_message(task_id, "log_entry", {
        "level": "error",
        "message": "This is an error log from MockOrcaAgent for E2E-S4, after simulated task_error.",
        "details": {"related_event": "previous_task_error"}
    }))

    # 7. Task Result (Completed)
    messages_to_send.append(create_message(task_id, "task_result", {
        "status": "completed",
        "result_data": {"output_value": "E2E-S4_SUCCESS", "items_processed": 120}
    }))
    
    # 8. Task Result (Failed) - example, typically one result per task run
    # messages_to_send.append(create_message(task_id, "task_result", {
    #     "status": "failed",
    #     "error_message": "Simulated failure for E2E-S4 result.",
    #     "result_data": {"items_processed": 60}
    # }))

    for msg in messages_to_send:
        print(json.dumps(msg)) # Print each JSON message to STDOUT on a new line
        sys.stdout.flush() # Ensure it gets sent immediately
        time.sleep(0.1) # Small delay between messages to make them distinct events if needed

    print(f"[MockOrcaAgent] All {len(messages_to_send)} messages printed to stdout for E2E-S4. Exiting.", file=sys.stderr)

if __name__ == "__main__":
    main() 