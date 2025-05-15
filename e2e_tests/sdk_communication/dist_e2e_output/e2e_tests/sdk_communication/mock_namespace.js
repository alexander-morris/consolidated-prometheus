"use strict";
// e2e_tests/sdk_communication/mock_namespace.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockNamespace = void 0;
// Define LogLevel locally for E2E testing purposes if SDK doesn't export it due to temp workarounds
var LogLevel;
(function (LogLevel) {
    LogLevel["Info"] = "Info";
    LogLevel["Warn"] = "Warn";
    LogLevel["Error"] = "Error";
    LogLevel["Debug"] = "Debug";
})(LogLevel || (LogLevel = {}));
class MockNamespace {
    // private loggerCallback: ((level: LogLevel, message: string, action: string) => void) | null = null;
    constructor(taskId = 'e2e-test-task-id', taskName = 'E2ETestTask') {
        this.capturedCalls = [];
        // This is the method TaskEventHandler.notifyGui() will actually try to call on the namespace instance.
        this._loggerCallback = (level, message, action) => {
            const call = {
                level,
                message,
                action,
                timestamp: new Date().toISOString()
            };
            this.capturedCalls.push(call);
            console.log(`E2E_NAMESPACE_LOG:::${JSON.stringify(call)}`);
        };
        // setLoggerCallback is optional in NamespaceLike, so if TaskEventHandler calls it,
        // we just acknowledge it. The important part is that TaskEventHandler uses _loggerCallback.
        this.setLoggerCallback = (cb) => {
            // In a real scenario, the TaskEventHandler would call this, and the Namespace would store cb.
            // For this mock, TaskEventHandler will directly use _loggerCallback if it exists on the passed namespace instance.
            // This mock primarily provides _loggerCallback for TaskEventHandler to use.
            // console.log("[MockNamespace] setLoggerCallback was called.");
        };
        this.taskData = { task_id: taskId, task_name: taskName };
        console.log(`[MockNamespace] Initialized for ${taskName} (${taskId})`);
    }
    // --- Other NamespaceLike methods (if any were defined and needed) ---
    // storeSet = async (key: string, value: any): Promise<void> => {
    //     console.log(`[MockNamespace] storeSet: key=${key}, value=${value}`);
    // };
    // storeGet = async (key: string): Promise<any> => {
    //     console.log(`[MockNamespace] storeGet: key=${key}`);
    //     return null;
    // };
    getCapturedCalls() {
        return this.capturedCalls;
    }
    clearCapturedCalls() {
        this.capturedCalls = [];
    }
}
exports.MockNamespace = MockNamespace;
