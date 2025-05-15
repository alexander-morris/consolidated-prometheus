# SDK for Orca-Agent to Task Communication: TODO List

This list breaks down the `sdk-orca-task-plan.md` into a linear sequence of actionable TODO items, considering dependencies and testing.\n
## Phase 0: Pre-requisites & Setup

- [X] **TODO:** Create the main SDK directory: `pro-me-the-us/task_sdk/`
- [X] **TODO:** Inside `pro-me-the-us/task_sdk/`, create subdirectories: `python/`, `typescript/`, and `interface/`.
- [X] **TODO:** Confirm the exact mechanism for message delivery from the `@_koii/orca-node` local listener to the forked JS `task` executable (confirmed to be `process.on('message')`).
    *   *Outcome: Implemented in `e2e_tests/sdk_communication/test_task.ts`; SDK now listens via IPC and E2E scenarios pass.*

## Phase 1: Define the Communication Contract

- [X] **TODO:** Create `pro-me-the-us/task_sdk/interface/message_schema.json`.
    *   *Action: Define the core JSON schema for `OrcaToTaskMessage` including `taskId`, `eventType`, `timestamp`, and `payload` properties.*
- [X] **TODO:** Create `pro-me-the-us/task_sdk/interface/event_types.md`.
    *   *Action: Document the initial set of `eventType` values (`status_update`, `log_entry`, `task_result`, `task_error`) and the expected structure for their respective `payload` objects.*
    *   *Reference: `orca-integration.md` and `koii-node/src/main/controllers/startTask.ts` (Namespace logger) for inspiration on payload structures.*

## Phase 2: Develop Python SDK for `orca-agent`

- [X] **TODO:** Create directory structure for Python SDK: `pro-me-the-us/task_sdk/python/src/orca_task_sdk/`.
- [X] **TODO:** Create `pro-me-the-us/task_sdk/python/src/orca_task_sdk/__init__.py`.
- [X] **TODO:** Implement the `OrcaTaskClient` class in `pro-me-the-us/task_sdk/python/src/orca_task_sdk/client.py`.
    *   *Action: Include constructor to read `PARENT_NODE_CALLBACK_URL` and `ORCA_TASK_ID` from environment variables.*
    *   *Action: Implement the private `_send_message` method to format and POST messages.*
    *   *Action: Implement public methods: `send_status_update`, `send_log_entry`, `send_task_result`, `send_task_error`.*
- [X] **TODO:** Create `pro-me-the-us/task_sdk/python/setup.py` to make the SDK installable (locally for now).
- [X] **TODO:** Write Unit Tests for the Python SDK (`OrcaTaskClient`) in `task_sdk/python/tests/test_client.py`.
- [X] **TODO:** Create a mock HTTP listener (`task_sdk/python/tests/mock_listener.py`).
- [X] **TODO:** Perform Integration Test: Python SDK to Mock Listener (`task_sdk/python/tests/test_client_integration.py`).

## Phase 3: Develop TypeScript Library/SDK for `task` Executable

- [X] **TODO:** Create directory structure for TypeScript SDK: `pro-me-the-us/task_sdk/typescript/src/`.
- [X] **TODO:** Create `pro-me-the-us/task_sdk/typescript/package.json` (for dependencies like `@koii-network/task-node` if needed for types, and for building).
- [X] **TODO:** Create `task_sdk/typescript/tsconfig.json`.
- [X] **TODO:** Create `task_sdk/typescript/jest.config.js`.
- [X] **TODO:** Define TypeScript interfaces in `pro-me-the-us/task_sdk/typescript/src/types.ts` based on `message_schema.json` and `event_types.md`.
    *   *Action: Include `OrcaToTaskMessage`, `EventType`, and specific payload interfaces.*
- [X] **TODO:** Implement the `TaskEventHandler` class in `pro-me-the-us/task_sdk/typescript/src/task_event_handler.ts`.
    *   *Action: Implement constructor taking a `NamespaceLike` object.*
    *   *Action: Implement `handleIncomingMessage` method (this will depend on findings from Phase 0 for how messages arrive).*
    *   *Action: Implement `defaultMessageHandler` to translate messages and use `notifyGui`.*
    *   *Action: Implement `on(eventType, callback)` method for registering custom handlers.*
    *   *Action: Implement `notifyGui` method to interact with the `NamespaceLike` object\'s logger callback (e.g., `_loggerCallback`).*
- [X] **TODO:** Create `pro-me-the-us/task_sdk/typescript/src/index.ts` to export SDK components.
- [X] **TODO:** Write Unit Tests for the TypeScript SDK (`TaskEventHandler`) in `task_sdk/typescript/tests/task_event_handler.test.ts`.
- [X] **TODO:** Perform Integration Test: Mocked Orca Messages to TypeScript SDK (covered by unit tests).

## Phase 4: Integrate SDKs into `pro-me-the-us/node`

- [X] **TODO:** Integrate Python SDK into `pro-me-the-us/node/worker/orca-agent/` (specifically `task_service.py`).
- [X] **TODO:** Update `pro-me-the-us/node/worker/orca-agent/requirements.txt` for the Python SDK.
- [X] **TODO:** Integrate TypeScript SDK into `pro-me-the-us/node/worker/src/task/1-task.ts` (and other relevant task executables).
    *   **Status: Completed.** `TaskEventHandler` instantiated with the task's `Namespace` and wired to the IPC `process.on('message')` listener pattern (mirrors implementation used in E2E test task).*  
    *   *Action: Linter/build issues resolved via updated tsconfig paths and dependency declarations.*
- [X] **TODO:** Review and add `ORCA_TASK_ID` and `PARENT_NODE_CALLBACK_URL` (placeholder) to `pro-me-the-us/node/worker/src/orcaSettings.ts`.

## Phase 5: Documentation

- [X] **TODO:** Write README for Python SDK: `pro-me-the-us/task_sdk/python/README.md`.
    *   *Action: Include installation, instantiation, and usage examples for `OrcaTaskClient`.*
- [X] **TODO:** Write README for TypeScript SDK: `pro-me-the-us/task_sdk/typescript/README.md`.
    *   *Action: Include installation, instantiation of `TaskEventHandler`, and examples for handling incoming messages and notifying the GUI.*
- [X] **TODO:** Review and finalize `pro-me-the-us/task_sdk/interface/event_types.md` and `message_schema.json`.

## Phase 6: End-to-End (E2E) Testing (Based on e2e.md)

- [X] **TODO:** Create E2E test directory structure: `pro-me-the-us/e2e_tests/sdk_communication/`.
- [X] **TODO (E2E-S1):** Implement `e2e_tests/sdk_communication/mock_namespace.ts`.
- [X] **TODO (E2E-S1):** Implement basic `e2e_tests/sdk_communication/test_task.ts` (instantiates `TaskEventHandler` with `MockNamespace`, logs startup via SDK).
- [X] **TODO (E2E-S1):** Implement `e2e_tests/sdk_communication/run_e2e_test.js` (orchestrator: compiles `test_task.ts`, runs it, verifies startup log).
    *   *Sub-Task: Create `e2e_tests/sdk_communication/package.json` for Jest, ts-node etc.*
    *   *Sub-Task: Create `e2e_tests/sdk_communication/tsconfig.json` for `test_task.ts` compilation.*
- [X] **TODO (E2E-S2):** Implement `e2e_tests/sdk_communication/mock_orca_agent.py` (uses Python SDK to send messages; transitioned to stdout JSON bridge).
- [X] **TODO (E2E-S2):** Implement `e2e_tests/sdk_communication/mock_listener_bridge.py` OR adapt `run_e2e_test.js` for direct IPC (we chose direct IPC; bridge script retained for future use).
- [X] **TODO (E2E-S3):** Update `e2e_tests/sdk_communication/test_task.ts` to use the confirmed message reception mechanism.
- [X] **TODO (E2E-S3):** Update `e2e_tests/sdk_communication/run_e2e_test.js` to connect Python->Bridge->JS and verify a single `status_update` message flow.
- [X] **TODO (E2E-S4):** Extend `mock_orca_agent.py` for full message suite.
- [X] **TODO (E2E-S4):** Extend `test_task.ts` with custom handlers (status_update & task_result).
- [X] **TODO (E2E-S4):** Update `run_e2e_test.js` to orchestrate and verify the full message suite.
- [ ] **TODO (E2E-S5 - Optional):** Implement error condition tests (malformed messages, bridge failure, Python SDK connection errors).
- [X] **TODO:** Iterate on SDKs and integration based on E2E test results (default handler now runs alongside custom handlers; tests pass).

## Phase 7: Final Review & Cleanup

- [ ] **TODO:** Conduct a final code review of both SDKs and the integrated code in `pro-me-the-us/node/`.
- [ ] **TODO:** Ensure all documentation is up-to-date and reflects any changes from E2E testing.
- [ ] **TODO:** Clean up any temporary test code or mock servers if not part of a permanent test suite.

---
*This list will be updated as tasks are completed or new details emerge.* 