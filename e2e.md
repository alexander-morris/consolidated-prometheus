# End-to-End (E2E) Testing Plan for Orca-Task SDK Communication

## 1. Introduction & Goals

This document outlines the plan for End-to-End (E2E) testing of the communication flow between an Orca agent (Python Docker container using `orca_task_sdk`) and its parent Koii Task executable (JS process using `@pro-me-the-us/task-event-sdk`), all running within a simulated Koii Node environment.

**Goals:**
*   Verify that messages sent by the Python SDK in a (mocked or real) Orca container are correctly received and processed by the TypeScript SDK in the JS task executable.
*   Confirm that these messages result in the expected notifications or actions within a simulated Koii Node GUI context (e.g., calls to the `Namespace` logger).
*   Identify and resolve any integration issues in the SDKs or the example task implementations.
*   Ensure the overall communication pipeline is robust and handles various event types correctly.

**Scope:**
*   Focus on the SDK-mediated communication channel.
*   Will involve mocking parts of the Koii Node environment to make testing feasible and deterministic without requiring a full Koii Node GUI installation for every test run.
*   Does *not* aim to test the full functionality of the `koii-node` application itself, only its role in orchestrating and facilitating communication for Orca tasks.

## 2. E2E Testing Strategy & Approach

We will adopt a layered approach, starting with more controlled mock environments and potentially moving towards tests involving a real (but headless or minimized) Orca container if feasible and necessary.

**Key Components in the E2E Flow:**
1.  **Mocked Orca Agent (Python Script):** A Python script that *uses* the `orca_task_sdk` to send a predefined sequence of messages. This script will run locally, simulating an Orca container.
2.  **Mocked Local Listener Bridge (Python HTTP Server):** A simple HTTP server that mimics the behavior of the local listener that `@_koii/orca-node` would set up. It receives messages from the Mocked Orca Agent and forwards them to the JS Task Executable.
3.  **JS Task Executable (Node.js process):** A simplified version of `pro-me-the-us/node/worker/src/task/1-task.ts` (or a dedicated test task script) that uses the `@pro-me-the-us/task-event-sdk` (TypeScript SDK).
4.  **Mocked Koii Node `Namespace` Object (TypeScript/JavaScript):** A mock implementation of the `NamespaceLike` interface used by the TypeScript SDK, specifically to capture calls to `_loggerCallback` (which simulates GUI notifications).

**Alternative to (2) if Phase 0 investigation is complete:** If the Phase 0 investigation (confirming message delivery from `@_koii/orca-node` to the JS task) reveals a direct mechanism (e.g., `process.send` from a parent to a forked child), the Mocked Local Listener Bridge might be replaced by directly invoking that mechanism in the test orchestrator.

## 3. E2E Test Environment Setup Plan

Create a new directory for E2E tests, e.g., `pro-me-the-us/e2e_tests/`.

```
e2e_tests/
├── sdk_communication/
│   ├── mock_orca_agent.py       # Python script using orca_task_sdk
│   ├── mock_listener_bridge.py  # Python HTTP server (Flask/FastAPI)
│   ├── test_task_executable.js  # Compiled JS from a test_task.ts
│   ├── test_task.ts             # TypeScript source for the test task executable
│   ├── mock_namespace.ts        # Mock Koii Namespace object for the test_task
│   ├── run_e2e_test.js          # Test orchestrator (Node.js script using Jest or similar)
│   └── package.json             # For test runner dependencies (Jest, ts-node, etc.)
│   └── tsconfig.json            # For compiling test_task.ts
└── ... (other E2E test scenarios later)
```

### 3.1. Mocked Orca Agent (`mock_orca_agent.py`)

*   **Purpose**: Simulates a real Orca Docker container sending messages.
*   **Implementation**:
    *   Imports `OrcaTaskClient` from `task_sdk.python.src.orca_task_sdk.client` (ensure path is correct or SDK is installed/linked).
    *   Reads `PARENT_NODE_CALLBACK_URL` and `ORCA_TASK_ID` from environment variables (these will be set by the test orchestrator).
    *   Contains functions to send a sequence of all defined event types (`status_update`, `log_entry`, `task_result`, `task_error`) with sample payloads.
    *   Can be triggered by the test orchestrator (`run_e2e_test.js`).

### 3.2. Mocked Local Listener Bridge (`mock_listener_bridge.py`)

*   **Purpose**: Simulates the local listener that `@_koii/orca-node` would manage. Receives HTTP POSTs from `mock_orca_agent.py` and forwards them to the `test_task_executable.js` via a chosen IPC mechanism (e.g., `stdin` of the child process, or a simple local socket if `process.send` is not the way).
    *   *This component's design is highly dependent on the outcome of the Phase 0 investigation.*
*   **Implementation (Example using `stdin` for forwarding if `test_task_executable.js` reads from it):**
    *   Flask/FastAPI server listening on a specific port (e.g., 3002, different from Python SDK tests).
    *   Endpoint `/e2e_orca_callback`.
    *   When a message is received, it writes the JSON message as a string to the `stdout` of this script. The test orchestrator will pipe this `stdout` to the `stdin` of the `test_task_executable.js`.
    *   Alternatively, if the Phase 0 reveals `process.send` can be used from a parent Node.js process to a forked child, this bridge might not be needed, and `run_e2e_test.js` can directly send messages.

### 3.3. Test Task Executable (`test_task.ts` -> `test_task_executable.js`)

*   **Purpose**: A minimal Koii Task executable that integrates the TypeScript SDK.
*   **Implementation (`test_task.ts`)**:
    *   Imports `TaskEventHandler` and types from `../../task_sdk/typescript/dist` (or linked package).
    *   Imports the `MockNamespace` from `./mock_namespace.ts`.
    *   Instantiates `MockNamespace` and `TaskEventHandler`.
    *   **Sets up the confirmed message reception mechanism** (from Phase 0 findings) to listen for messages (e.g., reads from `process.stdin` if `mock_listener_bridge.py` writes to its `stdout` which is piped, or listens to `process.on('message')`).
    *   When a message is received, it calls `taskEventHandler.handleIncomingMessage()`.
    *   Can include custom handlers for some event types to demonstrate that functionality.
    *   Logs to console or a temporary file when messages are handled (for verification by the orchestrator).

### 3.4. Mock Koii Node `Namespace` (`mock_namespace.ts`)

*   **Purpose**: Simulates the `Namespace` object provided by `koii-node` to tasks, focusing on the logger callback.
*   **Implementation**:
    *   Implements the `NamespaceLike` interface from the TypeScript SDK.
    *   `taskData`: Hardcoded test values.
    *   `setLoggerCallback(cb)`: Stores the callback `cb`.
    *   `_loggerCallback(level, message, action)`: When called (by `TaskEventHandler.notifyGui`), it logs the message to a known location (e.g., a temporary file, or emits a specific console message that the orchestrator can capture) for verification.

### 3.5. Test Orchestrator (`run_e2e_test.js`)

*   **Purpose**: Manages the E2E test execution flow.
*   **Implementation (using Node.js, potentially with a test runner like Jest for assertions):**
    1.  **Setup**:
        *   Compile `test_task.ts` to `test_task_executable.js` (e.g., using `tsc`).
        *   Ensure Python SDK is accessible to `mock_orca_agent.py`.
        *   Start `mock_listener_bridge.py` as a subprocess if this bridge approach is used. Configure its port.
        *   Start `test_task_executable.js` as a child process.
            *   If using the `stdin` bridge: Pipe `stdout` of `mock_listener_bridge.py` to `stdin` of `test_task_executable.js`.
            *   Set environment variables for `test_task_executable.js` if it needs to know how `Namespace` is provided (e.g., via a global in its mocked setup).
    2.  **Execution Trigger**:
        *   Set `PARENT_NODE_CALLBACK_URL` (pointing to `mock_listener_bridge.py` or the direct mechanism) and `ORCA_TASK_ID` as environment variables for `mock_orca_agent.py`.
        *   Run `mock_orca_agent.py` as a subprocess, instructing it to send a sequence of messages.
    3.  **Verification**:
        *   Wait for `mock_orca_agent.py` to complete.
        *   Wait for a short duration to allow messages to propagate.
        *   Check the output/log file produced by `mock_namespace.ts` (via `_loggerCallback`) to verify that all messages sent by `mock_orca_agent.py` were received and resulted in the correct simulated GUI notifications.
        *   Check console output from `test_task_executable.js` for any specific logs from custom handlers.
    4.  **Teardown**:
        *   Stop `test_task_executable.js` child process.
        *   Stop `mock_listener_bridge.py` subprocess (if used).
        *   Clean up any temporary log files.
*   **Assertions**: Use a test framework (like Jest if `run_e2e_test.js` is a Jest test file itself) to make assertions about the received messages and their content.

## 4. Detailed E2E Test Scenarios (Linear Steps)

### Step 1: Basic Setup and Environment Verification (E2E-S1)
   - **TODO**: Implement `mock_namespace.ts`.
   - **TODO**: Implement a basic `test_task.ts` that instantiates `TaskEventHandler` with `MockNamespace` and logs a startup message using `eventHandler.notifyGui()`.
   - **TODO**: Implement `run_e2e_test.js` to: compile `test_task.ts`, run `test_task_executable.js`, and verify its startup log message (captured from `MockNamespace`).
   - *Goal: Ensure the basic JS task executable runs and its SDK can interact with the mock Namespace.* 

### Step 2: Implement Python Side Mocks (E2E-S2)
   - **TODO**: Implement `mock_orca_agent.py` to use the Python SDK and send a single `status_update` message.
   - **TODO**: Implement `mock_listener_bridge.py` (or adapt `run_e2e_test.js` if direct IPC is confirmed for Phase 0).
       *   *If bridge:* Listens for HTTP POST, forwards to `stdout`.
       *   *If direct IPC:* `run_e2e_test.js` will need to simulate the message arriving via the confirmed channel.
   - *Goal: Python agent can send a message; bridge can receive and forward (or orchestrator can send).* 

### Step 3: Connect Python to JS Task via Bridge/IPC (E2E-S3)
   - **TODO**: Update `test_task.ts` to implement the confirmed message reception mechanism (from Phase 0) and pass received messages to `taskEventHandler.handleIncomingMessage()`.
   - **TODO**: Update `run_e2e_test.js` to:
       1. Start `mock_listener_bridge.py` (if used).
       2. Start `test_task_executable.js`, piping/connecting its input to the bridge's output (if used).
       3. Start `mock_orca_agent.py` (configured to send one `status_update` to the bridge).
       4. Verify (via `MockNamespace` logs) that the `status_update` message was received by the `TaskEventHandler` in `test_task_executable.js` and a GUI notification was logged.
   - *Goal: Verify one message can travel from mock Python agent, through the bridge/IPC, to the JS task, and trigger a GUI notification via the SDK.* 

### Step 4: Full Message Suite Test (E2E-S4)
   - **TODO**: Extend `mock_orca_agent.py` to send all defined message types (`status_update`, `log_entry`, `task_result` (completed/failed), `task_error`) with varied payloads.
   - **TODO**: Extend `test_task.ts` to include custom handlers for at least one or two event types (e.g., a custom log handler and a custom task_result handler) to verify that custom handlers are invoked alongside default behavior (if applicable).
   - **TODO**: Update `run_e2e_test.js` to orchestrate this full suite and verify:
       *   All messages are received.
       *   Default handlers produce correct GUI notifications (via `MockNamespace`).
       *   Custom handlers are invoked and their specific logging/actions occur.
   - *Goal: Verify robust handling of all message types and custom handler functionality.*

### Step 5: Error Condition Tests (E2E-S5) (Optional, if time permits for initial E2E)
   - **TODO**: Modify `mock_orca_agent.py` to send malformed messages (e.g., missing required fields, incorrect `eventType`).
   - **TODO**: Verify that `TaskEventHandler` in `test_task_executable.js` handles these gracefully (e.g., logs an error, sends an appropriate error notification to GUI).
   - **TODO**: Simulate the `mock_listener_bridge.py` (or direct IPC call) failing or timing out.
   - **TODO**: Verify robust error handling in the Python SDK's `OrcaTaskClient` (e.g., connection errors).
   - *Goal: Test resiliency and error reporting.* 

## 5. Next Steps (After this E2E Plan)

1.  **Resolve Phase 0 TODO**: Confirm the exact message delivery mechanism from `@_koii/orca-node` to the forked JS `task` executable. This is paramount as it heavily influences the design of `mock_listener_bridge.py` and how `test_task.ts` receives messages.
2.  Begin implementing E2E-S1: `mock_namespace.ts`, basic `test_task.ts`, and the initial `run_e2e_test.js` orchestrator.
3.  Iteratively build out the other components and test scenarios.

This E2E testing plan provides a structured approach to verifying the SDKs. The key challenge will be accurately simulating the message bridging component based on how the actual Koii Node environment behaves. 