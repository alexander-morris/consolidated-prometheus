// e2e_tests/sdk_communication/test_task.ts

// Define LogLevel locally, mirroring what's in mock_namespace.ts and the SDK workaround
enum LogLevel { Info = 'Info', Warn = 'Warn', Error = 'Error', Debug = 'Debug' }

// Import from SDK source, to be compiled along with this file by tsconfig.task.json
import { 
    TaskEventHandler, 
    OrcaToTaskMessage, 
    NamespaceLike, 
    LogEntryPayload, 
    TaskResultPayload,
    StatusUpdatePayload // Added for custom handler example
} from '../../task_sdk/typescript/src/index';
import { MockNamespace } from './mock_namespace';

function main() {
    console.log('[E2E TestTask] Starting (Full Suite Mode)...');

    const taskIdFromEnv = process.env.E2E_ORCA_TASK_ID || 'e2e-default-task-id-s4';
    const mockNamespaceInstance = new MockNamespace(taskIdFromEnv, "E2ETestTaskRunnerS4");
    
    // Make it globally accessible for simplicity if TaskEventHandler relies on globalThis.namespaceInstance
    // This matches one of the access patterns in the SDK's getNamespace()
    (globalThis as any).namespaceInstance = mockNamespaceInstance;

    const eventHandler = new TaskEventHandler(mockNamespaceInstance);

    eventHandler.notifyGui(LogLevel.Info, "E2E Test Task (Full Suite) Started Successfully.", "E2ETaskStartS4");

    // --- Register Custom Handlers for E2E-S4 ---
    eventHandler.on<StatusUpdatePayload>("status_update", (payload: StatusUpdatePayload, fullMessage: OrcaToTaskMessage<StatusUpdatePayload>) => {
        console.log(`[E2E TestTask Custom Status Handler] Task ${fullMessage.taskId}: ${payload.message} (${payload.progress}%)`);
        // Optionally, also call the default behavior if you want it to go to GUI via default formatting
        // For this test, we let the default handler also run to ensure it still calls notifyGui.
        // To truly override, the SDK's TaskEventHandler might need a way for custom handlers to prevent default.
    });

    eventHandler.on<TaskResultPayload>("task_result", (payload: TaskResultPayload, fullMessage: OrcaToTaskMessage<TaskResultPayload>) => {
        console.log(`[E2E TestTask Custom Result Handler] Task ${fullMessage.taskId} result: ${payload.status}`);
        if (payload.status === "completed") {
            mockNamespaceInstance._loggerCallback( // Directly use mock for specific E2E log
                LogLevel.Info, 
                `Custom: Task ${fullMessage.taskId} completed successfully with data: ${JSON.stringify(payload.result_data)}`,
                "E2ECustomResultComplete"
            );
        }
    });
    // --- End Custom Handlers ---

    // ** Placeholder for message reception logic **
    // This needs to be implemented based on Phase 0 findings (how messages arrive from the bridge)
    // Example assuming process.on('message') as per current SDK integration plan:
    process.on('message', (message: any) => {
        // console.log('[E2E TestTask] Received IPC message:', JSON.stringify(message)); // Can be noisy
        if (message && message.eventType && message.payload && message.taskId) {
            try {
                eventHandler.handleIncomingMessage(message as OrcaToTaskMessage);
                // console.log(`[E2E TestTask] Passed message to TaskEventHandler: ${message.eventType}`);
            } catch (e) {
                console.error("[E2E TestTask] Error passing message to TaskEventHandler:", e);
                eventHandler.notifyGui(LogLevel.Error, "E2E TestTask: Error in handleIncomingMessage", "E2EHandlerError");
            }
        } else {
            console.warn('[E2E TestTask] Received non-SDK IPC message:', JSON.stringify(message));
        }
    });
    console.log('[E2E TestTask] IPC message listener attached. Ready for full suite.');

    // Keep the process alive to receive messages, or implement a specific exit condition
    // For testing, it might be triggered to exit by the orchestrator or after a timeout.
    // setTimeout(() => {
    //     console.log('[E2E TestTask] Exiting after timeout.');
    //     process.exit(0);
    // }, 30000); // Exit after 30 seconds if no other signal
}

main(); 