"use strict";
/**
 * Connection Pool with Failure Handling & Auto-Recovery
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
exports.ConnectionPool = void 0;
const net = __importStar(require("net"));
const events_1 = require("events");
const utils_1 = require("./utils");
class ConnectionPool extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.sockets = [];
        this.currentIndex = 0;
        this.isShuttingDown = false;
        this.healthCheckTimer = null;
        this.reconnectTimers = new Map();
        this.config = {
            ...config,
            autoReconnect: config.autoReconnect !== false,
            reconnectDelay: config.reconnectDelay || 5000,
            maxReconnectAttempts: config.maxReconnectAttempts || 10,
            healthCheckInterval: config.healthCheckInterval || 30000,
        };
    }
    /**
     * Create connection pool
     */
    async createPool() {
        const promises = [];
        for (let i = 0; i < this.config.poolSize; i++) {
            promises.push(this.createConnection(i));
        }
        await Promise.all(promises);
        this.startHealthCheck();
        console.log(`  Connection pool created: ${this.config.poolSize} connections`);
    }
    /**
     * Create single connection
     */
    async createConnection(index) {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            //   Get existing socket safely with proper type
            const existingSocket = this.sockets[index];
            const pooledSocket = {
                socket,
                index,
                connected: false,
                healthy: false,
                errorCount: existingSocket ? existingSocket.errorCount : 0,
                lastUsed: Date.now(),
                buffer: Buffer.alloc(0),
            };
            // Setup socket handlers
            socket.on("connect", () => {
                pooledSocket.connected = true;
                pooledSocket.healthy = true;
                console.log(`[Pool-${index}] Connected to Gateway`);
                // Send REGISTER message
                this.sendRegister(pooledSocket);
                resolve();
            });
            socket.on("data", (data) => {
                this.handleSocketData(pooledSocket, data);
            });
            socket.on("error", (error) => {
                this.handleSocketError(pooledSocket, error);
            });
            socket.on("close", () => {
                this.handleSocketClose(pooledSocket);
            });
            // Setup timeout
            const timeout = setTimeout(() => {
                socket.destroy();
                reject(new Error(`Connection timeout for pool socket ${index}`));
            }, 10000);
            socket.once("connect", () => clearTimeout(timeout));
            socket.once("error", (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            // Connect with error handling
            try {
                socket.connect(this.config.gatewayPath);
            }
            catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
            // Store socket
            this.sockets[index] = pooledSocket;
        });
    }
    /**
     * Get next available connection (round-robin with health check)
     */
    getConnection() {
        const startIndex = this.currentIndex;
        let attempts = 0;
        // Try to find a healthy socket
        while (attempts < this.config.poolSize) {
            const pooledSocket = this.sockets[this.currentIndex];
            this.currentIndex = (this.currentIndex + 1) % this.config.poolSize;
            if (pooledSocket && pooledSocket.connected && pooledSocket.healthy) {
                pooledSocket.lastUsed = Date.now();
                return pooledSocket.socket;
            }
            attempts++;
        }
        // No healthy socket found - try to use any connected socket
        for (const pooledSocket of this.sockets) {
            if (pooledSocket && pooledSocket.connected) {
                console.warn(`[Pool] No healthy socket, using socket ${pooledSocket.index}`);
                pooledSocket.lastUsed = Date.now();
                return pooledSocket.socket;
            }
        }
        // All sockets down!
        throw new Error("All pool connections are down!");
    }
    /**
     * Get pool statistics
     */
    getStats() {
        const total = this.sockets.length;
        const connected = this.sockets.filter((s) => s && s.connected).length;
        const healthy = this.sockets.filter((s) => s && s.healthy).length;
        const errors = this.sockets.reduce((sum, s) => sum + (s ? s.errorCount : 0), 0);
        return {
            total,
            connected,
            healthy,
            unhealthy: connected - healthy,
            disconnected: total - connected,
            totalErrors: errors,
        };
    }
    /**
     * Handle socket data
     */
    handleSocketData(pooledSocket, data) {
        try {
            // Append to buffer
            pooledSocket.buffer = Buffer.concat([pooledSocket.buffer, data]);
            // Process messages
            const { messages, remaining } = utils_1.IPCUtils.splitMessages(pooledSocket.buffer);
            pooledSocket.buffer = remaining;
            // Emit each message
            for (const message of messages) {
                this.emit("message", message);
            }
        }
        catch (error) {
            console.error(`[Pool-${pooledSocket.index}] Error handling data:`, error);
            this.handleSocketError(pooledSocket, error);
        }
    }
    /**
     * Handle socket error
     */
    handleSocketError(pooledSocket, error) {
        console.error(`[Pool-${pooledSocket.index}] Socket error:`, error.message);
        pooledSocket.healthy = false;
        pooledSocket.errorCount++;
        this.emit("socket-error", {
            index: pooledSocket.index,
            error,
            errorCount: pooledSocket.errorCount,
        });
        // Mark as unhealthy after 3 errors
        if (pooledSocket.errorCount >= 3) {
            console.warn(`[Pool-${pooledSocket.index}] Too many errors, marking unhealthy`);
            pooledSocket.healthy = false;
        }
    }
    /**
     * Handle socket close
     */
    handleSocketClose(pooledSocket) {
        console.log(`[Pool-${pooledSocket.index}] Connection closed`);
        pooledSocket.connected = false;
        pooledSocket.healthy = false;
        this.emit("socket-closed", { index: pooledSocket.index });
        // Auto-reconnect if enabled and not shutting down
        if (this.config.autoReconnect && !this.isShuttingDown) {
            this.scheduleReconnect(pooledSocket);
        }
    }
    /**
     * Schedule reconnection for a socket
     */
    scheduleReconnect(pooledSocket) {
        const index = pooledSocket.index;
        // Clear any existing timer
        const existingTimer = this.reconnectTimers.get(index);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // Use exponential backoff
        const attemptNumber = pooledSocket.errorCount;
        const delay = Math.min(this.config.reconnectDelay * Math.pow(1.5, attemptNumber), 30000 // Max 30 seconds
        );
        console.log(`[Pool-${index}] Scheduling reconnect attempt ${attemptNumber + 1} in ${delay}ms`);
        const timer = setTimeout(async () => {
            this.reconnectTimers.delete(index);
            try {
                console.log(`[Pool-${index}] Attempting reconnect (attempt ${attemptNumber + 1})...`);
                // Close old socket properly
                if (pooledSocket.socket && !pooledSocket.socket.destroyed) {
                    pooledSocket.socket.destroy();
                }
                // Create new connection with error handling
                await this.createConnection(index);
                console.log(`[Pool-${index}]   Reconnected successfully`);
                // Reset error count on success
                this.sockets[index].errorCount = 0;
            }
            catch (error) {
                console.error(`[Pool-${index}] ❌ Reconnect failed:`, error.message);
                pooledSocket.errorCount++;
                // Retry if under max attempts
                if (pooledSocket.errorCount < this.config.maxReconnectAttempts) {
                    this.scheduleReconnect(pooledSocket);
                }
                else {
                    console.error(`[Pool-${index}] 🚫 Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`);
                    this.emit("socket-dead", { index });
                }
            }
        }, delay);
        this.reconnectTimers.set(index, timer);
    }
    /**
     * Send REGISTER message
     */
    sendRegister(pooledSocket) {
        const registerMessage = {
            type: "REGISTER",
            serviceName: this.config.serviceName,
            methods: this.config.methods,
            version: "1.0.0",
            metadata: {
                poolIndex: pooledSocket.index,
                poolSize: this.config.poolSize,
            },
        };
        const buffer = utils_1.IPCUtils.serialize(registerMessage);
        pooledSocket.socket.write(buffer);
    }
    /**
     * Health check - periodically verify socket health
     */
    startHealthCheck() {
        if (this.healthCheckTimer) {
            return;
        }
        this.healthCheckTimer = setInterval(() => {
            for (const pooledSocket of this.sockets) {
                if (!pooledSocket)
                    continue;
                // Check if socket is stale (not used in 60s)
                const timeSinceLastUse = Date.now() - pooledSocket.lastUsed;
                if (timeSinceLastUse > 60000 && pooledSocket.connected) {
                    // Send heartbeat
                    try {
                        const heartbeat = {
                            type: "HEARTBEAT",
                            from: this.config.serviceName,
                            timestamp: Date.now(),
                        };
                        const buffer = utils_1.IPCUtils.serialize(heartbeat);
                        pooledSocket.socket.write(buffer);
                    }
                    catch (error) {
                        console.error(`[Pool-${pooledSocket.index}] Health check failed:`, error);
                        pooledSocket.healthy = false;
                    }
                }
            }
            // Log stats
            const stats = this.getStats();
            if (stats.unhealthy > 0 || stats.disconnected > 0) {
                console.log("[Pool] Health check:", stats);
            }
        }, this.config.healthCheckInterval);
    }
    /**
     * Stop health check
     */
    stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
    /**
     * Close all connections
     */
    async closeAll() {
        this.isShuttingDown = true;
        this.stopHealthCheck();
        // Clear all reconnect timers
        for (const timer of this.reconnectTimers.values()) {
            clearTimeout(timer);
        }
        this.reconnectTimers.clear();
        // Close all sockets
        const promises = this.sockets.map((pooledSocket, index) => {
            return new Promise((resolve) => {
                if (!pooledSocket || !pooledSocket.socket) {
                    resolve();
                    return;
                }
                console.log(`[Pool-${index}] Closing...`);
                pooledSocket.socket.once("close", () => {
                    console.log(`[Pool-${index}] Closed`);
                    resolve();
                });
                pooledSocket.socket.end();
                // Force close after timeout
                setTimeout(() => {
                    pooledSocket.socket.destroy();
                    resolve();
                }, 1000);
            });
        });
        await Promise.all(promises);
        this.sockets = [];
        console.log("  All pool connections closed");
    }
}
exports.ConnectionPool = ConnectionPool;
