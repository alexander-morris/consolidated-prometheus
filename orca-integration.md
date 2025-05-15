# Orca Container to Koii Node (GUI Application) Integration

## 1. Introduction

This document details the integration pattern between the Koii Node GUI application (the Electron-based parent process) and the Orca tasks (Python-based Docker containers) it orchestrates. Specifically, it focuses on how an Orca container, running as a Koii Task, communicates updates or results back to the Koii Node GUI application that manages it.

This pattern is crucial for enabling Orca tasks to be managed and monitored within the Koii Node desktop application, allowing users to see task progress, receive notifications, and have results processed by the main application.

## 2. Orca Task Orchestration by Koii Node GUI

The Koii Node GUI application is responsible for the full lifecycle of Koii Tasks, including Orca tasks.

*   **Task Management Core**: The `koii-node/src/main/services/koiiTasks.ts` service (referenced in `koii-node/src/main/main.ts`, e.g., line 92 for `koiiTasks.stopTasksOnAppQuit()`) likely encapsulates the core logic for discovering, initializing, starting, stopping, and monitoring tasks. It maintains the state of running tasks.
*   **Orca Task Identification & Environment Initialization**:
    *   When a task is started, the `koii-node/src/main/controllers/startTask.ts` controller is invoked (this mapping is set up in `koii-node/src/main/initHandlers.ts` around line 26 for `Endpoints.START_TASK`).
    *   Within `startTask.ts` (around lines 101-115), the task's metadata is checked. If `requirementsTags` include an `ADDON` of type `ORCA_TASK`, it calls `initOrca()`.
    *   This `initOrca()` function is imported from `koii-node/src/main/node/helpers/initOrca.ts`. Its primary role (as seen in its content, lines 1-68) is to ensure the underlying Orca VM (e.g., Podman) is correctly set up and running using the `bootstrap()` function from the `@_koii/orca-node` library (line 26 in `initOrca.ts`).
*   **Task Execution**: 
    *   The `startTask.ts` controller, after ensuring the Orca environment is ready (if applicable), proceeds to the `executeTasks` function (defined within `startTask.ts` itself, lines 245-463).
    *   The `executeTasks` function (around line 313) uses `child_process.fork()` to run the task's JavaScript executable (e.g., `${getAppDataPath()}/executables/${selectedTask.task_audit_program}.js`). This JS executable is built on the `@koii-network/task-node` standard.
    *   **Crucially, for Orca tasks, this forked JS task executable is then responsible for using `@_koii/orca-node` (or a similar mechanism provided by `@_koii/task-manager`) to actually launch the Python Docker container.** The `startTask.ts` controller in `koii-node` delegates the Docker container management to this child JS process.

## 3. Communication: Orca Container to Koii Node Main Process

Direct communication from a Docker container to an Electron main process's IPC channels (like those defined via `ipcMain.handle` in `koii-node/src/main/initHandlers.ts`) is not standard. A bridge or proxy mechanism, orchestrated by the forked JS task executable and the `@_koii/orca-node` library, is used.

### 3.1. Probable Mechanism: Local Host Listener via Task Executable & `@_koii/orca-node`

The most probable mechanism involves the forked JS task executable, with the help of the `@_koii/orca-node` library, setting up a **local HTTP server or a dedicated IPC listener (e.g., on a Unix domain socket or a specific local TCP port)** on the host machine.

1.  **Listener Setup (by JS Task Executable & `@_koii/orca-node`)**: When the forked JS task executable (for an Orca task) starts, it would use `@_koii/orca-node` to launch the Docker container. As part of this, `@_koii/orca-node` would also be responsible for starting a local listener on the host. This listener is *not* a public-facing API of the Koii Node task itself.
2.  **Environment Variable Injection (by JS Task Executable & `@_koii/orca-node`)**: The `@_koii/orca-node` library, when launching the Docker container (invoked from the forked JS task executable), injects an environment variable into the Orca Docker container. This variable provides the container with the address of this local listener.
    *   Example: `PARENT_NODE_CALLBACK_URL=http://127.0.0.1:LOCAL_PORT/orca-callback` or `IPC_SOCKET_PATH=/tmp/koii-orca-task-XYZ.sock`.
    *   The `LOCAL_PORT` would be dynamically assigned or pre-configured by `@_koii/orca-node`.
3.  **Orca Container Sends Data**: The Python script inside the Orca Docker container uses this provided address to send HTTP requests (or socket messages) containing status updates, results, or logs to the local listener on the host.
4.  **Bridge to Main Process (via JS Task Executable & Namespace)**:
    *   The local listener (managed by `@_koii/orca-node` on the host) receives this data from the Docker container.
    *   It then communicates this data back to its parent process—the forked JS task executable.
    *   The forked JS task executable has access to a `Namespace` object (instantiated in `koii-node/src/main/controllers/startTask.ts` around lines 423-432, and passed to the task environment). This `Namespace` object (defined in `koii-node/src/main/node/helpers/Namespace.ts`) has a `setLoggerCallback` (see `startTask.ts` lines 434-451).
    *   The JS task executable, upon receiving data from the Docker container (via the local listener bridge), would use this `namespace.setLoggerCallback` or a similar mechanism to send structured log/event data. This callback, in turn, uses `sendEventAllWindows(RendererEndpoints.TASK_NOTIFICATION_RECEIVED, payload)` (line 446 in `startTask.ts`) to propagate the information to the Koii Node GUI (all renderer processes).

### 3.2. Orca-Side Python Code (Conceptual)

The Python code inside the Orca container remains conceptually the same, targeting the `PARENT_NODE_CALLBACK_URL` provided via environment variable.

```python
# Conceptual Python code within the Orca container
import os
import requests # or a socket library if not HTTP

# This URL is provided by the Koii Node's task executable (via @_koii/orca-node) at container startup
PARENT_CALLBACK_URL = os.environ.get("PARENT_NODE_CALLBACK_URL")
ORCA_TASK_ID = os.environ.get("ORCA_TASK_ID") # Often useful for context

def send_update_to_koii_node(event_type: str, data: dict):
    if not PARENT_CALLBACK_URL:
        print("Error: PARENT_NODE_CALLBACK_URL not set. Cannot send update to Koii Node.")
        return

    payload = {
        "taskId": ORCA_TASK_ID or "unknown_orca_task",
        "eventType": event_type, # e.g., "status_update", "log_entry", "task_result"
        "data": data
    }

    try:
        # Assuming an HTTP-based local listener for this example
        print(f"Sending update to Koii Node via {PARENT_CALLBACK_URL}: {payload}")
        response = requests.post(PARENT_CALLBACK_URL, json=payload, timeout=5)
        response.raise_for_status()
        print(f"Successfully sent update to Koii Node.")
    except requests.exceptions.RequestException as e:
        print(f"Error sending update to Koii Node: {e}")

# Example Usage:
# send_update_to_koii_node(event_type="status_update", data={"message": "Processing item X", "progress": 50})
# send_update_to_koii_node(event_type="task_result", data={"output_cid": "bafy...", "status": "completed"})
# send_update_to_koii_node(event_type="log_entry", data={"level": "error", "message": "Something failed"})
```

### 3.3. Purpose and Data Passed to Koii Node

This communication channel allows the Orca task to:

*   **Report Real-time Progress**: For display in the Koii Node GUI via `TASK_NOTIFICATION_RECEIVED`.
*   **Submit Final Results**: Which the Koii Node can then process (e.g., via the `Namespace` object or specific IPC calls if needed) and display.
*   **Stream Logs**: For display in the task-specific log view within the Koii Node GUI, also typically via `TASK_NOTIFICATION_RECEIVED`.
*   **Indicate Errors**: Allowing the Koii Node to update task status and inform the user.

The data format is typically JSON. The `eventType` field in the conceptual Python example helps the receiving local listener (and subsequently the JS task executable and Koii Node main process) to understand how to process the incoming data.

## 4. Distinguishing from Public Task APIs

It's important to distinguish this internal Orca-to-Koii-Node communication from the public-facing APIs that a Koii Task (like those in your `pro-me-the-us/node/worker/src/task/5-routes.ts`) might expose.

*   **Internal Callbacks (Orca to Koii Node via local listener)**:
    *   Uses a local, non-public listener on the host machine, managed by the forked JS task executable using `@_koii/orca-node`.
    *   Address provided via environment variables to the Docker container by the JS task executable/@_koii/orca-node.
    *   Purpose: For the container to report its state *back to the specific Koii Node GUI instance* managing it, bridged through the JS task executable and its `Namespace` object.
*   **Public Task APIs (e.g., from `pro-me-the-us/node/worker/src/task/5-routes.ts`)**:
    *   These are HTTP endpoints exposed by the Koii Task's forked JS executable itself (using the Express app instance also created and managed within `koii-node/src/main/controllers/startTask.ts`, around line 129 for `initExpressApp` and line 253 where `expressAppPort` is obtained).
    *   These can be exposed to the broader internet (potentially via tunneling or port forwarding managed by the Koii Node).
    *   These are defined by the task developer (e.g., in your `pro-me-the-us` project) and are part of the task's public contract for how external users or services interact with the running task.

## 5. Summary & Considerations

*   The Koii Node GUI application, through its main process controllers (like `koii-node/src/main/controllers/startTask.ts`), forks a JavaScript executable for each Koii Task.
*   For Orca tasks, this JS executable then uses the `@_koii/orca-node` library to launch the Docker container and manage a local communication bridge (listener).
*   Communication from the Orca container back to the Koii Node main process is facilitated by this local listener, with data then relayed through the JS task's `Namespace` object to the GUI via `RendererEndpoints.TASK_NOTIFICATION_RECEIVED`.
*   This internal communication is distinct from any public APIs the Koii Task's JS executable itself might expose.
*   **Security**: The local listener's security is managed by `@_koii/orca-node` and the host system. Access is typically restricted to the local machine.
*   **API Contract**: While internal, a clear structure for messages between the Docker container, the local listener, and the JS task executable is essential for reliable updates and logging.

This revised understanding clarifies the chain of command and the specific roles of different components within the `koii-node` application in managing and communicating with Orca Docker tasks. 