// Based on task_sdk/interface/message_schema.json and event_types.md

/**
 * Defines the valid event types that can be sent from the Orca agent.
 */
export type EventType = "status_update" | "log_entry" | "task_result" | "task_error";

/**
 * Represents the core structure of any message sent from the Orca agent.
 */
export interface OrcaToTaskMessage<T_Payload = any> {
  /** The unique identifier of the Orca task instance sending the message. */
  taskId: string;
  /** The type of event being reported. */
  eventType: EventType;
  /** ISO 8601 timestamp of when the event occurred in the Orca agent. */
  timestamp: string;
  /** The actual data associated with the event. Structure depends on eventType. */
  payload: T_Payload;
}

// --- Specific Payload Types --- 

/**
 * Payload for the `status_update` event.
 */
export interface StatusUpdatePayload {
  /** Descriptive status message (e.g., "Processing item 5/100", "Initializing resources") */
  message: string;
  /** Optional. A numerical value indicating progress (e.g., 0-100 for percentage) */
  progress?: number;
}

/**
 * Payload for the `log_entry` event.
 */
export interface LogEntryPayload {
  /** Log level: "info", "warn", "error" */
  level: "info" | "warn" | "error";
  /** The log message content */
  message: string;
  /** Optional. Any additional structured data related to the log entry */
  details?: Record<string, any>;
}

/**
 * Payload for the `task_result` event.
 */
export interface TaskResultPayload {
  /** Outcome status: "completed", "failed" */
  status: "completed" | "failed";
  /** Optional (but typically present on "completed"). The actual results produced by the task. */
  result_data?: Record<string, any>;
  /** Optional (but typically present on "failed"). A descriptive error message if the task failed. */
  error_message?: string;
}

/**
 * Payload for the `task_error` event.
 */
export interface TaskErrorPayload {
  /** Descriptive error message */
  message: string;
  /** Optional. Additional structured information about the error. */
  error_details?: Record<string, any>;
  /** Optional. Stack trace, if available. */
  stack_trace?: string;
}

// Union type for all possible payloads, can be useful for generic handlers
export type AnyOrcaPayload = 
  | StatusUpdatePayload 
  | LogEntryPayload 
  | TaskResultPayload 
  | TaskErrorPayload; 