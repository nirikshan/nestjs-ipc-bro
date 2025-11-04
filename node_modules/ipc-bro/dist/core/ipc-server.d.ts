import { EventEmitter } from "events";
import { IPCServerConfig, ServiceEntry } from "./types";
export declare class IPCServer extends EventEmitter {
    private server;
    private socketPath;
    private connectedServices;
    private socketToService;
    private config;
    private isRunning;
    private socketBuffers;
    constructor(config?: Partial<IPCServerConfig>);
    start(): Promise<void>;
    stop(): Promise<void>;
    getConnectedServices(): string[];
    getService(serviceName: string): ServiceEntry | undefined;
    isServiceConnected(serviceName: string): boolean;
    getStatus(): {
        running: boolean;
        socketPath: string;
        connectedServices: number;
        services: string[];
    };
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
    private handleConnection;
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
    private handleSocketData;
    /**
     * Handle socket error
     *
     * @param socket - Socket with error
     * @param error - Error object
     */
    private handleSocketError;
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
    private handleSocketClose;
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
    private handleMessage;
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
    /**
     * Handle REGISTER message
     */
    private handleRegister;
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
    private handleCall;
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
    private handleResponse;
    /**
     * Handle HEARTBEAT message
     *
     * Update last heartbeat timestamp for service
     *
     * @param socket - Service socket
     * @param message - HEARTBEAT message
     */
    private handleHeartbeat;
    /**
     * Send message to a specific socket
     *
     * @param socket - Target socket
     * @param message - Message to send
     */
    private sendToSocket;
    /**
     * Send error response back to caller
     *
     * @param socket - Caller socket
     * @param originalMessage - Original message that caused error
     * @param error - Error object
     */
    private sendError;
    /**
     * Remove Unix socket file if exists
     */
    private removeSocketFile;
    /**
     * Log helper (respects debug flag)
     *
     * @param message - Log message
     * @param data - Additional data
     */
    private log;
}
export default IPCServer;
