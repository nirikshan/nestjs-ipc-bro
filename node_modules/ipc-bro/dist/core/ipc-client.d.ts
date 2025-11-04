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
import { EventEmitter } from "events";
import { IPCClientConfig, MethodHandler, IPCContext } from "./types";
export declare class IPCClient extends EventEmitter {
    private socket;
    private config;
    private serviceName;
    private gatewayPath;
    private connected;
    private registered;
    private reconnecting;
    private reconnectAttempts;
    private reconnectTimer;
    private connectionPool;
    private availableMethods;
    private pendingRequests;
    private receiveBuffer;
    private heartbeatTimer;
    private executionContext;
    private usePool;
    constructor(config: IPCClientConfig);
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
    connect(): Promise<void>;
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
    disconnect(): Promise<void>;
    /**
     * Check if connected to Gateway
     */
    isConnected(): boolean;
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
    registerMethod(methodName: string, handler: MethodHandler): void;
    /**
     * Unregister a method
     *
     * @param methodName - Name of method to remove
     */
    unregisterMethod(methodName: string): void;
    /**
     * Get list of registered methods
     */
    getRegisteredMethods(): string[];
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
    call<T = any>(targetService: string, method: string, params?: any, contextOverride?: IPCContext): Promise<T>;
    /**
     * Setup socket event listeners
     */
    private setupSocketListeners;
    /**
     * Handle incoming data from socket
     *
     * @param data - Raw buffer from socket
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
    private handleMessage;
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
    private handleCall;
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
    private handleResponse;
    /**
     * Handle REGISTER_ACK - registration confirmed
     */
    private handleRegisterAck;
    /**
     * Handle ERROR message from Gateway
     */
    private handleError;
    /**
     * Send REGISTER message to Gateway
     *
     * Tells Gateway:
     * - Service name
     * - Available methods
     *
     * @returns Promise that resolves when registered
     */
    private register;
    /**
     * Start sending heartbeats to Gateway
     */
    private startHeartbeat;
    /**
     * Stop heartbeat timer
     */
    private stopHeartbeat;
    /**
     * Send heartbeat message
     */
    private sendHeartbeat;
    /**
     * Schedule reconnection attempt
     */
    private scheduleReconnect;
    /**
     * Send message to Gateway
     */
    private sendMessage;
    /**
     * Reject all pending requests with error
     */
    private rejectAllPendingRequests;
    /**
     * Get client status
     */
    getStatus(): {
        connected: boolean;
        registered: boolean;
        serviceName: string;
        pendingRequests: number;
        registeredMethods: number;
    };
    /**
     * Log helper
     */
    private log;
}
export default IPCClient;
