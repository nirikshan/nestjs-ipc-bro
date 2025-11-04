"use strict";
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
exports.IPCServer = void 0;
const net = __importStar(require("net"));
const fs = __importStar(require("fs"));
const events_1 = require("events");
const types_1 = require("./types");
const utils_1 = require("./utils");
class IPCServer extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.server = null;
        this.isRunning = false;
        this.config = {
            socketPath: config.socketPath || "/tmp/brodox-gateway.sock",
            heartbeatInterval: config.heartbeatInterval || 30000,
            timeout: config.timeout || 30000,
            debug: config.debug || false,
            serializer: config.serializer || "msgpack",
        };
        utils_1.IPCUtils.setSerializer(this.config.serializer);
        this.socketPath = this.config.socketPath;
        this.connectedServices = new Map();
        this.socketToService = new Map();
        this.socketBuffers = new Map();
        this.log("IPCServer initialized", { config: this.config });
    }
    async start() {
        if (this.isRunning) {
            throw new types_1.IPCError("Server is already running", types_1.IPCErrorCode.CONNECTION_FAILED);
        }
        try {
            await this.removeSocketFile();
            this.server = net.createServer((socket) => {
                this.handleConnection(socket);
            });
            this.server.on("error", (error) => {
                this.log("Server error", { error });
                this.emit("error", error);
            });
            await new Promise((resolve, reject) => {
                this.server.listen(this.socketPath, () => {
                    this.isRunning = true;
                    this.log("Server started", { socketPath: this.socketPath });
                    this.emit("started", { socketPath: this.socketPath });
                    resolve();
                });
                this.server.once("error", reject);
            });
        }
        catch (error) {
            throw new types_1.IPCError(`Failed to start server: ${error.message}`, types_1.IPCErrorCode.CONNECTION_FAILED, { error });
        }
    }
    async stop() {
        if (!this.isRunning) {
            return;
        }
        try {
            /* Step 1: Close all service connections */
            for (const [serviceName, entry] of this.connectedServices.entries()) {
                entry.socket.destroy();
                this.log("Closed connection", { serviceName });
            }
            /*  Step 2: Close server */
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(() => {
                        this.log("Server closed");
                        resolve();
                    });
                });
            }
            /* Step 3: Clean up */
            this.connectedServices.clear();
            this.socketToService.clear();
            this.socketBuffers.clear();
            await this.removeSocketFile();
            this.isRunning = false;
            this.emit("stopped");
        }
        catch (error) {
            this.log("Error stopping server", { error });
            throw error;
        }
    }
    getConnectedServices() {
        return Array.from(this.connectedServices.keys());
    }
    getService(serviceName) {
        return this.connectedServices.get(serviceName);
    }
    isServiceConnected(serviceName) {
        return this.connectedServices.has(serviceName);
    }
    getStatus() {
        return {
            running: this.isRunning,
            socketPath: this.socketPath,
            connectedServices: this.connectedServices.size,
            services: this.getConnectedServices(),
        };
    }
    // ============================================================================
    // CONNECTION HANDLING
    // ============================================================================
    /**
     * Handle new service connection
     *
     * Called when a service connects to the Gateway socket
     *
     * Steps:
     * 1. Initialize buffer for this socket
     * 2. Setup event listeners (data, error, close)
     * 3. Wait for REGISTER message to identify service
     *
     * @param socket - Connected socket
     */
    handleConnection(socket) {
        this.log("New connection received");
        // Initialize buffer for this socket
        this.socketBuffers.set(socket, Buffer.alloc(0));
        // Setup socket event listeners
        socket.on("data", (data) => {
            this.handleSocketData(socket, data);
        });
        socket.on("error", (error) => {
            this.log("Socket error", { error });
            this.handleSocketError(socket, error);
        });
        socket.on("close", () => {
            this.handleSocketClose(socket);
        });
        this.emit("connection", { socket });
    }
    /**
     * Handle incoming data from socket
     *
     * Handles:
     * - Partial messages (accumulate in buffer)
     * - Multiple messages in one chunk (split them)
     * - Complete messages (process them)
     *
     * @param socket - Socket that sent data
     * @param data - Raw data buffer
     */
    handleSocketData(socket, data) {
        try {
            // Get existing buffer for this socket
            let buffer = this.socketBuffers.get(socket) || Buffer.alloc(0);
            // Append new data
            buffer = Buffer.concat([buffer, data]);
            // Process all complete messages in buffer
            const { messages, remaining } = utils_1.IPCUtils.splitMessages(buffer);
            // Store remaining buffer
            this.socketBuffers.set(socket, remaining);
            // Process each complete message
            for (const message of messages) {
                this.handleMessage(socket, message);
            }
        }
        catch (error) {
            this.log("Error handling socket data", { error });
            this.sendError(socket, null, error);
        }
    }
    /**
     * Handle socket error
     *
     * @param socket - Socket with error
     * @param error - Error object
     */
    handleSocketError(socket, error) {
        const serviceName = this.socketToService.get(socket);
        this.log("Socket error", { serviceName, error: error.message });
        this.emit("socket-error", {
            serviceName,
            error,
        });
        // Close socket
        socket.destroy();
    }
    /**
     * Handle socket close (service disconnected)
     *
     * Steps:
     * 1. Find service name from socket
     * 2. Remove from registry
     * 3. Clean up buffers
     * 4. Emit event
     *
     * @param socket - Closed socket
     */
    handleSocketClose(socket) {
        const serviceName = this.socketToService.get(socket);
        if (serviceName) {
            this.log("Service disconnected", { serviceName });
            // Remove from registries
            this.connectedServices.delete(serviceName);
            this.socketToService.delete(socket);
            this.socketBuffers.delete(socket);
            this.emit("service-disconnected", { serviceName });
        }
        else {
            // Connection closed before registration
            this.socketBuffers.delete(socket);
        }
    }
    // ============================================================================
    // MESSAGE HANDLING
    // ============================================================================
    /**
     * Handle incoming message from a service
     *
     * Routes to appropriate handler based on message type:
     * - REGISTER -> registerService()
     * - CALL -> routeCall()
     * - RESPONSE -> routeResponse()
     * - HEARTBEAT -> handleHeartbeat()
     *
     * @param socket - Socket that sent message
     * @param message - Parsed message object
     */
    handleMessage(socket, message) {
        try {
            // Validate message structure
            utils_1.IPCUtils.validateMessage(message);
            this.log("Message received", {
                type: message.type,
                from: message.from,
                to: message.to,
            });
            // Route based on message type
            switch (message.type) {
                case "REGISTER":
                    this.handleRegister(socket, message);
                    break;
                case "CALL":
                    this.handleCall(socket, message);
                    break;
                case "RESPONSE":
                    this.handleResponse(socket, message);
                    break;
                case "HEARTBEAT":
                    this.handleHeartbeat(socket, message);
                    break;
                default:
                    throw new types_1.IPCError(`Unknown message type: ${message.type}`, types_1.IPCErrorCode.INVALID_MESSAGE);
            }
        }
        catch (error) {
            this.log("Error handling message", { error, message });
            this.sendError(socket, message, error);
        }
    }
    /**
     * Handle REGISTER message
     *
     * Service announces itself to Gateway
     *
     * Steps:
     * 1. Validate registration data
     * 2. Check for duplicate service name
     * 3. Store in registry
     * 4. Send acknowledgment
     * 5. Emit event
     *
     * @param socket - Service socket
     * @param message - REGISTER message
     */
    /**
     * Handle REGISTER message
     */
    // Correct signature
    /**
     * Handle REGISTER message
     */
    handleRegister(socket, message) {
        const { serviceName, methods, version, metadata } = message;
        this.log("Message received", {
            type: "REGISTER",
            from: serviceName,
            to: undefined,
        });
        //   Check if this is a pooled connection
        const isPoolConnection = metadata && typeof metadata.poolIndex === "number";
        //   Get existing service
        const existingService = this.connectedServices.get(serviceName);
        //   Allow multiple connections for pooled services
        if (existingService && !isPoolConnection) {
            // Single connection service already registered
            const errorMsg = {
                type: "ERROR",
                error: {
                    message: `Service '${serviceName}' is already registered`,
                    code: "CONNECTION_FAILED",
                },
            };
            const buffer = utils_1.IPCUtils.serialize(errorMsg);
            socket.write(buffer);
            socket.end();
            return;
        }
        //   For pooled connections, add to existing service
        if (isPoolConnection && existingService) {
            this.log("Adding pooled connection", {
                serviceName,
                poolIndex: metadata.poolIndex,
            });
            // Store multiple sockets
            if (!existingService.sockets) {
                existingService.sockets = [existingService.socket];
            }
            existingService.sockets.push(socket);
            // Update last heartbeat
            existingService.lastHeartbeat = Date.now();
            // Send ACK
            const ackMessage = { type: "REGISTER_ACK" };
            const buffer = utils_1.IPCUtils.serialize(ackMessage);
            socket.write(buffer);
            return;
        }
        // Create new service entry
        const service = {
            name: serviceName,
            socket,
            methods: methods || [],
            connectedAt: Date.now(),
            lastHeartbeat: Date.now(),
            version,
            metadata,
        };
        // Store service
        this.connectedServices.set(serviceName, service);
        this.socketToService.set(socket, serviceName);
        this.log("Service registered", {
            serviceName,
            methods: methods?.length || 0,
            isPooled: isPoolConnection,
        });
        // Send ACK
        const ackMessage = { type: "REGISTER_ACK" };
        const buffer = utils_1.IPCUtils.serialize(ackMessage);
        socket.write(buffer);
        // Emit event
        this.emit("service-registered", {
            serviceName,
            methods: methods || [],
        });
    }
    /**
     * Handle CALL message
     *
     * Route CALL from one service to another
     *
     * Steps:
     * 1. Validate context (check deadline)
     * 2. Find target service
     * 3. Forward message to target
     * 4. Emit event
     *
     * @param socket - Caller's socket
     * @param message - CALL message
     */
    /**
     * Handle CALL message
     */
    handleCall(socket, message) {
        const { from, to, method, context } = message;
        // Check deadline
        if (utils_1.IPCUtils.isDeadlineExceeded(context)) {
            throw new types_1.IPCError("Request deadline exceeded", types_1.IPCErrorCode.DEADLINE_EXCEEDED, { context });
        }
        // Check max depth
        if (utils_1.IPCUtils.isMaxDepthExceeded(context)) {
            throw new types_1.IPCError("Maximum call depth exceeded", types_1.IPCErrorCode.MAX_DEPTH_EXCEEDED, { context });
        }
        // Find target service
        const targetEntry = this.connectedServices.get(to);
        if (!targetEntry) {
            throw new types_1.IPCError(`Target service '${to}' not found`, types_1.IPCErrorCode.SERVICE_NOT_FOUND, { availableServices: this.getConnectedServices() });
        }
        //   NEW: Use round-robin for pooled connections
        let targetSocket = targetEntry.socket;
        if (targetEntry.sockets) {
            // Service has multiple sockets (connection pool)
            const sockets = targetEntry.sockets;
            const currentIndex = targetEntry.currentSocketIndex || 0;
            targetSocket = sockets[currentIndex];
            // Update index for next call (round-robin)
            targetEntry.currentSocketIndex =
                (currentIndex + 1) % sockets.length;
            this.log("Using pooled socket", {
                service: to,
                socketIndex: currentIndex,
                totalSockets: sockets.length,
            });
        }
        this.log("Routing CALL", {
            from,
            to,
            method,
            requestId: message.id,
        });
        // Forward message to target (using pooled socket if available)
        this.sendToSocket(targetSocket, message);
        // Emit event
        this.emit("call-routed", {
            from,
            to,
            method,
            requestId: message.id,
            context,
        });
    }
    /**
     * Handle RESPONSE message
     *
     * Route RESPONSE back to original caller
     *
     * Steps:
     * 1. Find caller service
     * 2. Forward message to caller
     * 3. Emit event
     *
     * @param socket - Responder's socket
     * @param message - RESPONSE message
     */
    handleResponse(socket, message) {
        const { from, to, status } = message;
        // Find caller service
        const targetEntry = this.connectedServices.get(to);
        if (!targetEntry) {
            // Caller disconnected, log and drop response
            this.log("Response target not found (caller disconnected)", {
                from,
                to,
                requestId: message.id,
            });
            return;
        }
        this.log("Routing RESPONSE", {
            from,
            to,
            status,
            requestId: message.id,
        });
        // Forward message to caller
        this.sendToSocket(targetEntry.socket, message);
        // Emit event
        this.emit("response-routed", {
            from,
            to,
            status,
            requestId: message.id,
        });
    }
    /**
     * Handle HEARTBEAT message
     *
     * Update last heartbeat timestamp for service
     *
     * @param socket - Service socket
     * @param message - HEARTBEAT message
     */
    handleHeartbeat(socket, message) {
        const serviceName = this.socketToService.get(socket);
        if (!serviceName) {
            return;
        }
        const entry = this.connectedServices.get(serviceName);
        if (entry) {
            entry.lastHeartbeat = Date.now();
            this.log("Heartbeat received", { serviceName });
        }
    }
    // ============================================================================
    // SENDING MESSAGES
    // ============================================================================
    /**
     * Send message to a specific socket
     *
     * @param socket - Target socket
     * @param message - Message to send
     */
    sendToSocket(socket, message) {
        try {
            const buffer = utils_1.IPCUtils.serialize(message);
            socket.write(buffer);
        }
        catch (error) {
            this.log("Error sending message", { error, message });
            throw error;
        }
    }
    /**
     * Send error response back to caller
     *
     * @param socket - Caller socket
     * @param originalMessage - Original message that caused error
     * @param error - Error object
     */
    sendError(socket, originalMessage, error) {
        try {
            const errorMessage = {
                type: "ERROR",
                id: originalMessage?.id,
                error: {
                    message: error.message || "Unknown error",
                    code: error.code || types_1.IPCErrorCode.EXECUTION_FAILED,
                    stack: error.stack,
                },
                timestamp: Date.now(),
            };
            this.sendToSocket(socket, errorMessage);
        }
        catch (err) {
            this.log("Error sending error message", { err });
        }
    }
    // ============================================================================
    // UTILITY METHODS
    // ============================================================================
    /**
     * Remove Unix socket file if exists
     */
    async removeSocketFile() {
        try {
            if (fs.existsSync(this.socketPath)) {
                fs.unlinkSync(this.socketPath);
                this.log("Removed existing socket file", {
                    socketPath: this.socketPath,
                });
            }
        }
        catch (error) {
            this.log("Error removing socket file", { error });
        }
    }
    /**
     * Log helper (respects debug flag)
     *
     * @param message - Log message
     * @param data - Additional data
     */
    log(message, data) {
        if (this.config.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[IPCServer] ${timestamp} - ${message}`, data || "");
        }
        // Always emit log event for external logging
        this.emit("log", { message, data, timestamp: Date.now() });
    }
}
exports.IPCServer = IPCServer;
// ============================================================================
// EXPORTS
// ============================================================================
exports.default = IPCServer;
