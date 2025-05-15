# Plan: SDK for Orca-Agent to Task Communication

## 1. Introduction & Goals

This document outlines a plan to create a generalized Software Development Kit (SDK) to standardize communication between the Python-based `orca-agent` (Docker container) and its parent TypeScript-based `task` executable (the forked JS process running within the Koii Node GUI environment).

**References:** This plan is based on the understanding developed in `orca-integration.md`, `plan-gemini.md`, and analysis of the `koii-node` and `pro-me-the-us/node` repositories.

**Goals:**
*   **Standardize Message Structure**: Define a clear, versioned contract for messages (status updates, logs, results, errors) exchanged between the `orca-agent` and the `task` executable.
*   **Simplify Development**: Provide easy-to-use SDKs for both Python (`orca-agent`) and TypeScript (`task` executable) to send and receive these standardized messages.
*   **Improve Robustness**: Reduce the chance of errors due to mismatched message formats or ad-hoc communication handling.
*   **Enhance Testability**: Make it easier to unit-test the communication logic in both the `orca-agent` and the `task` executable.

**Scope:**
*   This SDK focuses on the *content and structure of messages* and provides *helper utilities* for sending/receiving them.
*   It assumes the underlying transport mechanism (a local listener on the host, managed by `@_koii/orca-node` or `@_koii/task-manager`, with its address passed to the Docker container via environment variables like `PARENT_NODE_CALLBACK_URL`) remains managed by the existing Koii framework. The SDKs will make using this existing channel easier.

## 2. Proposed SDK Architecture

We will develop two main components:

1.  **Python SDK for `orca-agent`**:
    *   A Python library that `orca-agent` can import.
    *   Provides methods like `sdk.send_status_update(message, progress)`, `sdk.send_log_entry(level, message)`, `sdk.send_task_result(data)`, `sdk.send_error(error_details)`.
    *   Handles formatting messages according to the defined contract and sending them to the `PARENT_NODE_CALLBACK_URL`.
    *   Reads `PARENT_NODE_CALLBACK_URL` and `ORCA_TASK_ID` from environment variables.
2.  **TypeScript Library/SDK for `task` executable**:
    *   A TypeScript library that the forked JS `task` executable (e.g., `pro-me-the-us/node/worker/src/task/1-task.ts`) can use.
    *   Provides:
        *   A way to register handlers for different message `eventTypes` received from the `orca-agent` (via the underlying bridge managed by `@_koii/orca-node`).
        *   Standardized methods to interact with the `Namespace` object (provided by `koii-node`) for common actions like logging to the GUI, e.g., `sdk.notifyGui(level, message, action)`.
        *   Type definitions for the standardized messages.

A new directory, `pro-me-the-us/task_sdk/`, will be created to house these SDKs:
```
pro-me-the-us/
├── node/
│   ├── worker/
│   │   ├── orca-agent/ # Uses Python SDK
│   │   └── src/
│   │       └── task/   # Uses TypeScript SDK
│   └── ...
├── task_sdk/
│   ├── python/         # Python SDK for orca-agent
│   │   ├── src/
│   │   │   └── orca_task_sdk/
│   │   │       ├── __init__.py
│   │   │       └── client.py
│   │   ├── setup.py
│   │   └── README.md
│   ├── typescript/     # TypeScript Library/SDK for task executables
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   └── task_event_handler.ts
│   │   ├── package.json
│   │   └── README.md
│   └── interface/      # Shared message contract definitions (e.g., JSON schemas)
│       ├── message_schema.json
│       └── event_types.md
└── ...
```

## 3. Detailed Plan & File Updates

### Phase 1: Define the Communication Contract (1 week)

*   **Action**: Define the structure for all message types (status, log, result, error). Specify mandatory and optional fields, and enumerate `eventType` values.
*   **Output**:
    *   `pro-me-the-us/task_sdk/interface/message_schema.json`: JSON schema defining the message structure.
        ```json
        // Example: message_schema.json
        {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "title": "OrcaToTaskMessage",
          "type": "object",
          "properties": {
            "taskId": { "type": "string" },
            "eventType": { "type": "string", "enum": ["status_update", "log_entry", "task_result", "task_error"] },
            "timestamp": { "type": "string", "format": "date-time" },
            "payload": { "type": "object" }
          },
          "required": ["taskId", "eventType", "timestamp", "payload"]
        }
        ```
    *   `pro-me-the-us/task_sdk/interface/event_types.md`: Documenting each `eventType` and its expected `payload` structure.
        *   `status_update`: `payload: { message: string, progress?: number }`
        *   `log_entry`: `payload: { level: 'info' | 'warn' | 'error', message: string, details?: object }`
        *   `task_result`: `payload: { status: 'completed' | 'failed', result_data: object, error_message?: string }`
        *   `task_error`: `payload: { message: string, error_details?: object, stack_trace?: string }`
*   **Files to Review for Inspiration**:
    *   `orca-integration.md` (conceptual Python code for existing messages).
    *   `koii-node/src/main/controllers/startTask.ts` (lines 434-451 for how `Namespace` logger callback structures notifications for `TASK_NOTIFICATION_RECEIVED`).

### Phase 2: Develop Python SDK for `orca-agent` (2 weeks)

*   **Action**: Create the Python SDK in `pro-me-the-us/task_sdk/python/`.
*   **`orca_task_sdk/client.py`**:
    ```python
    import os
    import requests
    import datetime
    import json # For schema validation if desired

    class OrcaTaskClient:
        def __init__(self, callback_url=None, task_id=None):
            self.callback_url = callback_url or os.environ.get("PARENT_NODE_CALLBACK_URL")
            self.task_id = task_id or os.environ.get("ORCA_TASK_ID")
            if not self.callback_url:
                raise ValueError("PARENT_NODE_CALLBACK_URL not found in environment or provided.")

        def _send_message(self, event_type, payload):
            message = {
                "taskId": self.task_id or "unknown_orca_task",
                "eventType": event_type,
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "payload": payload
            }
            # Optional: Validate message against message_schema.json here
            try:
                print(f"OrcaTaskSDK: Sending {event_type} to {self.callback_url}")
                response = requests.post(self.callback_url, json=message, timeout=10)
                response.raise_for_status()
                print(f"OrcaTaskSDK: Message sent successfully.")
                return response.json()
            except requests.exceptions.RequestException as e:
                print(f"OrcaTaskSDK: Error sending message: {e}")
                # Consider a retry mechanism or more robust error handling
                return None

        def send_status_update(self, message: str, progress: int = None):
            payload = {"message": message}
            if progress is not None:
                payload["progress"] = progress
            return self._send_message("status_update", payload)

        def send_log_entry(self, level: str, message: str, details: dict = None):
            payload = {"level": level, "message": message}
            if details:
                payload["details"] = details
            return self._send_message("log_entry", payload)
        
        def send_task_result(self, status: str, result_data: dict, error_message: str = None):
            payload = {"status": status, "result_data": result_data}
            if error_message:
                payload["error_message"] = error_message
            return self._send_message("task_result", payload)

        def send_task_error(self, message: str, error_details: dict = None, stack_trace: str = None):
            payload = {"message": message}
            if error_details:
                payload["error_details"] = error_details
            if stack_trace:
                payload["stack_trace"] = stack_trace
            return self._send_message("task_error", payload)
    ```
*   **Testing**: Add unit tests for `OrcaTaskClient`.

### Phase 3: Develop TypeScript Library/SDK for `task` Executable (2 weeks)

*   **Action**: Create the TypeScript library in `pro-me-the-us/task_sdk/typescript/`.
*   **`task_sdk/typescript/src/types.ts`**: Define TypeScript interfaces based on `message_schema.json`.
    ```typescript
    // Example: types.ts
    export type EventType = "status_update" | "log_entry" | "task_result" | "task_error";

    export interface OrcaToTaskMessage {
      taskId: string;
      eventType: EventType;
      timestamp: string; // ISO 8601
      payload: any; // Specific payload types below
    }

    export interface StatusUpdatePayload { message: string; progress?: number; }
    export interface LogEntryPayload { level: 'info' | 'warn' | 'error'; message: string; details?: any; }
    export interface TaskResultPayload { status: 'completed' | 'failed'; result_data: any; error_message?: string; }
    // ... and so on for other event types
    ```
*   **`task_sdk/typescript/src/task_event_handler.ts`**:
    ```typescript
    import { ITaskNodeBase, LogLevel } from '@koii-network/task-node'; // Assuming access to this type
    import { OrcaToTaskMessage, EventType, StatusUpdatePayload, LogEntryPayload /* ... other payloads */ } from './types';

    // This type would ideally come from koii-node's Namespace or a shared type definition
    type NamespaceLike = {
        taskData: { task_id: string, task_name: string };
        setLoggerCallback: (cb: (level: LogLevel, message: string, action: string) => void) => void;
        // Add other Namespace methods the SDK might need to wrap
    };
    
    // Type for the callback that handles messages from Orca agent
    // This callback is what the @_koii/orca-node bridge would invoke in the task's context
    export type OrcaMessageHandler = (message: OrcaToTaskMessage) => void;

    export class TaskEventHandler {
        private namespace: NamespaceLike;
        private handlers: Map<EventType, (payload: any) => void> = new Map();

        constructor(namespace: NamespaceLike) {
            this.namespace = namespace;
             // Default handler for propagating to Koii Node GUI via Namespace's logger
            this.setLoggerCallback();
        }
        
        private setLoggerCallback() {
            // This assumes the Namespace object is the one from koii-node/src/main/node/helpers/Namespace.ts
            // which has setLoggerCallback that sends to RendererEndpoints.TASK_NOTIFICATION_RECEIVED
            if (this.namespace && typeof this.namespace.setLoggerCallback === 'function') {
                // This is a conceptual setup. The actual mechanism for the JS task to receive
                // messages from the orca-agent (via the @_koii/orca-node bridge) needs to be
                // integrated here. For example, if the bridge emits events:
                // bridge.on('orcaMessage', this.handleIncomingMessage.bind(this));
            } else {
                console.warn("TaskEventHandler: Namespace object or setLoggerCallback not available. GUI notifications might not work as expected via default.")
            }
        }

        // This method would be called by the underlying bridge when a message from Orca arrives
        public handleIncomingMessage(message: OrcaToTaskMessage): void {
            console.log(`TaskEventHandler: Received message from Orca: ${message.eventType}`, message.payload);
            const handler = this.handlers.get(message.eventType);
            if (handler) {
                try {
                    handler(message.payload);
                } catch (error) {
                    this.notifyGui(LogLevel.Error, `Error handling Orca event ${message.eventType}: ${(error as Error).message}`, 'OrcaEventHandlingError');
                }
            } else {
                // Default handling if no specific handler is registered
                this.defaultMessageHandler(message);
            }
        }
        
        private defaultMessageHandler(message: OrcaToTaskMessage): void {
            const { eventType, payload } = message;
            let guiLevel = LogLevel.Info;
            let guiMessage = `Orca event: ${eventType}`;
            
            if (eventType === 'log_entry') {
                const logPayload = payload as LogEntryPayload;
                guiLevel = logPayload.level === 'error' ? LogLevel.Error : logPayload.level === 'warn' ? LogLevel.Warn : LogLevel.Info;
                guiMessage = `Orca Log [${logPayload.level.toUpperCase()}]: ${logPayload.message}`;
            } else if (eventType === 'status_update') {
                guiMessage = `Orca Status: ${(payload as StatusUpdatePayload).message}`;
            } else if (eventType === 'task_result') {
                 guiMessage = `Orca Result: Status - ${(payload as TaskResultPayload).status}`;
            } // Add more default handlers as needed
            
            this.notifyGui(guiLevel, guiMessage, eventType);
        }

        public on<T_Payload>(eventType: EventType, callback: (payload: T_Payload) => void): void {
            this.handlers.set(eventType, callback as (payload: any) => void);
        }

        public notifyGui(level: LogLevel, message: string, action: string = "OrcaTaskSDKNotification"): void {
            if (this.namespace && (this.namespace as any)._loggerCallback) { // Check if _loggerCallback exists
                 (this.namespace as any)._loggerCallback(level, message, action);
            } else {
                // Fallback or direct call if namespace.setLoggerCallback wasn't the way to get the callback
                // This part is highly dependent on how the actual logger callback is exposed to the task's scope
                // For now, we assume it's been captured by the constructor or needs to be passed in.
                console.warn("TaskEventHandler: _loggerCallback not found on namespace. Cannot send notification to GUI via standard path.");
                console.log(`[${level}] (to GUI via SDK): ${message} (action: ${action})`);
            }
        }
    }
    ```
*   **`task_sdk/typescript/src/index.ts`**: Export classes and types.
*   **Testing**: Add unit tests for `TaskEventHandler`.

### Phase 4: Integrate SDKs into `pro-me-the-us/node` (3 weeks)

*   **Python SDK Integration (`orca-agent`)**:
    *   **File to Update**: `pro-me-the-us/node/worker/orca-agent/src/server/services/task_service.py` (and any other Python files making callbacks).
    *   **Action**:
        1.  Add `../../../../task_sdk/python/` to `sys.path` or install it as a local package.
        2.  Replace `requests.post` calls to the parent node with methods from the new `OrcaTaskClient`.
        *Example (conceptual change in `task_service.py`)*:
          ```python
          # from src.server.services import task_service # (your existing structure)
          # import requests # remove
          # import os # remove if only used for PARENT_NODE_API_URL
          from orca_task_sdk.client import OrcaTaskClient # ADD

          # ...
          # def some_function_that_reports_back():
          #    client = OrcaTaskClient() # Reads from env
          #    client.send_status_update("Processing step X", progress=50)
          #    try:
          #        # ... do work ...
          #        client.send_task_result(status="completed", result_data={"cid": "bafy..."})
          #    except Exception as e:
          #        client.send_task_error(message=str(e), stack_trace=traceback.format_exc())
          ```
*   **TypeScript SDK/Library Integration (`task` executable)**:
    *   **File to Update**: `pro-me-the-us/node/worker/src/task/1-task.ts` (and similar for `planner` if it uses Orca).
    *   **Action**:
        1.  Import `TaskEventHandler` from `../../../task_sdk/typescript/src/index.ts`.
        2.  In the main task execution function, after the `Namespace` object is available (as per `koii-node/src/main/controllers/startTask.ts` line 423 where `namespace` is created and passed to the task environment), instantiate `TaskEventHandler` with this `namespace`.
        3.  **Crucial Step**: Determine how the `@_koii/orca-node` bridge (or `task-manager`) actually delivers messages from the local listener *to* this running JS `task` executable.
            *   If it uses `process.on('message', ...)` or a similar child process communication, then `1-task.ts` would listen to these messages and pass them to `taskEventHandler.handleIncomingMessage()`.
            *   If `@_koii/orca-node` directly calls a globally exposed function or an event emitter within the task's context, that needs to be identified and hooked into.
            *   *This part requires deeper investigation into `@_koii/task-node` or `@_koii/orca-node` internal workings or clear documentation from those libraries on how child tasks receive such bridged communications.* For now, we'll assume a mechanism exists to get the raw message to `1-task.ts`.
        *Example (conceptual change in `1-task.ts`)*:
          ```typescript
          import { Namespace } from '/* path to koii-node Namespace type or a compatible one */';
          import { TaskEventHandler, OrcaToTaskMessage } from '../../../task_sdk/typescript/src'; // ADJUST PATH

          // Assuming 'namespace' is provided to this task script's scope as in koii-node
          // declare const namespace: Namespace; // Or however it's made available

          export async function task(roundNumber: number /* , other params like namespace if passed directly */): Promise<void> {
              // Assuming 'namespaceFromKoiiNode' is how the task gets its Namespace instance
              const namespaceFromKoiiNode: Namespace = (globalThis as any).namespaceInstance || getNamespaceFromArgs(); // Placeholder for how namespace is accessed

              if (!namespaceFromKoiiNode) {
                  console.error("Namespace instance not available to the task. SDK GUI notifications will fail.");
                  // return or throw
              }
              
              const eventHandler = new TaskEventHandler(namespaceFromKoiiNode as any); // Cast to NamespaceLike if needed

              // TODO: Setup listener for messages from orca-agent (bridged by @_koii/orca-node)
              // This is the part that needs to be confirmed based on how @_koii/orca-node delivers messages
              // For example, if it's via process.on('message'):
              // process.on('message', (msg: any) => {
              //    if (msg && msg.type === 'orcaCallbackData') { // Fictional message type
              //        eventHandler.handleIncomingMessage(msg.data as OrcaToTaskMessage);
              //    }
              // });

              // Example of registering a custom handler
              eventHandler.on<LogEntryPayload>("log_entry", (payload) => {
                  console.log(`Custom Handler for Orca Log: [${payload.level}] ${payload.message}`);
                  // Optionally, still use the default notifier to GUI if not handled fully
                  eventHandler.notifyGui(payload.level as LogLevel, `Forwarded Orca Log: ${payload.message}`, "OrcaCustomLog");
              });
              
              // ... existing task logic ...

              // When launching the orca agent (conceptually, this is done by @_koii/orca-node,
              // but the task script might configure it):
              // Ensure PARENT_NODE_CALLBACK_URL and ORCA_TASK_ID are set for the container.
              // This is likely handled by @_koii/orca-node based on config from orcaSettings.ts
              // in pro-me-the-us/node/worker/src/
          }
          
          function getNamespaceFromArgs(): Namespace | null { /* ... logic to get namespace if passed via args ... */ return null; }
          ```
    *   **File to Review**: `pro-me-the-us/node/worker/src/orcaSettings.ts`. Check if `PARENT_NODE_CALLBACK_URL` or `ORCA_TASK_ID` are already being set or can be standardized here for `@_koii/orca-node` to pick up. The SDK itself won't change this file, but the integration might reveal a need for consistent naming.

### Phase 5: Documentation (1 week, parallel with integration)

*   **Action**: Document both SDKs.
*   **Python SDK**: README in `task_sdk/python/` with usage examples.
*   **TypeScript SDK**: README in `task_sdk/typescript/` with usage examples, especially how to integrate with the message receiving mechanism.
*   **Interface Docs**: Update `task_sdk/interface/event_types.md` with any refinements.

## 4. Verification and Testing Strategy

### A. Unit Tests

*   **Python SDK**:
    *   Test `OrcaTaskClient` methods:
        *   Mock `requests.post`.
        *   Verify correct URL is called.
        *   Verify correct message structure and content based on input.
        *   Verify environment variables are read correctly.
        *   Test error handling (e.g., when `PARENT_NODE_CALLBACK_URL` is missing, or `requests.post` fails).
*   **TypeScript SDK/Library**:
    *   Test `TaskEventHandler`:
        *   Mock the `Namespace` object.
        *   Test `handleIncomingMessage` correctly calls registered handlers or the default handler.
        *   Verify that registered handlers receive the correct payload.
        *   Verify `notifyGui` calls the `Namespace`'s logger callback with correctly formatted arguments.
        *   Test scenarios with missing handlers.

### B. Integration Tests

1.  **Python SDK to Mock Listener**:
    *   Create a simple Python Flask/FastAPI mock HTTP server that acts as the `PARENT_NODE_CALLBACK_URL`.
    *   This mock server should:
        *   Listen for POST requests.
        *   Validate the received JSON payload against `message_schema.json`.
        *   Store received messages or log them for verification.
    *   Run `orca-agent` (or a test script using the Python SDK) and verify the mock listener receives correctly formatted messages for all event types.

2.  **Mocked Orca Messages to TypeScript SDK**:
    *   In a test environment for the `task` executable (e.g., using Jest for `1-task.ts`):
        *   Simulate the arrival of `OrcaToTaskMessage` objects (as if they came from the `@_koii/orca-node` bridge).
        *   Pass these to the `TaskEventHandler` instance.
        *   Verify that the correct handlers are invoked and that the `Namespace` mock's methods (especially the logger callback) are called appropriately.

### C. End-to-End (E2E) Testing (Challenging but Ideal)

*   **Goal**: Test the full flow: `orca-agent` (Python SDK) -> actual local listener set up by `@_koii/orca-node` -> JS `task` executable (TypeScript SDK) -> `Namespace` -> Mocked Koii Node GUI.
*   **Setup**:
    *   This requires an environment where `koii-node` (or at least its task execution parts involving `@_koii/orca-node` and `@_koii/task-manager`) can be run in a controlled way.
    *   The Koii Node GUI's `RendererEndpoints.TASK_NOTIFICATION_RECEIVED` would need to be mocked to capture events intended for the UI.
*   **Steps**:
    1.  Modify/configure `pro-me-the-us/node/worker/orca-agent/` to use the new Python SDK.
    2.  Modify/configure `pro-me-the-us/node/worker/src/task/1-task.ts` to use the new TypeScript SDK.
    3.  Package these as a Koii Task.
    4.  Run this task within the testable `koii-node` environment.
    5.  Trigger actions in the `orca-agent` that send various messages (status, log, result).
    6.  Verify:
        *   The `orca-agent` logs successful sending.
        *   The JS `task` executable logs successful receipt and handling.
        *   The mocked Koii Node GUI interface (listening for `TASK_NOTIFICATION_RECEIVED`) receives the correctly translated and propagated messages.
*   **Alternative E2E**: If a full `koii-node` E2E setup is too complex, a more limited E2E could involve:
    1.  Manually running the Python `orca-agent` Docker container.
    2.  Manually running the JS `task` executable in a Node.js environment, providing it with a mock `Namespace` and a way to receive messages from a manually started mock of the local listener.
    3.  The `orca-agent` calls this mock local listener, which then forwards to the JS `task`.

## 5. Next Steps (Immediate Verification & Iteration)

1.  **Confirm Message Delivery Mechanism to JS Task**:
    *   **Action**: Investigate precisely how messages from the `@_koii/orca-node` local listener are delivered to the forked JS `task` executable (`1-task.ts`). Is it `process.on('message')`, an event emitter, a direct function call, or something else?
    *   **Files to check in `@_koii/task-node` or `@_koii/orca-node` dependencies if possible, or experiment within `1-task.ts` by logging all incoming process messages or global events when an Orca task is active.** This is critical for the `TaskEventHandler.handleIncomingMessage` integration.
2.  **Prototype Python SDK (`OrcaTaskClient`)**: Implement a basic version and test sending a simple message to a local mock Python server.
3.  **Prototype TypeScript SDK (`TaskEventHandler`)**: Implement a basic version with the default message handler and `notifyGui`. Test it by manually creating `OrcaToTaskMessage` objects and passing them to `handleIncomingMessage`, verifying the mock `Namespace` interaction.
4.  **Basic Integration in `pro-me-the-us/node/worker/`**:
    *   Integrate the prototype Python SDK into one simple callback in `orca-agent`.
    *   Integrate the prototype TypeScript SDK into `1-task.ts` to handle that one message type, assuming a placeholder for message delivery from the bridge (e.g., manually calling `handleIncomingMessage` in the test).
5.  **Refine Contract**: Based on initial prototyping, refine `message_schema.json` and `event_types.md`.

This iterative approach will help solidify the SDK design before a full-scale implementation and integration. 