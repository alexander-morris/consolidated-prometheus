// e2e_tests/sdk_communication/mock_namespace.ts

// Define LogLevel locally for E2E testing purposes if SDK doesn't export it due to temp workarounds
enum LogLevel { Info = 'Info', Warn = 'Warn', Error = 'Error', Debug = 'Debug' }

// Import from SDK source
import { NamespaceLike } from '../../task_sdk/typescript/src/index'; 

interface CapturedCall {
    level: LogLevel;
    message: string;
    action: string;
    timestamp: string;
}

export class MockNamespace implements NamespaceLike {
    public taskData: { task_id: string; task_name: string };
    public capturedCalls: CapturedCall[] = [];
    // private loggerCallback: ((level: LogLevel, message: string, action: string) => void) | null = null;

    constructor(taskId: string = 'e2e-test-task-id', taskName: string = 'E2ETestTask') {
        this.taskData = { task_id: taskId, task_name: taskName };
        console.log(`[MockNamespace] Initialized for ${taskName} (${taskId})`);
    }

    // This is the method TaskEventHandler.notifyGui() will actually try to call on the namespace instance.
    _loggerCallback = (level: LogLevel, message: string, action: string): void => {
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
    setLoggerCallback = (cb: (level: LogLevel, message: string, action: string) => void): void => {
        // In a real scenario, the TaskEventHandler would call this, and the Namespace would store cb.
        // For this mock, TaskEventHandler will directly use _loggerCallback if it exists on the passed namespace instance.
        // This mock primarily provides _loggerCallback for TaskEventHandler to use.
        // console.log("[MockNamespace] setLoggerCallback was called.");
    };

    // --- Other NamespaceLike methods (if any were defined and needed) ---
    // storeSet = async (key: string, value: any): Promise<void> => {
    //     console.log(`[MockNamespace] storeSet: key=${key}, value=${value}`);
    // };

    // storeGet = async (key: string): Promise<any> => {
    //     console.log(`[MockNamespace] storeGet: key=${key}`);
    //     return null;
    // };

    public getCapturedCalls(): CapturedCall[] {
        return this.capturedCalls;
    }

    public clearCapturedCalls(): void {
        this.capturedCalls = [];
    }
} 