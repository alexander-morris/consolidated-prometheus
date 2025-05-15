"use strict";
// e2e_tests/sdk_communication/test_task.ts
Object.defineProperty(exports, "__esModule", { value: true });
// Define LogLevel locally, mirroring what's in mock_namespace.ts and the SDK workaround
var LogLevel;
(function (LogLevel) {
    LogLevel["Info"] = "Info";
    LogLevel["Warn"] = "Warn";
    LogLevel["Error"] = "Error";
    LogLevel["Debug"] = "Debug";
})(LogLevel || (LogLevel = {}));
// Corrected relative path from dist_test_task/test_task.js to task_sdk/typescript/dist/
const index_1 = require("../../../task_sdk/typescript/dist/index");
const mock_namespace_1 = require("./mock_namespace");
function main() {
    console.log('[E2E TestTask] Starting...');
    const taskIdFromEnv = process.env.E2E_ORCA_TASK_ID || 'e2e-default-task-id';
    const mockNamespaceInstance = new mock_namespace_1.MockNamespace(taskIdFromEnv, "E2ETestTaskRunner");
    // Make it globally accessible for simplicity if TaskEventHandler relies on globalThis.namespaceInstance
    // This matches one of the access patterns in the SDK's getNamespace()
    globalThis.namespaceInstance = mockNamespaceInstance;
    const eventHandler = new index_1.TaskEventHandler(mockNamespaceInstance);
    eventHandler.notifyGui(LogLevel.Info, "E2E Test Task Executable Started Successfully.", "E2ETaskStart");
    // ** Placeholder for message reception logic **
    // This needs to be implemented based on Phase 0 findings (how messages arrive from the bridge)
    // Example assuming process.on('message') as per current SDK integration plan:
    process.on('message', (message) => {
        console.log('[E2E TestTask] Received IPC message:', JSON.stringify(message));
        if (message && message.eventType && message.payload && message.taskId) {
            try {
                eventHandler.handleIncomingMessage(message);
                console.log(`[E2E TestTask] Passed message to TaskEventHandler: ${message.eventType}`);
            }
            catch (e) {
                console.error("[E2E TestTask] Error passing message to TaskEventHandler:", e);
                eventHandler.notifyGui(LogLevel.Error, "E2E TestTask: Error in handleIncomingMessage", "E2EHandlerError");
            }
        }
        else {
            console.warn('[E2E TestTask] Received non-SDK IPC message:', JSON.stringify(message));
        }
    });
    console.log('[E2E TestTask] IPC message listener (process.on(\'message\')) attached.');
    console.log('[E2E TestTask] Ready to receive messages from Orca agent (via bridge).');
    // Keep the process alive to receive messages, or implement a specific exit condition
    // For testing, it might be triggered to exit by the orchestrator or after a timeout.
    // setTimeout(() => {
    //     console.log('[E2E TestTask] Exiting after timeout.');
    //     process.exit(0);
    // }, 30000); // Exit after 30 seconds if no other signal
}
main();
