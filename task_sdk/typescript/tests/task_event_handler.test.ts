// First, comment out the problematic dependency
/*
import { LogLevel } from '@koii-network/task-node'; // Assuming this is how LogLevel is imported
*/

// Define LogLevel locally for testing purposes if the package is unavailable
enum LogLevel { Info = 'Info', Warn = 'Warn', Error = 'Error', Debug = 'Debug' } 

// Import from the barrel file (index.ts)
import {
    TaskEventHandler,
    NamespaceLike,
    OrcaToTaskMessage,
    StatusUpdatePayload,
    LogEntryPayload,
    TaskResultPayload,
    TaskErrorPayload,
    EventType
} from '../src'; // Changed from ../src/task_event_handler and ../src/types

// Mock a basic NamespaceLike object
// Ensure all mocked functions are actual jest.fn() instances
const createMockNamespace = (): jest.Mocked<NamespaceLike> => ({
    taskData: { task_id: 'test-task-123', task_name: 'TestOrcaTask' },
    setLoggerCallback: jest.fn(),
    _loggerCallback: jest.fn(),
});

let mockNamespaceInstance: jest.Mocked<NamespaceLike>;

beforeEach(() => {
    mockNamespaceInstance = createMockNamespace();
    // mockNamespaceInstance.setLoggerCallback.mockClear(); // Cleared by jest.config.js clearMocks or fresh instance
    // mockNamespaceInstance._loggerCallback.mockClear();
});

describe('TaskEventHandler', () => {
    let eventHandler: TaskEventHandler;

    beforeEach(() => {
        mockNamespaceInstance = createMockNamespace(); // Use a fresh mock for each test
        eventHandler = new TaskEventHandler(mockNamespaceInstance);
        // Simulate that the constructor successfully captured/set the _loggerCallback
        // This relies on the internal logic of TaskEventHandler's constructor correctly using _loggerCallback if available
        // or capturing the one set by setLoggerCallback.
        // For testing, we can directly assign to capturedLoggerCallback if it was made accessible for tests,
        // or rely on the mock being called if the constructor logic works as intended.
        if (mockNamespaceInstance._loggerCallback) {
             (eventHandler as any).capturedLoggerCallback = mockNamespaceInstance._loggerCallback;
        }
    });

    it('should instantiate without errors', () => {
        expect(eventHandler).toBeInstanceOf(TaskEventHandler);
    });

    it('should call defaultMessageHandler for unhandled event types', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); // Suppress console output
        const notifyGuiSpy = jest.spyOn(eventHandler as any, 'notifyGui');
        
        const unknownEventType = 'unknown_event_type_test';
        const unknownMessage: OrcaToTaskMessage = {
            taskId: 'task-001',
            eventType: unknownEventType as EventType, // Cast for test purposes
            timestamp: new Date().toISOString(),
            payload: { data: 'some data' }
        };
        eventHandler.handleIncomingMessage(unknownMessage);
        
        expect(notifyGuiSpy).toHaveBeenCalledWith(
            LogLevel.Info, 
            expect.stringContaining(`Orca (task-0...) event: ${unknownEventType}`),
            `OrcaUnknownEvent_${unknownEventType}` // Updated expected action
        );
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(`Unknown eventType received: ${unknownEventType}`));
        consoleSpy.mockRestore();
        notifyGuiSpy.mockRestore();
    });

    it('should handle status_update with default handler', () => {
        const notifyGuiSpy = jest.spyOn(eventHandler as any, 'notifyGui');
        const payload: StatusUpdatePayload = { message: 'Processing...', progress: 50 };
        const message: OrcaToTaskMessage<StatusUpdatePayload> = {
            taskId: 'task-002',
            eventType: 'status_update',
            timestamp: new Date().toISOString(),
            payload
        };
        eventHandler.handleIncomingMessage(message);
        expect(notifyGuiSpy).toHaveBeenCalledWith(
            LogLevel.Info,
            'Orca Status (task-0...): Processing... (50%)',
            'OrcaStatusUpdate'
        );
        notifyGuiSpy.mockRestore();
    });

    it('should handle log_entry with default handler and map log levels', () => {
        const notifyGuiSpy = jest.spyOn(eventHandler as any, 'notifyGui');
        const payload: LogEntryPayload = { level: 'warn', message: 'A warning occurred' };
        const message: OrcaToTaskMessage<LogEntryPayload> = {
            taskId: 'task-003',
            eventType: 'log_entry',
            timestamp: new Date().toISOString(),
            payload
        };
        eventHandler.handleIncomingMessage(message);
        expect(notifyGuiSpy).toHaveBeenCalledWith(
            LogLevel.Warn,
            'Orca Log [WARN] (task-0...): A warning occurred',
            'OrcaLogEntry'
        );
        notifyGuiSpy.mockRestore();
    });

    it('should handle task_result (completed) with default handler', () => {
        const notifyGuiSpy = jest.spyOn(eventHandler as any, 'notifyGui');
        const payload: TaskResultPayload = { status: 'completed', result_data: { output: 'done' } };
        const message: OrcaToTaskMessage<TaskResultPayload> = {
            taskId: 'task-004',
            eventType: 'task_result',
            timestamp: new Date().toISOString(),
            payload
        };
        eventHandler.handleIncomingMessage(message);
        expect(notifyGuiSpy).toHaveBeenCalledWith(
            LogLevel.Info,
            'Orca Result (task-0...): Status - completed',
            'OrcaTaskResult'
        );
        notifyGuiSpy.mockRestore();
    });

    it('should handle task_result (failed) with default handler and error level', () => {
        const notifyGuiSpy = jest.spyOn(eventHandler as any, 'notifyGui');
        const payload: TaskResultPayload = { status: 'failed', error_message: 'It broke' };
        const message: OrcaToTaskMessage<TaskResultPayload> = {
            taskId: 'task-005',
            eventType: 'task_result',
            timestamp: new Date().toISOString(),
            payload
        };
        eventHandler.handleIncomingMessage(message);
        expect(notifyGuiSpy).toHaveBeenCalledWith(
            LogLevel.Error,
            'Orca Result (task-0...): Status - failed',
            'OrcaTaskResult'
        );
        notifyGuiSpy.mockRestore();
    });

    it('should handle task_error with default handler and error level', () => {
        const notifyGuiSpy = jest.spyOn(eventHandler as any, 'notifyGui');
        const payload: TaskErrorPayload = { message: 'Critical failure' };
        const message: OrcaToTaskMessage<TaskErrorPayload> = {
            taskId: 'task-006',
            eventType: 'task_error',
            timestamp: new Date().toISOString(),
            payload
        };
        eventHandler.handleIncomingMessage(message);
        expect(notifyGuiSpy).toHaveBeenCalledWith(
            LogLevel.Error,
            'Orca Error (task-0...): Critical failure',
            'OrcaTaskError'
        );
        notifyGuiSpy.mockRestore();
    });

    it('should call registered custom handler for an event type', () => {
        const customHandlerMock = jest.fn();
        eventHandler.on<StatusUpdatePayload>('status_update', customHandlerMock);

        const payload: StatusUpdatePayload = { message: 'Custom handling', progress: 10 };
        const message: OrcaToTaskMessage<StatusUpdatePayload> = {
            taskId: 'task-007',
            eventType: 'status_update',
            timestamp: new Date().toISOString(),
            payload
        };
        eventHandler.handleIncomingMessage(message);

        expect(customHandlerMock).toHaveBeenCalledTimes(1);
        expect(customHandlerMock).toHaveBeenCalledWith(payload, message);
    });

    it('should call notifyGui with correct parameters when custom handler does not exist', () => {
        const localMockNamespace = createMockNamespace();
        const handlerWithDirectLogger = new TaskEventHandler(localMockNamespace);
        (handlerWithDirectLogger as any).capturedLoggerCallback = localMockNamespace._loggerCallback; // Ensure captured

        const payload: LogEntryPayload = { level: 'info', message: 'Direct notify test' };
        const message: OrcaToTaskMessage<LogEntryPayload> = {
            taskId: 'task-notify',
            eventType: 'log_entry',
            timestamp: new Date().toISOString(),
            payload
        };
        handlerWithDirectLogger.handleIncomingMessage(message);

        expect(localMockNamespace._loggerCallback).toHaveBeenCalledWith(
            LogLevel.Info,
            'Orca Log [INFO] (task-n...): Direct notify test',
            'OrcaLogEntry'
        );
    });

    it('should handle invalid message structure gracefully', () => {
        const notifyGuiSpy = jest.spyOn(eventHandler as any, 'notifyGui');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const invalidMessage: any = { taskId: 'invalid-task', timestamp: new Date().toISOString() }; // Missing eventType and payload
        eventHandler.handleIncomingMessage(invalidMessage as OrcaToTaskMessage);

        expect(notifyGuiSpy).toHaveBeenCalledWith(
            LogLevel.Error,
            'Invalid message structure received from Orca agent.',
            'OrcaInvalidMessage'
        );
        expect(consoleErrorSpy).toHaveBeenCalled();

        notifyGuiSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should use fallback console.log if no logger callback is available on namespace', () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        
        const namespaceWithoutLogger: NamespaceLike = {
            taskData: { task_id: 'no-logger-task', task_name: 'NoLoggerTask' }
        };
        const handler = new TaskEventHandler(namespaceWithoutLogger);

        (handler as any).notifyGui(LogLevel.Info, 'Test message to console', 'TestAction');
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining('[NoLoggerTask][Info] SDK (no GUI logger): Test message to console (action: TestAction)')
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not initialize or capture logger callback'));
        
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });
}); 