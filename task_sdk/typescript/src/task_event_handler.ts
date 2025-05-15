// import { LogLevel } from '@koii-network/task-node'; // Assuming LogLevel is available
// Define LogLevel locally for testing purposes if the package is unavailable
enum LogLevel { Info = 'Info', Warn = 'Warn', Error = 'Error', Debug = 'Debug' } 

import { 
    OrcaToTaskMessage, 
    EventType, 
    StatusUpdatePayload, 
    LogEntryPayload,
    TaskResultPayload,
    TaskErrorPayload,
    AnyOrcaPayload
} from './types';

// ... rest of the file, ensure all uses of LogLevel refer to the local enum ...

export interface NamespaceLike {
    taskData: { task_id: string; task_name: string };
    setLoggerCallback?: (cb: (level: LogLevel, message: string, action: string) => void) => void;
    _loggerCallback?: (level: LogLevel, message: string, action: string) => void;
}

// ... (ensure LogLevel is used from the local enum throughout the class) ... 

export class TaskEventHandler {
    private namespace: NamespaceLike;
    private handlers: Map<EventType, (payload: AnyOrcaPayload, fullMessage: OrcaToTaskMessage) => void> = new Map();
    private capturedLoggerCallback: ((level: LogLevel, message: string, action: string) => void) | null = null;

    constructor(namespace: NamespaceLike) {
        this.namespace = namespace;
        this.initializeLoggerCallback();
    }

    private initializeLoggerCallback(): void {
        // Attempt to set and capture the logger callback
        if (this.namespace && typeof this.namespace.setLoggerCallback === 'function') {
            try {
                // Call setLoggerCallback, assuming it might internally store the callback
                // or make it available via _loggerCallback.
                this.namespace.setLoggerCallback((level, message, action) => {
                    // This dummy callback might be called by Namespace if it tests the cb.
                    // We don't need to do anything with it here if _loggerCallback becomes available.
                });
                // Prioritize _loggerCallback if it's set by setLoggerCallback or was already there
                if (this.namespace._loggerCallback) {
                    this.capturedLoggerCallback = this.namespace._loggerCallback;
                    // console.log("[TaskEventHandler] Captured _loggerCallback after setLoggerCallback.");
                }
            } catch (e) {
                console.warn("[TaskEventHandler] Error during setLoggerCallback: ", e);
            }
        }
        // If not captured via setLoggerCallback, try to get it directly if it already existed.
        if (!this.capturedLoggerCallback && this.namespace && this.namespace._loggerCallback) {
            this.capturedLoggerCallback = this.namespace._loggerCallback;
            // console.log("[TaskEventHandler] Captured _loggerCallback directly.");
        }

        if (this.capturedLoggerCallback) {
            this.capturedLoggerCallback(LogLevel.Info, "TaskEventHandler: Logger callback initialized.", "SDKLoggerInit");
        } else {
            console.warn("[TaskEventHandler] Could not initialize or capture logger callback from namespace. GUI notifications may not work.");
        }
    }

    public handleIncomingMessage(message: OrcaToTaskMessage): void {
        if (!message || !message.eventType || !message.payload || !message.taskId) {
            console.error("[TaskEventHandler] Invalid message received from Orca agent:", message);
            this.notifyGui(LogLevel.Error, "Invalid message structure received from Orca agent.", "OrcaInvalidMessage");
            return;
        }

        const handler = this.handlers.get(message.eventType);
        let handledByCustom = false;
        if (handler) {
            try {
                // Allow custom handler to signal that it fully handled the event by returning true
                const result = (handler as any)(message.payload, message);
                if (result === true) {
                    handledByCustom = true;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[TaskEventHandler] Error in custom handler for ${message.eventType}:`, error);
                this.notifyGui(LogLevel.Error, `SDK Error handling Orca event ${message.eventType}: ${errorMessage}`, 'SDKHandlerError');
            }
        }

        // Always run the default handler unless the custom handler explicitly signalled it has fully handled the message.
        if (!handledByCustom) {
            this.defaultMessageHandler(message);
        }
    }    

    private defaultMessageHandler(message: OrcaToTaskMessage): void {
        const { eventType, payload, taskId } = message;
        let guiLevel: LogLevel = LogLevel.Info;
        let guiMessage = `Orca (${taskId.substring(0,6)}...) event: ${eventType}`;
        let action: string = eventType; // Explicitly type action as string

        switch (eventType) {
            case "status_update":
                const statusPayload = payload as StatusUpdatePayload;
                guiMessage = `Orca Status (${taskId.substring(0,6)}...): ${statusPayload.message}`;
                if (statusPayload.progress !== undefined) {
                    guiMessage += ` (${statusPayload.progress}%)`;
                }
                action = "OrcaStatusUpdate";
                break;
            case "log_entry":
                const logPayload = payload as LogEntryPayload;
                guiLevel = logPayload.level === 'error' ? LogLevel.Error : logPayload.level === 'warn' ? LogLevel.Warn : LogLevel.Info;
                guiMessage = `Orca Log [${logPayload.level.toUpperCase()}] (${taskId.substring(0,6)}...): ${logPayload.message}`;
                action = "OrcaLogEntry";
                break;
            case "task_result":
                const resultPayload = payload as TaskResultPayload;
                guiMessage = `Orca Result (${taskId.substring(0,6)}...): Status - ${resultPayload.status}`;
                guiLevel = resultPayload.status === 'failed' ? LogLevel.Error : LogLevel.Info;
                action = "OrcaTaskResult";
                break;
            case "task_error":
                const errorPayload = payload as TaskErrorPayload;
                guiMessage = `Orca Error (${taskId.substring(0,6)}...): ${errorPayload.message}`;
                guiLevel = LogLevel.Error;
                action = "OrcaTaskError";
                break;
            default:
                const unknownEventType = eventType as string; 
                console.warn(`[TaskEventHandler] Unknown eventType received: ${unknownEventType}`);
                action = `OrcaUnknownEvent_${unknownEventType}`;
        }
        
        this.notifyGui(guiLevel, guiMessage, action);
    }

    public on<T_Payload extends AnyOrcaPayload>(
        eventType: EventType, 
        callback: (payload: T_Payload, fullMessage: OrcaToTaskMessage<T_Payload>) => void
    ): void {
        this.handlers.set(eventType, callback as any);
    }

    public notifyGui(level: LogLevel, message: string, action: string = "OrcaTaskSDKNotification"): void {
        const logger = this.capturedLoggerCallback;
        if (logger) {
            try {
                logger(level, message, action);
            } catch (e) {
                console.error("[TaskEventHandler] Error calling logger callback:", e, {level, message, action});
            }
        } else {
            const taskName = this.namespace?.taskData?.task_name || 'UnknownTask';
            console.log(`[${taskName}][${level}] SDK (no GUI logger): ${message} (action: ${action})`);
        }
    }
} 