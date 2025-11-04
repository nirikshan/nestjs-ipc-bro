"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCUtils = void 0;
const types_1 = require("./types");
const serializer_1 = require("./serializer");
class IPCUtils {
    static setSerializer(type) {
        this.serializer = serializer_1.SerializerFactory.create(type);
    }
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
    static serialize(message) {
        try {
            const dataBuffer = this.serializer.serialize(message);
            const messageLength = dataBuffer.length;
            this.lengthBufferPool.writeUInt32BE(messageLength, 0);
            const finalBuffer = Buffer.allocUnsafe(4 + messageLength);
            this.lengthBufferPool.copy(finalBuffer, 0, 0, 4);
            dataBuffer.copy(finalBuffer, 4);
            return finalBuffer;
        }
        catch (error) {
            throw new types_1.IPCError(`Failed to serialize message: ${error.message}`, types_1.IPCErrorCode.SERIALIZATION_FAILED, { message, error });
        }
    }
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
    static deserialize(buffer) {
        try {
            if (buffer.length < 4) {
                throw new Error('Buffer too short to contain length prefix');
            }
            const messageLength = buffer.readUInt32BE(0);
            const dataBuffer = buffer.slice(4, 4 + messageLength);
            return this.serializer.deserialize(dataBuffer);
        }
        catch (error) {
            throw new types_1.IPCError(`Failed to deserialize message: ${error.message}`, types_1.IPCErrorCode.DESERIALIZATION_FAILED, { buffer: buffer.toString('hex'), error });
        }
    }
    /**
     * Read length prefix from buffer (without deserializing full message)
     * Useful for socket stream parsing to know how many bytes to read
     *
     * @param buffer - Buffer containing at least 4 bytes
     * @returns Message length in bytes
     */
    static readMessageLength(buffer) {
        if (buffer.length < 4) {
            throw new types_1.IPCError('Buffer too short to read length', types_1.IPCErrorCode.INVALID_MESSAGE);
        }
        return buffer.readUInt32BE(0);
    }
    /**
     * Check if buffer contains a complete message
     *
     * @param buffer - Accumulated buffer from socket
     * @returns true if buffer has complete message (length + body)
     */
    static hasCompleteMessage(buffer) {
        if (buffer.length < 4) {
            return false;
        }
        const messageLength = buffer.readUInt32BE(0);
        return buffer.length >= 4 + messageLength;
    }
    // ============================================================================
    // ID GENERATION
    // ============================================================================
    /**
     * Generate unique request ID
     *
     * Format: {prefix}-{timestamp}-{random}
     * Example: 'req-1699005123456-a7f3e9'
     *
     * @param prefix - ID prefix (default: 'req')
     * @returns Unique ID string
     */
    static generateId(prefix = 'req') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${prefix}-${timestamp}-${random}`;
    }
    /**
     * Generate correlation ID for root request
     * Used as context.root for tracking entire call chain
     *
     * Format: 'root-{timestamp}-{random}'
     *
     * @returns Root correlation ID
     */
    static generateRootId() {
        return this.generateId('root');
    }
    // ============================================================================
    // CONTEXT MANAGEMENT
    // ============================================================================
    /**
     * Create new context for a fresh request chain
     * Used when Gateway or Service initiates a new request
     *
     * @param serviceName - Name of service starting the chain
     * @param timeoutMs - Timeout duration in milliseconds (default: 30000)
     * @returns New IPCContext
     */
    static createContext(serviceName, timeoutMs = 30000) {
        const now = Date.now();
        return {
            root: this.generateRootId(),
            chain: [serviceName],
            depth: 1,
            deadline: now + timeoutMs,
        };
    }
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
    static extendContext(context, serviceName) {
        return {
            root: context.root,
            chain: [...context.chain, serviceName],
            depth: context.depth + 1,
            deadline: context.deadline,
        };
    }
    /**
     * Validate context object
     * Checks if context has all required fields
     *
     * @param context - Context to validate
     * @returns true if valid
     * @throws IPCError if invalid
     */
    static validateContext(context) {
        if (!context) {
            throw new types_1.IPCError('Context is null or undefined', types_1.IPCErrorCode.INVALID_CONTEXT);
        }
        if (!context.root || typeof context.root !== 'string') {
            throw new types_1.IPCError('Context missing or invalid "root" field', types_1.IPCErrorCode.INVALID_CONTEXT, { context });
        }
        if (!Array.isArray(context.chain)) {
            throw new types_1.IPCError('Context missing or invalid "chain" field', types_1.IPCErrorCode.INVALID_CONTEXT, { context });
        }
        if (typeof context.depth !== 'number' || context.depth < 1) {
            throw new types_1.IPCError('Context missing or invalid "depth" field', types_1.IPCErrorCode.INVALID_CONTEXT, { context });
        }
        if (typeof context.deadline !== 'number') {
            throw new types_1.IPCError('Context missing or invalid "deadline" field', types_1.IPCErrorCode.INVALID_CONTEXT, { context });
        }
        return true;
    }
    // ============================================================================
    // TIME & DEADLINE HELPERS
    // ============================================================================
    /**
     * Check if context deadline has been exceeded
     * Used to determine if request has timed out
     *
     * @param context - Context to check
     * @returns true if current time > deadline
     */
    static isDeadlineExceeded(context) {
        return Date.now() > context.deadline;
    }
    /**
     * Get remaining time before deadline (in milliseconds)
     * Useful for setting timeouts on nested calls
     *
     * @param context - Context to check
     * @returns Milliseconds remaining (0 if already exceeded)
     */
    static getRemainingTime(context) {
        const remaining = context.deadline - Date.now();
        return remaining > 0 ? remaining : 0;
    }
    /**
     * Calculate timeout timestamp from duration
     *
     * @param durationMs - Timeout duration in milliseconds
     * @returns Unix timestamp (ms) when timeout occurs
     */
    static calculateDeadline(durationMs) {
        return Date.now() + durationMs;
    }
    // ============================================================================
    // MESSAGE HELPERS
    // ============================================================================
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
    static createCallMessage(from, to, method, params, context) {
        return {
            type: 'CALL',
            id: this.generateId(),
            from,
            to,
            method,
            params,
            context,
        };
    }
    /**
     * Create a success RESPONSE message
     *
     * @param originalCall - The CALL message being responded to
     * @param data - Result data
     * @returns ResponseMessage object
     */
    static createSuccessResponse(originalCall, data) {
        return {
            type: 'RESPONSE',
            id: originalCall.id,
            from: originalCall.to,
            to: originalCall.from,
            status: 'success',
            data,
            context: originalCall.context,
        };
    }
    /**
     * Create an error RESPONSE message
     *
     * @param originalCall - The CALL message being responded to
     * @param error - Error object or message
     * @returns ResponseMessage object
     */
    static createErrorResponse(originalCall, error) {
        const errorObj = typeof error === 'string'
            ? { message: error }
            : {
                message: error.message,
                code: error.code,
                stack: error.stack,
            };
        return {
            type: 'RESPONSE',
            id: originalCall.id,
            from: originalCall.to,
            to: originalCall.from,
            status: 'error',
            error: errorObj,
            context: originalCall.context,
        };
    }
    // ============================================================================
    // VALIDATION HELPERS
    // ============================================================================
    /**
     * Validate message has required base fields
     *
     * @param message - Message to validate
     * @returns true if valid
     * @throws IPCError if invalid
     */
    static validateMessage(message) {
        if (!message || typeof message !== 'object') {
            throw new types_1.IPCError('Message is not an object', types_1.IPCErrorCode.INVALID_MESSAGE);
        }
        if (!message.type) {
            throw new types_1.IPCError('Message missing "type" field', types_1.IPCErrorCode.INVALID_MESSAGE, { message });
        }
        return true;
    }
    /**
     * Check if max depth exceeded
     * Prevents infinite nested call loops
     *
     * @param context - Context to check
     * @param maxDepth - Maximum allowed depth (default: 100)
     * @returns true if depth exceeded
     */
    static isMaxDepthExceeded(context, maxDepth = 100) {
        return context.depth > maxDepth;
    }
    // ============================================================================
    // DEBUG HELPERS
    // ============================================================================
    /**
     * Format message for logging (truncate large params/data)
     *
     * @param message - Message to format
     * @param maxLength - Max length for params/data (default: 100 chars)
     * @returns Formatted string
     */
    static formatMessageForLog(message, maxLength = 100) {
        try {
            const msg = { ...message };
            // Truncate params if too large
            if (msg.params && JSON.stringify(msg.params).length > maxLength) {
                msg.params = JSON.stringify(msg.params).substring(0, maxLength) + '...';
            }
            // Truncate data if too large
            if (msg.data && JSON.stringify(msg.data).length > maxLength) {
                msg.data = JSON.stringify(msg.data).substring(0, maxLength) + '...';
            }
            return JSON.stringify(msg);
        }
        catch (error) {
            return '[Error formatting message]';
        }
    }
    /**
     * Format context for logging
     *
     * @param context - Context to format
     * @returns Human-readable string
     */
    static formatContext(context) {
        return `[${context.root}] ${context.chain.join(' → ')} (depth: ${context.depth})`;
    }
    // ============================================================================
    // BUFFER UTILITIES
    // ============================================================================
    /**
     * Split accumulated buffer into multiple complete messages
     * Used when socket receives multiple messages in one chunk
     *
     * @param buffer - Accumulated buffer from socket
     * @returns Array of message objects and remaining buffer
     */
    static splitMessages(buffer) {
        const messages = [];
        let offset = 0;
        while (offset < buffer.length) {
            if (buffer.length - offset < 4) {
                break;
            }
            const messageLength = buffer.readUInt32BE(offset);
            const totalLength = 4 + messageLength;
            if (buffer.length - offset < totalLength) {
                break;
            }
            const messageBuffer = buffer.slice(offset, offset + totalLength);
            const message = this.deserialize(messageBuffer);
            messages.push(message);
            offset += totalLength;
        }
        const remaining = buffer.slice(offset);
        return { messages, remaining };
    }
    // ============================================================================
    // RETRY HELPERS
    // ============================================================================
    /**
     * Calculate exponential backoff delay
     * Used for reconnection attempts
     *
     * @param attempt - Current attempt number (0-based)
     * @param baseDelay - Base delay in ms (default: 1000)
     * @param maxDelay - Maximum delay in ms (default: 30000)
     * @returns Delay in milliseconds
     */
    static calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
        const delay = baseDelay * Math.pow(2, attempt);
        return Math.min(delay, maxDelay);
    }
    // ============================================================================
    // ASYNC HELPERS
    // ============================================================================
    /**
     * Sleep for specified duration
     *
     * @param ms - Milliseconds to sleep
     * @returns Promise that resolves after delay
     */
    static sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Create a timeout promise that rejects after specified duration
     *
     * @param ms - Timeout in milliseconds
     * @param message - Error message
     * @returns Promise that rejects after timeout
     */
    static createTimeoutPromise(ms, message = 'Operation timed out') {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new types_1.IPCError(message, types_1.IPCErrorCode.TIMEOUT));
            }, ms);
        });
    }
}
exports.IPCUtils = IPCUtils;
IPCUtils.serializer = serializer_1.SerializerFactory.create('msgpack');
IPCUtils.lengthBufferPool = Buffer.allocUnsafe(4);
