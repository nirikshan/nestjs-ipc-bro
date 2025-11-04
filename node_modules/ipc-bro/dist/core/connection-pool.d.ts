/**
 * Connection Pool with Failure Handling & Auto-Recovery
 */
import * as net from "net";
import { EventEmitter } from "events";
interface PoolConfig {
    gatewayPath: string;
    poolSize: number;
    serviceName: string;
    methods: string[];
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    healthCheckInterval?: number;
}
export declare class ConnectionPool extends EventEmitter {
    private config;
    private sockets;
    private currentIndex;
    private isShuttingDown;
    private healthCheckTimer;
    private reconnectTimers;
    constructor(config: PoolConfig);
    /**
     * Create connection pool
     */
    createPool(): Promise<void>;
    /**
     * Create single connection
     */
    private createConnection;
    /**
     * Get next available connection (round-robin with health check)
     */
    getConnection(): net.Socket;
    /**
     * Get pool statistics
     */
    getStats(): {
        total: number;
        connected: number;
        healthy: number;
        unhealthy: number;
        disconnected: number;
        totalErrors: number;
    };
    /**
     * Handle socket data
     */
    private handleSocketData;
    /**
     * Handle socket error
     */
    private handleSocketError;
    /**
     * Handle socket close
     */
    private handleSocketClose;
    /**
     * Schedule reconnection for a socket
     */
    private scheduleReconnect;
    /**
     * Send REGISTER message
     */
    private sendRegister;
    /**
     * Health check - periodically verify socket health
     */
    private startHealthCheck;
    /**
     * Stop health check
     */
    private stopHealthCheck;
    /**
     * Close all connections
     */
    closeAll(): Promise<void>;
}
export {};
