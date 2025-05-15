# Orca Task Python SDK (`orca_task_sdk`)

This Python SDK provides a client for Orca tasks (running in Docker containers) to send standardized messages back to their parent Koii Node task executable.

## Features

-   Standardized message formatting for status updates, logs, task results, and errors.
-   Reads necessary configuration (callback URL, task ID) from environment variables typically provided by the Koii Node environment.
-   Simple API for sending different types of events.

## Installation

This SDK is intended to be used within the Python environment of an Orca task container.

If running locally for development/testing outside of the full Koii Node, you can install it in editable mode from the `task_sdk/python/` directory:

```bash
# Ensure you are in the task_sdk/python/ directory
# Create and activate a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate # or .venv\Scripts\activate on Windows

# Install in editable mode
pip install -e .
```

For inclusion in a Docker image for an Orca task, you would typically copy the `task_sdk/python/` directory (or just its `src/orca_task_sdk` subdirectory and `setup.py`) into your Docker image and run `pip install .` during the build process.

**Dependencies:**
*   `requests`

## Usage

### Initialization

The `OrcaTaskClient` reads the `PARENT_NODE_CALLBACK_URL` and `ORCA_TASK_ID` environment variables automatically upon initialization. These variables are expected to be set by the Koii Node task runner when the Orca container is launched.

```python
from orca_task_sdk.client import OrcaTaskClient

# Instantiate the client
# It will automatically try to pick up PARENT_NODE_CALLBACK_URL and ORCA_TASK_ID from env vars.
client = OrcaTaskClient()

# If you need to override them (e.g., for testing):
# client = OrcaTaskClient(
#    callback_url="http://my-custom-listener:1234/callback", 
#    task_id="my-specific-task-instance-001"
# )
```

If `PARENT_NODE_CALLBACK_URL` is not set, the client will default to `http://127.0.0.1:3000/mock_orca_callback` and print a warning (useful for local testing with `mock_listener.py`). If `ORCA_TASK_ID` is not set, it defaults to `"unknown_orca_task"` with a warning.

### Sending Messages

All send methods return the JSON response from the callback URL if successful (and the response is JSON), or `None` if an error occurs during sending.

**1. Status Update**

```python
client.send_status_update(message="Processing item 10 of 100", progress=10)
client.send_status_update(message="Initialization complete")
```

**2. Log Entry**

```python
client.send_log_entry(level="info", message="Standard informational log.")
client.send_log_entry(level="warn", message="A potential issue was detected.")
client.send_log_entry(level="error", message="An error occurred during processing.", details={"error_code": 500, "module": "data_processor"})
```
Valid levels are `"info"`, `"warn"`, `"error"` as per the interface definition.

**3. Task Result**

Used to signal the completion (successful or failed) of the task's primary work.

```python
# Successful completion
client.send_task_result(
    status="completed", 
    result_data={"output_cid": "bafybeiccfzaz35esphbeu5yqtohgxxcoolis5a5n46kfbfui2hdjbhs3pu", "items_processed": 100}
)

# Failed completion
client.send_task_result(
    status="failed", 
    error_message="Could not process the final dataset due to data corruption.",
    result_data={"items_processed": 50, "items_failed": 50}
)
```
Valid status values are `"completed"`, `"failed"`.

**4. Task Error**

Used to report unexpected errors or exceptions.

```python
import traceback

try:
    # ... some operation that might fail ...
    risky_operation()
except Exception as e:
    client.send_task_error(
        message=f"An unexpected error occurred: {str(e)}", 
        error_details={"type": type(e).__name__}, 
        stack_trace=traceback.format_exc()
    )
```

## Message Contract

All messages sent by this SDK adhere to the schema defined in `task_sdk/interface/message_schema.json` and use event types and payload structures documented in `task_sdk/interface/event_types.md`.

## Development & Testing

To run unit tests:

```bash
cd task_sdk/python/
# (Activate virtual environment if you have one)
python3 -m unittest discover tests
```

To run integration tests (requires Flask to be installed in the venv):

1.  The integration test script (`tests/test_client_integration.py`) will attempt to start `tests/mock_listener.py` automatically.
2.  Ensure Flask is installed: `pip install Flask`
3.  Run the tests:
    ```bash
    python3 -m unittest discover tests
    ```

If `PARENT_NODE_CALLBACK_URL` is not set during testing, the `OrcaTaskClient` defaults to `http://127.0.0.1:3000/mock_orca_callback`, and the `mock_listener.py` also defaults to port 3000. The integration tests specifically run the mock listener on port 3001 to avoid conflicts and ensure they target the correct instance. 