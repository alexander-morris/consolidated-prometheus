# Task Event TypeScript SDK (`@pro-me-the-us/task-event-sdk`)

This TypeScript SDK/library provides utilities for Koii task executables (the forked JS processes running within the Koii Node GUI environment) to handle and process standardized messages received from their child Orca agents (Docker containers).

## Features

-   Standardized types for messages received from Orca agents.
-   An event handler (`TaskEventHandler`) to manage incoming messages and route them to appropriate handlers.
-   Default message handling that translates Orca events into notifications for the Koii Node GUI.
-   A mechanism to register custom handlers for specific Orca event types.
-   Utilities to simplify sending notifications to the Koii Node GUI via the task's `Namespace` object.

## Installation

This SDK is intended to be used within the Koii task executable environment.

1.  **Build the SDK**:
    Navigate to `task_sdk/typescript/` and run your build command (e.g., `npm run build` or `yarn build`), assuming `tsc` is configured in `package.json` to compile to a `dist` directory.

2.  **Link or Install in your Task Project**:
    For your actual Koii task project (e.g., `pro-me-the-us/node/worker/`):
    *   **Local Linking (Development):** You can use `npm link` or `yarn link`:
        ```bash
        # In task_sdk/typescript/
        npm link # or yarn link

        # In pro-me-the-us/node/worker/ (or your specific task project directory)
        npm link @pro-me-the-us/task-event-sdk # or yarn link @pro-me-the-us/task-event-sdk
        ```
    *   **Direct Path (Alternative Development):** You can use relative paths in your imports if your bundler/TypeScript setup resolves them, e.g., `import { TaskEventHandler } from '../../../../task_sdk/typescript/dist';` (adjust path as needed). This is less ideal for maintainability.
    *   **NPM Package (Production/Distribution):** Ideally, you would publish this SDK to an npm registry (private or public) and install it as a regular dependency in your task project's `package.json`.

**Dependencies:**
*   `@koii-network/task-node`: For types like `LogLevel`. This should already be a dependency of your Koii task executable.

## Usage

### Initialization

The `TaskEventHandler` needs access to the `Namespace` object that the Koii Node environment provides to your task executable. This `Namespace` object is crucial for sending notifications back to the Koii Node GUI.

```typescript
// In your task executable (e.g., pro-me-the-us/node/worker/src/task/1-task.ts)

// Import SDK components (adjust path based on your setup)
import { TaskEventHandler, OrcaToTaskMessage, LogEntryPayload, NamespaceLike } from '@pro-me-the-us/task-event-sdk'; 
// or from relative path: import { TaskEventHandler, ... } from '../../../../task_sdk/typescript/dist';

import { LogLevel } from '@koii-network/task-node';

// --- How to get the Namespace instance ---
// This is critical and depends on how Koii Node's task runner exposes it.
// It might be a global variable or passed via a specific mechanism.
// Below is a conceptual way to try and access it:
let namespaceInstance: NamespaceLike | null = null;
if ((globalThis as any).namespaceInstance) { // Common pattern in Koii Node
    namespaceInstance = (globalThis as any).namespaceInstance as NamespaceLike;
} else if ((globalThis as any).namespace) { // Alternative global name
    namespaceInstance = (globalThis as any).namespace as NamespaceLike;
}
// You might need to adapt this based on actual Koii task environment specifics.

let eventHandler: TaskEventHandler | null = null;

if (namespaceInstance) {
    eventHandler = new TaskEventHandler(namespaceInstance);
    console.log("[Task SDK] TaskEventHandler initialized.");

    // ** CRITICAL: Wire up message reception **
    // The task executable needs to listen for messages bridged from the Orca agent
    // by the underlying Koii framework (@_koii/orca-node or task-manager).
    // This is often via `process.on('message', ...)` for forked child processes.

    process.on('message', (bridgedMessage: any) => {
        console.log('[Task SDK] Task received IPC message:', bridgedMessage);
        // Basic validation to see if it looks like an Orca message
        if (bridgedMessage && bridgedMessage.eventType && bridgedMessage.payload && bridgedMessage.taskId) {
            eventHandler?.handleIncomingMessage(bridgedMessage as OrcaToTaskMessage);
        } else {
            // Handle other types of IPC messages if necessary
            console.warn('[Task SDK] Received non-Orca SDK message via IPC:', bridgedMessage);
        }
    });
    console.log("[Task SDK] Attached IPC message listener (process.on('message')).");

} else {
    console.error("[Task SDK] Could not initialize TaskEventHandler: Namespace instance not found.");
}

// Now, your main task logic can proceed.
// The eventHandler will process Orca messages in the background via the listener above.

// Example within your task's main function:
// export async function task(roundNumber: number): Promise<void> {
//    eventHandler?.notifyGui(LogLevel.Info, `Task round ${roundNumber} started.`, "TaskLifecycle");
//    // ... your task logic ...
// }
```

### Handling Incoming Messages

**1. Default Handling**

By default, when `eventHandler.handleIncomingMessage(message)` is called, the SDK will:
1.  Log the raw message (can be commented out in SDK for production).
2.  Attempt to format it into a user-friendly string.
3.  Call `eventHandler.notifyGui(...)` to send this formatted string as a notification to the Koii Node GUI, using an appropriate `LogLevel` based on the `eventType`.

**2. Custom Handlers**

You can register custom handlers for specific event types if you need to perform actions beyond (or instead of) the default GUI notification.

```typescript
if (eventHandler) {
    // Custom handler for 'log_entry' from Orca
    eventHandler.on<LogEntryPayload>("log_entry", (payload, fullMessage) => {
        console.log(`[Custom Task Handler] Orca Log (Task ID: ${fullMessage.taskId}): [${payload.level}] ${payload.message}`);
        if (payload.details) {
            console.log("[Custom Task Handler] Log Details:", payload.details);
        }
        // If you want to also trigger the default GUI notification for this log:
        // eventHandler.notifyGui(payload.level as LogLevel, `Relayed Orca Log: ${payload.message}`, "CustomRelayLog");
        // Otherwise, by default, the custom handler replaces the default one for this event type.
        // To have both, the custom handler needs to explicitly call a method or the default handler logic.
    });

    // Custom handler for 'task_result'
    eventHandler.on<TaskResultPayload>("task_result", (payload, fullMessage) => {
        console.log(`[Custom Task Handler] Orca Task Result for ${fullMessage.taskId}: ${payload.status}`);
        if (payload.status === "completed" && payload.result_data) {
            console.log("[Custom Task Handler] Result Data:", payload.result_data);
            // e.g., await namespaceInstance.storeSet('myTaskResult', payload.result_data);
        }
        // Default handler would also call notifyGui for this.
    });
}
```

### Sending Notifications to GUI (from Task Executable)

If your task executable itself (not the Orca agent) needs to send a notification to the Koii Node GUI, you can use the `eventHandler.notifyGui()` method:

```typescript
if (eventHandler) {
    eventHandler.notifyGui(LogLevel.Info, "Task executable has reached a milestone.", "TaskMilestone");
    eventHandler.notifyGui(LogLevel.Error, "An error occurred in the task executable itself.", "TaskInternalError");
}
```
This uses the `Namespace` object's logging callback that was captured during initialization.

## Message Contract

All messages processed by this SDK are expected to adhere to the schema defined in `task_sdk/interface/message_schema.json` and use event types and payload structures documented in `task_sdk/interface/event_types.md`.

## Development & Testing

(Assuming Jest setup as per `package.json`)

To run unit tests:

```bash
cd task_sdk/typescript/
# npm install (if not done already)
npm test # or yarn test
```

The unit tests (`tests/task_event_handler.test.ts`) mock the `NamespaceLike` object and verify the behavior of `TaskEventHandler` for different scenarios.

**Integration Testing Note:**
The most critical part of testing this SDK's integration is verifying how messages are passed from the `@_koii/orca-node` bridge to the task executable's context where `process.on('message', ...)` (or an alternative mechanism) is listening. This often requires running the task within a simulated or actual Koii Node environment that correctly sets up this bridge. 