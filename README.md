# Pro-Me-The-Us

A combined repository containing:

- `coordinator/` - Contains the middleware server (from [middle-server](https://github.com/Prometheus-Swarm/middle-server))
- `node/` - Contains the feature builder components (from [feature-builder](https://github.com/Prometheus-Swarm/feature-builder))

## Structure

This repository brings together multiple components of the Prometheus-Swarm project for easier development and integration.

### Coordinator

The coordinator component handles middleware operations and communication between various services.

### Node

The node component contains the feature builder functionality with planner and worker subcomponents.

## Setup

Each subdirectory has its own setup instructions and dependencies. Please refer to their individual README files.

## End-to-End SDK Communication Tests

A self-contained test harness lives in `e2e_tests/sdk_communication/`.  It validates the full journey of a message that originates in (simulated) Python code inside an Orca agent and is rendered in the JavaScript task's GUI logger.

### What gets tested
1. **Python side** – `mock_orca_agent.py` fabricates the same JSON events (`status_update`, `log_entry`, `task_error`, `task_result`, …) that a real Orca container would emit via the Python SDK.
2. **Bridge** – `run_e2e_test.js` captures the agent's stdout, parses each JSON line, and forwards it to the forked JS task using Node's built-in IPC (`child_process.send`).  This mirrors the bridge that the real `@_koii/orca-node` listener performs.
3. **JavaScript task** – `test_task.ts` (compiled on-the-fly) instantiates `TaskEventHandler` from the TypeScript SDK with a mocked `Namespace` object.  It receives every IPC message and passes it into the SDK.
4. **GUI logging** – The SDK formats each message and routes it to the mock namespace's `loggerCallback`, which writes structured log lines.  The orchestrator watches for those lines to assert correct behaviour.

### Scenarios executed
* **S3 – Single message** Verifies a lone `status_update` travels the full path and appears in GUI output.
* **S4 – Full suite** Streams seven distinct events covering status updates, log levels, an error and a result; confirms both default handlers and user-defined custom handlers execute.

### Running the suite
```bash
cd e2e_tests/sdk_communication
npm install        # one-time dev dependencies
npm test           # compiles TS, runs Python & JS children, asserts output
```
Successful run prints:
```
[E2E Orchestrator] Test S3 PASSED.
[E2E Orchestrator] Test S4 PASSED.
[E2E Orchestrator] All E2E scenarios executed.
```

### Adapting the test to a real Orca container
The current harness runs the Python script on the host for speed.  To swap in an actual Docker image:
1. Build or pull the Orca task image locally.
2. Run it with at least these environment variables:
   * `ORCA_TASK_ID=<some-uuid>`
   * `PARENT_NODE_CALLBACK_URL` – can be left blank when you rely on stdout sampling.
3. Replace the spawn of `mock_orca_agent.py` in `run_e2e_test.js` with `docker run …` and pipe its stdout into the same forwarding logic (one JSON message per line).

Everything else—SDKs, message types, GUI logging—remains unchanged, so the assertions will still validate the end-to-end communication. 