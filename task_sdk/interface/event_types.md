# Orca-to-Task Event Types and Payloads

This document describes the different `eventType` values used in messages sent from the Orca agent (Docker container) to its parent JS `task` executable, and the expected structure of their `payload`.

All messages adhere to the schema defined in `message_schema.json`.

## Common Message Structure

```json
{
  "taskId": "string",         // ID of the Orca task instance
  "eventType": "string",       // One of the types below
  "timestamp": "string",       // ISO 8601 format (e.g., "2023-10-27T10:30:00Z")
  "payload": {}
}
```

## Event Types

### 1. `status_update`

Indicates a change in the task's operational status or progress.

*   **`eventType`**: `"status_update"`
*   **`payload` structure**:
    ```json
    {
      "message": "string",    // Descriptive status message (e.g., "Processing item 5/100", "Initializing resources")
      "progress": "number"     // Optional. A numerical value indicating progress (e.g., 0-100 for percentage)
    }
    ```

### 2. `log_entry`

Used for sending log messages from the Orca agent.

*   **`eventType`**: `"log_entry"`
*   **`payload` structure**:
    ```json
    {
      "level": "string",      // Log level: "info", "warn", "error"
      "message": "string",    // The log message content
      "details": "object"     // Optional. Any additional structured data related to the log entry
    }
    ```

### 3. `task_result`

Sent when the Orca agent has completed its primary work, successfully or with failure.

*   **`eventType`**: `"task_result"`
*   **`payload` structure**:
    ```json
    {
      "status": "string",      // Outcome status: "completed", "failed"
      "result_data": "object",  // Optional (but typically present on "completed"). The actual results produced by the task (e.g., {"cid": "bafy...", "outputValue": 42}).
      "error_message": "string" // Optional (but typically present on "failed"). A descriptive error message if the task failed.
    }
    ```

### 4. `task_error`

Reports an unexpected error or exception that occurred within the Orca agent, potentially a non-terminal one or one that prevents `task_result` from being sent.

*   **`eventType`**: `"task_error"`
*   **`payload` structure**:
    ```json
    {
      "message": "string",          // Descriptive error message
      "error_details": "object",    // Optional. Additional structured information about the error.
      "stack_trace": "string"       // Optional. Stack trace, if available.
    }
    ``` 