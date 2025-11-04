import { IPCContext, IPCMessage, CallMessage, ResponseMessage } from './types';
import { SerializerType } from './serializer';
export declare class IPCUtils {
    private static serializer;
    private static lengthBufferPool;
    static setSerializer(type: SerializerType): void;
    /**
     * Serialize a message object to length-prefixed buffer
     *
     * Format:
     * [4 bytes: message length as UInt32BE][N bytes: JSON string]
     *
     * Example:
     * Message: { type: 'CALL', id: 'req-123', ... }
     * JSON: '{"type":"CALL","id":"req-123",...}' (50 bytes)
     * Output: [0x00, 0x00, 0x00, 0x32] + JSON bytes
     *
     * @param message - Message object to serialize
     * @returns Buffer ready to send over socket
     * @throws IPCError if serialization fails
     */
    static serialize(message: IPCMessage | any): Buffer;
    /**
     * Deserialize length-prefixed buffer to message object
     *
     * This is typically called after reading from socket
     * Expects buffer to contain: [4 bytes length][JSON body]
     *
     * @param buffer - Complete buffer with length prefix + JSON
     * @returns Parsed message object
     * @throws IPCError if deserialization fails
     */
    static deserialize(buffer: Buffer): any;
    /**
     * Read length prefix from buffer (without deserializing full message)
     * Useful for socket stream parsing to know how many bytes to read
     *
     * @param buffer - Buffer containing at least 4 bytes
     * @returns Message length in bytes
     */
    static readMessageLength(buffer: Buffer): number;
    /**
     * Check if buffer contains a complete message
     *
     * @param buffer - Accumulated buffer from socket
     * @returns true if buffer has complete message (length + body)
     */
    static hasCompleteMessage(buffer: Buffer): boolean;
    /**
     * Generate unique request ID
     *
     * Format: {prefix}-{timestamp}-{random}
     * Example: 'req-1699005123456-a7f3e9'
     *
     * @param prefix - ID prefix (default: 'req')
     * @returns Unique ID string
     */
    static generateId(prefix?: string): string;
    /**
     * Generate correlation ID for root request
     * Used as context.root for tracking entire call chain
     *
     * Format: 'root-{timestamp}-{random}'
     *
     * @returns Root correlation ID
     */
    static generateRootId(): string;
    /**
     * Create new context for a fresh request chain
     * Used when Gateway or Service initiates a new request
     *
     * @param serviceName - Name of service starting the chain
     * @param timeoutMs - Timeout duration in milliseconds (default: 30000)
     * @returns New IPCContext
     */
    static createContext(serviceName: string, timeoutMs?: number): IPCContext;
    /**
     * Extend context for nested call
     * Used when a service calls another service (adds to chain, increments depth)
     *
     * Example:
     * Original: { root: 'root-123', chain: ['gateway', 'order'], depth: 2 }
     * After extending with 'user-service':
     * { root: 'root-123', chain: ['gateway', 'order', 'user-service'], depth: 3 }
     *
     * @param context - Existing context from parent call
     * @param serviceName - Name of service making the nested call
     * @returns Extended context
     */
    static extendContext(context: IPCContext, serviceName: string): IPCContext;
    /**
     * Validate context object
     * Checks if context has all required fields
     *
     * @param context - Context to validate
     * @returns true if valid
     * @throws IPCError if invalid
     */
    static validateContext(context: any): context is IPCContext;
    /**
     * Check if context deadline has been exceeded
     * Used to determine if request has timed out
     *
     * @param context - Context to check
     * @returns true if current time > deadline
     */
    static isDeadlineExceeded(context: IPCContext): boolean;
    /**
     * Get remaining time before deadline (in milliseconds)
     * Useful for setting timeouts on nested calls
     *
     * @param context - Context to check
     * @returns Milliseconds remaining (0 if already exceeded)
     */
    static getRemainingTime(context: IPCContext): number;
    /**
     * Calculate timeout timestamp from duration
     *
     * @param durationMs - Timeout duration in milliseconds
     * @returns Unix timestamp (ms) when timeout occurs
     */
    static calculateDeadline(durationMs: number): number;
    /**
     * Create a CALL message
     * Helper for constructing properly formatted CALL messages
     *
     * @param from - Caller service name
     * @param to - Target service name
     * @param method - Method name to call
     * @param params - Method parameters
     * @param context - IPC context
     * @returns CallMessage object
     */
    static createCallMessage(from: string, to: string, method: string, params: any, context: IPCContext): CallMessage;
    /**
     * Create a success RESPONSE message
     *
     * @param originalCall - The CALL message being responded to
     * @param data - Result data
     * @returns ResponseMessage object
     */
    static createSuccessResponse(originalCall: CallMessage, data: any): ResponseMessage;
    /**
     * Create an error RESPONSE message
     *
     * @param originalCall - The CALL message being responded to
     * @param error - Error object or message
     * @returns ResponseMessage object
     */
    static createErrorResponse(originalCall: CallMessage, error: Error | string): ResponseMessage;
    /**
     * Validate message has required base fields
     *
     * @param message - Message to validate
     * @returns true if valid
     * @throws IPCError if invalid
     */
    static validateMessage(message: any): message is IPCMessage;
    /**
     * Check if max depth exceeded
     * Prevents infinite nested call loops
     *
     * @param context - Context to check
     * @param maxDepth - Maximum allowed depth (default: 100)
     * @returns true if depth exceeded
     */
    static isMaxDepthExceeded(context: IPCContext, maxDepth?: number): boolean;
    /**
     * Format message for logging (truncate large params/data)
     *
     * @param message - Message to format
     * @param maxLength - Max length for params/data (default: 100 chars)
     * @returns Formatted string
     */
    static formatMessageForLog(message: any, maxLength?: number): string;
    /**
     * Format context for logging
     *
     * @param context - Context to format
     * @returns Human-readable string
     */
    static formatContext(context: IPCContext): string;
    /**
     * Split accumulated buffer into multiple complete messages
     * Used when socket receives multiple messages in one chunk
     *
     * @param buffer - Accumulated buffer from socket
     * @returns Array of message objects and remaining buffer
     */
    static splitMessages(buffer: Buffer): {
        messages: any[];
        remaining: Buffer;
    };
    /**
     * Calculate exponential backoff delay
     * Used for reconnection attempts
     *
     * @param attempt - Current attempt number (0-based)
     * @param baseDelay - Base delay in ms (default: 1000)
     * @param maxDelay - Maximum delay in ms (default: 30000)
     * @returns Delay in milliseconds
     */
    static calculateBackoff(attempt: number, baseDelay?: number, maxDelay?: number): number;
    /**
     * Sleep for specified duration
     *
     * @param ms - Milliseconds to sleep
     * @returns Promise that resolves after delay
     */
    static sleep(ms: number): Promise<void>;
    /**
     * Create a timeout promise that rejects after specified duration
     *
     * @param ms - Timeout in milliseconds
     * @param message - Error message
     * @returns Promise that rejects after timeout
     */
    static createTimeoutPromise(ms: number, message?: string): Promise<never>;
}
