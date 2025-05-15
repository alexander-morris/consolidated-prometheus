import os
import requests
import datetime
import json # For schema validation if desired, though not strictly enforced by this client.

class OrcaTaskClient:
    """
    Client for an Orca Task (running in a Docker container) to send standardized messages
    back to its parent Koii Node task executable via a local callback URL.
    """
    def __init__(self, callback_url: str = None, task_id: str = None):
        """
        Initializes the OrcaTaskClient.

        Args:
            callback_url (str, optional): The callback URL for the parent Koii Node listener.
                                         If None, reads from PARENT_NODE_CALLBACK_URL env var.
            task_id (str, optional): The ID of this Orca task instance.
                                     If None, reads from ORCA_TASK_ID env var.
        Raises:
            ValueError: If the callback_url is not found or provided.
        """
        self.callback_url = callback_url or os.environ.get("PARENT_NODE_CALLBACK_URL")
        self.task_id = task_id or os.environ.get("ORCA_TASK_ID")
        
        if not self.callback_url:
            # Fallback for local testing if env var isn't set, print warning
            print("Warning: PARENT_NODE_CALLBACK_URL not found in environment or provided. "
                  "Attempting to use http://127.0.0.1:3000/mock_orca_callback as a fallback for local testing.")
            self.callback_url = "http://127.0.0.1:3000/mock_orca_callback"
            # raise ValueError("PARENT_NODE_CALLBACK_URL not found in environment or provided.")

        if not self.task_id:
            print("Warning: ORCA_TASK_ID not found in environment or provided. Using 'unknown_orca_task'.")
            self.task_id = "unknown_orca_task"

    def _send_message(self, event_type: str, payload: dict):
        """
        Internal method to construct and send a message.
        """
        message = {
            "taskId": self.task_id,
            "eventType": event_type,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z", # ISO 8601 format with Z for UTC
            "payload": payload
        }
        
        # Optional: Validate message against message_schema.json here
        # For now, we assume the calling methods construct valid payloads based on event_types.md

        try:
            # print(f"OrcaTaskSDK: Sending {event_type} to {self.callback_url} with payload: {json.dumps(payload)}")
            response = requests.post(self.callback_url, json=message, timeout=10)
            response.raise_for_status() # Raises an HTTPError for bad responses (4XX or 5XX)
            # print(f"OrcaTaskSDK: Message sent successfully. Response: {response.text}")
            try:
                return response.json()
            except json.JSONDecodeError:
                return {"status": "success", "raw_response": response.text } # Return raw if not json
        except requests.exceptions.RequestException as e:
            print(f"OrcaTaskSDK: Error sending message type {event_type}: {e}")
            # Consider a retry mechanism or more robust error logging/handling for production
            return None

    def send_status_update(self, message: str, progress: int = None):
        """
        Sends a status_update message.

        Args:
            message (str): Descriptive status message.
            progress (int, optional): Numerical progress (e.g., 0-100).
        """
        payload = {"message": message}
        if progress is not None:
            if not (isinstance(progress, int) and 0 <= progress <= 100):
                # print("Warning: Progress should be an integer between 0 and 100.") # Or raise error
                pass # Allow it for now, receiver should validate if strict
            payload["progress"] = progress
        return self._send_message("status_update", payload)

    def send_log_entry(self, level: str, message: str, details: dict = None):
        """
        Sends a log_entry message.

        Args:
            level (str): Log level, e.g., "info", "warn", "error".
            message (str): The log message content.
            details (dict, optional): Additional structured data for the log.
        """
        if level not in ["info", "warn", "error"]:
            # print(f"Warning: Invalid log level '{level}'. Defaulting to 'info'.") # Or raise error
            # level = "info"
            pass # Allow it for now, receiver should validate
        payload = {"level": level, "message": message}
        if details is not None:
            payload["details"] = details
        return self._send_message("log_entry", payload)
    
    def send_task_result(self, status: str, result_data: dict = None, error_message: str = None):
        """
        Sends a task_result message.

        Args:
            status (str): Outcome status, e.g., "completed", "failed".
            result_data (dict, optional): The actual results. Defaults to {}.
            error_message (str, optional): Error message if status is "failed".
        """
        if status not in ["completed", "failed"]:
            # print(f"Warning: Invalid task result status '{status}'.") # Or raise error
            pass # Allow it for now
        
        payload = {"status": status, "result_data": result_data if result_data is not None else {}}
        if error_message is not None:
            payload["error_message"] = error_message
        return self._send_message("task_result", payload)

    def send_task_error(self, message: str, error_details: dict = None, stack_trace: str = None):
        """
        Sends a task_error message.

        Args:
            message (str): Descriptive error message.
            error_details (dict, optional): Additional structured error information.
            stack_trace (str, optional): Stack trace, if available.
        """
        payload = {"message": message}
        if error_details is not None:
            payload["error_details"] = error_details
        if stack_trace is not None:
            payload["stack_trace"] = stack_trace
        return self._send_message("task_error", payload)

if __name__ == '__main__':
    # Example Usage (for testing purposes - requires a listener at the callback URL)
    # Set environment variables for testing if not run by Koii Node:
    # export PARENT_NODE_CALLBACK_URL='http://127.0.0.1:3000/mock_orca_callback'
    # export ORCA_TASK_ID='test-orca-python-sdk-001'
    
    print(f"Attempting to use callback URL: {os.environ.get('PARENT_NODE_CALLBACK_URL')}")
    print(f"Attempting to use task ID: {os.environ.get('ORCA_TASK_ID')}")

    client = OrcaTaskClient()

    print("\nSending status update...")
    client.send_status_update("Initializing Python SDK test.", progress=0)
    client.send_status_update("Halfway through Python SDK test.", progress=50)
    client.send_status_update("Almost done with Python SDK test.", progress=99)

    print("\nSending log entries...")
    client.send_log_entry("info", "This is an informational message from Python SDK.", details={"source": "sdk_test_script"})
    client.send_log_entry("warn", "This is a warning message from Python SDK.")
    client.send_log_entry("error", "This is an error message from Python SDK.", details={"code": 123, "reason": "test_failure"})
    client.send_log_entry("debug", "This is a debug log, but SDK will pass it as is.") # Test invalid level

    print("\nSending task result (completed)...")
    client.send_task_result(status="completed", result_data={"output_value": "some_result", "files_generated": ["a.txt", "b.txt"]})

    print("\nSending task result (failed)...")
    client.send_task_result(status="failed", error_message="Something went wrong during processing.", result_data={"attempted_items": 10})

    print("\nSending task error...")
    client.send_task_error(
        message="An unexpected exception occurred.", 
        error_details={"type": "ValueError", "module": "example_module"},
        stack_trace="Traceback (most recent call last):\n  File \"example.py\", line 123, in <module>\n    raise ValueError(\"A test error\")\nValueError: A test error"
    )
    
    print("\nPython SDK tests finished. Check your listener.") 