"use strict";
/**
 * IPC Client - Service Client for Brodox IPC System
 *
 * This is the client that each microservice uses to:
 * - Connect to Gateway's Unix socket
 * - Register itself with available methods
 * - Receive CALL messages and execute local methods
 * - Call other services (send CALL, wait for RESPONSE)
 * - Handle automatic reconnection
 * - Manage pending requests (promise tracking)
 *
 * Architecture:
 *    Service (Order/User/Cart)
 *           |
 *      IPCClient (this file)
 *           |
 *      Unix Socket
 *           |
 *      Gateway (/tmp/brodox-gateway.sock)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCClient = void 0;
const net = __importStar(require("net"));
const events_1 = require("events");
const types_1 = require("./types");
const utils_1 = require("./utils");
const connection_pool_1 = require("./connection-pool");
class IPCClient extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.socket = null;
        // Connection state
        this.connected = false;
        this.registered = false;
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.connectionPool = null;
        // Buffer management (for incoming data)
        this.receiveBuffer = Buffer.alloc(0);
        // Heartbeat
        this.heartbeatTimer = null;
        // Current execution context (for nested calls)
        // Stores context during method execution so nested calls can access it
        this.executionContext = null;
        this.usePool = true;
        // Validate required config
        if (!config.serviceName) {
            throw new types_1.IPCError("serviceName is required in config", types_1.IPCErrorCode.INVALID_MESSAGE);
        }
        // Merge with defaults
        this.config = {
            serviceName: config.serviceName,
            gatewayPath: config.gatewayPath || "/tmp/brodox-gateway.sock",
            autoReconnect: config.autoReconnect !== false, // Default true
            reconnectDelay: config.reconnectDelay || 5000,
            timeout: config.timeout || 30000,
            heartbeatInterval: config.heartbeatInterval || 30000,
            debug: config.debug || false,
            serializer: config.serializer || "msgpack",
            poolSize: config.poolSize || 1,
        };
        utils_1.IPCUtils.setSerializer(this.config.serializer);
        this.serviceName = this.config.serviceName;
        this.gatewayPath = this.config.gatewayPath;
        this.availableMethods = new Map();
        this.pendingRequests = new Map();
        this.log("IPCClient initialized", { serviceName: this.serviceName });
    }
    // ============================================================================
    // PUBLIC METHODS - CONNECTION
    // ============================================================================
    /**
     * Connect to Gateway
     *
     * Steps:
     * 1. Create socket connection
     * 2. Setup event listeners
     * 3. Wait for connection
     * 4. Send REGISTER message
     * 5. Start heartbeat
     * 6. Emit 'connected' event
     *
     * @returns Promise that resolves when connected and registered
     */
    async connect() {
        if (this.connected) {
            return;
        }
        try {
            this.log("Connecting to Gateway", { gatewayPath: this.gatewayPath });
            // Check if should use pool
            if (this.usePool && this.config.poolSize > 1) {
                //   FIX: Pass methods to pool
                this.connectionPool = new connection_pool_1.ConnectionPool({
                    gatewayPath: this.gatewayPath,
                    poolSize: this.config.poolSize,
                    serviceName: this.serviceName,
                    methods: Array.from(this.availableMethods.keys()), // ← ADD THIS
                });
                //   FIX: Setup message handler for pool
                this.connectionPool.on("message", (message) => {
                    this.handleMessage(message);
                });
                this.connectionPool.on("error", (error) => {
                    this.emit("error", error);
                });
                await this.connectionPool.createPool();
                this.connected = true;
                this.registered = true;
                this.log("Connected with connection pool", {
                    poolSize: this.config.poolSize,
                });
            }
            else {
                // Original single connection logic
                this.socket = new net.Socket();
                this.setupSocketListeners();
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new types_1.IPCError("Connection timeout", types_1.IPCErrorCode.CONNECTION_FAILED));
                    }, 10000);
                    this.socket.connect(this.gatewayPath, () => {
                        clearTimeout(timeout);
                        this.connected = true;
                        this.reconnectAttempts = 0;
                        this.log("Socket connected");
                        resolve();
                    });
                    this.socket.once("error", (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                });
                await this.register();
            }
            this.startHeartbeat();
            this.emit("connected");
        }
        catch (error) {
            this.log("Connection failed", { error: error.message });
            if (this.config.autoReconnect && !this.reconnecting) {
                this.scheduleReconnect();
            }
            throw new types_1.IPCError(`Failed to connect: ${error.message}`, types_1.IPCErrorCode.CONNECTION_FAILED, { error });
        }
    }
    /**
     * Disconnect from Gateway
     *
     * Steps:
     * 1. Stop heartbeat
     * 2. Reject all pending requests
     * 3. Close socket
     * 4. Clean up state
     * 5. Emit 'disconnected' event
     */
    async disconnect() {
        this.log("Disconnecting from Gateway");
        this.stopHeartbeat();
        // Reject all pending requests
        for (const [requestId, request] of this.pendingRequests.entries()) {
            request.reject(new types_1.IPCError("Client disconnected", types_1.IPCErrorCode.NOT_CONNECTED, {
                requestId,
            }));
        }
        this.pendingRequests.clear();
        // Close pool or socket
        if (this.usePool && this.connectionPool) {
            await this.connectionPool.closeAll();
            this.connectionPool = null;
        }
        else if (this.socket) {
            await new Promise((resolve) => {
                this.socket.once("close", () => resolve());
                this.socket.end();
            });
            this.socket = null;
        }
        this.connected = false;
        this.registered = false;
        this.emit("disconnected");
        this.log("Disconnected");
    }
    /**
     * Check if connected to Gateway
     */
    isConnected() {
        return this.connected && this.registered;
    }
    // ============================================================================
    // PUBLIC METHODS - METHOD REGISTRATION
    // ============================================================================
    /**
     * Register a method that can be called by other services
     *
     * Example:
     * client.registerMethod('getUserById', async (params, context) => {
     *   return { id: params.userId, name: 'John' };
     * });
     *
     * @param methodName - Name of method
     * @param handler - Function that handles the method call
     */
    registerMethod(methodName, handler) {
        this.log("Registering method", { methodName });
        this.availableMethods.set(methodName, handler);
        // If already connected, we should re-register with Gateway
        // (in practice, methods are registered before connect)
        if (this.connected && this.registered) {
            this.log("Already registered, method will be available on reconnect", {
                methodName,
            });
        }
    }
    /**
     * Unregister a method
     *
     * @param methodName - Name of method to remove
     */
    unregisterMethod(methodName) {
        this.log("Unregistering method", { methodName });
        this.availableMethods.delete(methodName);
    }
    /**
     * Get list of registered methods
     */
    getRegisteredMethods() {
        return Array.from(this.availableMethods.keys());
    }
    // ============================================================================
    // PUBLIC METHODS - CALLING OTHER SERVICES
    // ============================================================================
    /**
     * Call a method on another service
     *
     * This is the MAIN method services use to communicate!
     *
     * Example:
     * const userData = await client.call('user-service', 'getUserById', {
     *   userId: '123'
     * });
     *
     * Steps:
     * 1. Check if connected
     * 2. Get or create context (auto-detect nested calls)
     * 3. Create CALL message
     * 4. Store pending promise
     * 5. Send message to Gateway
     * 6. Wait for RESPONSE (promise resolves when response arrives)
     * 7. Return result
     *
     * @param targetService - Name of service to call
     * @param method - Method name to execute
     * @param params - Parameters to pass
     * @param contextOverride - Optional context override (rarely used)
     * @returns Promise that resolves with result
     */
    async call(targetService, method, params = {}, contextOverride) {
        // Check connection
        if (!this.isConnected()) {
            throw new types_1.IPCError("Not connected to Gateway", types_1.IPCErrorCode.NOT_CONNECTED);
        }
        // Get or create context
        // If we're in a method execution, use that context (nested call)
        // Otherwise, create new context (top-level call)
        const context = contextOverride ||
            this.executionContext ||
            utils_1.IPCUtils.createContext(this.serviceName, this.config.timeout);
        // Extend context for this call
        const extendedContext = utils_1.IPCUtils.extendContext(context, this.serviceName);
        // Check deadline
        if (utils_1.IPCUtils.isDeadlineExceeded(extendedContext)) {
            throw new types_1.IPCError("Request deadline already exceeded", types_1.IPCErrorCode.DEADLINE_EXCEEDED, { context: extendedContext });
        }
        // Check max depth
        if (utils_1.IPCUtils.isMaxDepthExceeded(extendedContext)) {
            throw new types_1.IPCError("Maximum call depth exceeded", types_1.IPCErrorCode.MAX_DEPTH_EXCEEDED, { context: extendedContext });
        }
        // Create CALL message
        const callMessage = utils_1.IPCUtils.createCallMessage(this.serviceName, targetService, method, params, extendedContext);
        this.log("Calling service", {
            target: targetService,
            method,
            requestId: callMessage.id,
            depth: extendedContext.depth,
        });
        // Create promise and store in pending requests
        const promise = new Promise((resolve, reject) => {
            // Calculate timeout (use remaining time from context)
            const remainingTime = utils_1.IPCUtils.getRemainingTime(extendedContext);
            const timeoutMs = Math.min(remainingTime, this.config.timeout);
            // Setup timeout
            const timeoutId = setTimeout(() => {
                // Remove from pending
                this.pendingRequests.delete(callMessage.id);
                // Reject promise
                reject(new types_1.IPCError(`Request timeout after ${timeoutMs}ms`, types_1.IPCErrorCode.TIMEOUT, {
                    target: targetService,
                    method,
                    requestId: callMessage.id,
                }));
            }, timeoutMs);
            // Store pending request
            const pendingRequest = {
                resolve,
                reject,
                createdAt: Date.now(),
                timeoutId,
                originalMessage: callMessage,
            };
            this.pendingRequests.set(callMessage.id, pendingRequest);
        });
        // Send message to Gateway
        this.sendMessage(callMessage);
        // Wait for response
        return promise;
    }
    // ============================================================================
    // SOCKET EVENT HANDLERS
    // ============================================================================
    /**
     * Setup socket event listeners
     */
    setupSocketListeners() {
        if (!this.socket) {
            return;
        }
        // Data received
        this.socket.on("data", (data) => {
            this.handleSocketData(data);
        });
        // Socket error
        this.socket.on("error", (error) => {
            this.handleSocketError(error);
        });
        // Socket closed
        this.socket.on("close", () => {
            this.handleSocketClose();
        });
    }
    /**
     * Handle incoming data from socket
     *
     * @param data - Raw buffer from socket
     */
    handleSocketData(data) {
        try {
            // Append to receive buffer
            this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);
            // Process all complete messages
            const { messages, remaining } = utils_1.IPCUtils.splitMessages(this.receiveBuffer);
            this.receiveBuffer = remaining;
            // Handle each message
            for (const message of messages) {
                this.handleMessage(message);
            }
        }
        catch (error) {
            this.log("Error handling socket data", { error });
            this.emit("error", error);
        }
    }
    /**
     * Handle socket error
     */
    handleSocketError(error) {
        this.log("Socket error", { error: error.message });
        this.emit("error", error);
        // Connection errors trigger reconnection
        if (!this.connected && this.config.autoReconnect) {
            this.scheduleReconnect();
        }
    }
    /**
     * Handle socket close
     */
    handleSocketClose() {
        this.log("Socket closed");
        const wasConnected = this.connected;
        // Update state
        this.connected = false;
        this.registered = false;
        this.stopHeartbeat();
        // Reject pending requests
        this.rejectAllPendingRequests(new types_1.IPCError("Connection closed", types_1.IPCErrorCode.CONNECTION_LOST));
        // Emit event
        if (wasConnected) {
            this.emit("disconnected");
        }
        // Attempt reconnection
        if (this.config.autoReconnect && !this.reconnecting) {
            this.scheduleReconnect();
        }
    }
    // ============================================================================
    // MESSAGE HANDLING
    // ============================================================================
    /**
     * Handle incoming message from Gateway
     *
     * Routes to appropriate handler:
     * - CALL -> executeMethod()
     * - RESPONSE -> handleResponse()
     * - REGISTER_ACK -> registration confirmed
     * - ERROR -> log error
     *
     * @param message - Parsed message
     */
    handleMessage(message) {
        try {
            // Validate message
            utils_1.IPCUtils.validateMessage(message);
            this.log("Message received", {
                type: message.type,
                id: message.id,
            });
            // Route based on type
            switch (message.type) {
                case "CALL":
                    this.handleCall(message);
                    break;
                case "RESPONSE":
                    this.handleResponse(message);
                    break;
                case "REGISTER_ACK":
                    this.handleRegisterAck(message);
                    break;
                case "ERROR":
                    this.handleError(message);
                    break;
                default:
                    this.log("Unknown message type", { type: message.type });
            }
        }
        catch (error) {
            this.log("Error handling message", { error, message });
            this.emit("error", error);
        }
    }
    /**
     * Handle CALL message - execute local method
     *
     * Steps:
     * 1. Find method handler
     * 2. Set execution context (for nested calls)
     * 3. Execute method
     * 4. Create RESPONSE message
     * 5. Send response back to Gateway
     * 6. Clear execution context
     *
     * @param message - CALL message
     */
    async handleCall(message) {
        const { id, from, method, params, context } = message;
        this.log("Executing method", {
            method,
            from,
            requestId: id,
            depth: context.depth,
        });
        try {
            // Check deadline
            if (utils_1.IPCUtils.isDeadlineExceeded(context)) {
                throw new types_1.IPCError("Request deadline exceeded", types_1.IPCErrorCode.DEADLINE_EXCEEDED);
            }
            // Find method handler
            const handler = this.availableMethods.get(method);
            if (!handler) {
                throw new types_1.IPCError(`Method '${method}' not found`, types_1.IPCErrorCode.METHOD_NOT_FOUND, {
                    availableMethods: this.getRegisteredMethods(),
                });
            }
            // Set execution context (nested calls will use this)
            this.executionContext = context;
            try {
                // Execute method
                const result = await handler(params, context);
                // Create success response
                const response = utils_1.IPCUtils.createSuccessResponse(message, result);
                // Send response
                this.sendMessage(response);
                this.log("Method executed successfully", {
                    method,
                    requestId: id,
                });
                this.emit("method-executed", {
                    method,
                    requestId: id,
                    success: true,
                });
            }
            finally {
                // Always clear execution context
                this.executionContext = null;
            }
        }
        catch (error) {
            // Create error response
            const response = utils_1.IPCUtils.createErrorResponse(message, error);
            // Send error response
            this.sendMessage(response);
            this.log("Method execution failed", {
                method,
                requestId: id,
                error: error.message,
            });
            this.emit("method-executed", {
                method,
                requestId: id,
                success: false,
                error: error.message,
            });
        }
    }
    /**
     * Handle RESPONSE message - resolve pending promise
     *
     * Steps:
     * 1. Find pending request by ID
     * 2. Clear timeout
     * 3. Resolve or reject promise
     * 4. Remove from pending
     *
     * @param message - RESPONSE message
     */
    handleResponse(message) {
        const { id, status, data, error } = message;
        this.log("Response received", {
            requestId: id,
            status,
        });
        // Find pending request
        const pending = this.pendingRequests.get(id);
        if (!pending) {
            this.log("No pending request found for response", { requestId: id });
            return;
        }
        // Clear timeout
        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }
        // Remove from pending
        this.pendingRequests.delete(id);
        // Resolve or reject promise
        if (status === "success") {
            pending.resolve(data);
            this.emit("response-received", {
                requestId: id,
                success: true,
            });
        }
        else {
            const ipcError = new types_1.IPCError(error?.message || "Remote method execution failed", error?.code || types_1.IPCErrorCode.EXECUTION_FAILED, error);
            pending.reject(ipcError);
            this.emit("response-received", {
                requestId: id,
                success: false,
                error: error?.message,
            });
        }
    }
    /**
     * Handle REGISTER_ACK - registration confirmed
     */
    handleRegisterAck(message) {
        this.log("Registration acknowledged by Gateway");
        this.registered = true;
        this.emit("registered");
    }
    /**
     * Handle ERROR message from Gateway
     */
    handleError(message) {
        this.log("Error from Gateway", { error: message.error });
        this.emit("gateway-error", message.error);
    }
    // ============================================================================
    // REGISTRATION
    // ============================================================================
    /**
     * Send REGISTER message to Gateway
     *
     * Tells Gateway:
     * - Service name
     * - Available methods
     *
     * @returns Promise that resolves when registered
     */
    async register() {
        const registerMessage = {
            type: "REGISTER",
            serviceName: this.serviceName,
            methods: this.getRegisteredMethods(),
            version: "1.0.0", // Could be from package.json
            metadata: {},
        };
        this.log("Sending REGISTER message", {
            methods: registerMessage.methods.length,
        });
        this.sendMessage(registerMessage);
        // Wait for acknowledgment (with timeout)
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new types_1.IPCError("Registration timeout", types_1.IPCErrorCode.CONNECTION_FAILED));
            }, 5000);
            this.once("registered", () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
    // ============================================================================
    // HEARTBEAT
    // ============================================================================
    /**
     * Start sending heartbeats to Gateway
     */
    startHeartbeat() {
        if (this.heartbeatTimer) {
            return;
        }
        this.heartbeatTimer = setInterval(() => {
            if (this.connected) {
                this.sendHeartbeat();
            }
        }, this.config.heartbeatInterval);
        this.log("Heartbeat started", {
            interval: this.config.heartbeatInterval,
        });
    }
    /**
     * Stop heartbeat timer
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
            this.log("Heartbeat stopped");
        }
    }
    /**
     * Send heartbeat message
     */
    sendHeartbeat() {
        const heartbeat = {
            type: "HEARTBEAT",
            from: this.serviceName,
            timestamp: Date.now(),
        };
        this.sendMessage(heartbeat);
    }
    // ============================================================================
    // RECONNECTION
    // ============================================================================
    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnecting) {
            return;
        }
        this.reconnecting = true;
        this.reconnectAttempts++;
        // Calculate backoff delay
        const delay = utils_1.IPCUtils.calculateBackoff(this.reconnectAttempts - 1, this.config.reconnectDelay);
        this.log("Scheduling reconnection", {
            attempt: this.reconnectAttempts,
            delay,
        });
        this.reconnectTimer = setTimeout(async () => {
            this.reconnecting = false;
            try {
                await this.connect();
                this.log("Reconnection successful");
            }
            catch (error) {
                this.log("Reconnection failed", { error: error.message });
                // Will schedule another attempt via handleSocketError
            }
        }, delay);
    }
    // ============================================================================
    // UTILITIES
    // ============================================================================
    /**
     * Send message to Gateway
     */
    // private sendMessage(message: any): void {
    //   if (!this.socket || !this.connected) {
    //     throw new IPCError(
    //       'Cannot send message: not connected',
    //       IPCErrorCode.NOT_CONNECTED,
    //     );
    //   }
    //   try {
    //     const buffer = IPCUtils.serialize(message);
    //     this.socket.write(buffer);
    //   } catch (error) {
    //     this.log('Error sending message', { error, message });
    //     throw error;
    //   }
    // }
    sendMessage(message) {
        if (this.usePool && this.connectionPool) {
            //   Use connection from pool
            const socket = this.connectionPool.getConnection();
            const buffer = utils_1.IPCUtils.serialize(message);
            socket.write(buffer);
        }
        else {
            // Original single socket
            if (!this.socket || !this.connected) {
                throw new types_1.IPCError("Cannot send message: not connected", types_1.IPCErrorCode.NOT_CONNECTED);
            }
            const buffer = utils_1.IPCUtils.serialize(message);
            this.socket.write(buffer);
        }
    }
    /**
     * Reject all pending requests with error
     */
    rejectAllPendingRequests(error) {
        this.log("Rejecting all pending requests", {
            count: this.pendingRequests.size,
        });
        for (const [id, pending] of this.pendingRequests.entries()) {
            if (pending.timeoutId) {
                clearTimeout(pending.timeoutId);
            }
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }
    /**
     * Get client status
     */
    getStatus() {
        return {
            connected: this.connected,
            registered: this.registered,
            serviceName: this.serviceName,
            pendingRequests: this.pendingRequests.size,
            registeredMethods: this.availableMethods.size,
        };
    }
    /**
     * Log helper
     */
    log(message, data) {
        if (this.config.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[IPCClient:${this.serviceName}] ${timestamp} - ${message}`, data || "");
        }
        this.emit("log", {
            serviceName: this.serviceName,
            message,
            data,
            timestamp: Date.now(),
        });
    }
}
exports.IPCClient = IPCClient;
exports.default = IPCClient;
