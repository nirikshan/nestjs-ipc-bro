/**
 * NestJS Module for IPC Client (Services)
 */
import { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { IPCClient, IPCClientConfig } from "ipc-bro";
export declare const IPC_CLIENT_TOKEN = "IPC_CLIENT";
export declare const IPC_CLIENT_CONFIG = "IPC_CLIENT_CONFIG";
export declare class IPCClientService implements OnModuleInit, OnModuleDestroy {
    private readonly client;
    private readonly config;
    private readonly logger;
    constructor(client: IPCClient, config: IPCClientConfig);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    /**
     * Call remote service method
     */
    call<T = any>(targetService: string, method: string, params?: any): Promise<T>;
    /**
     * Register local method
     */
    registerMethod(methodName: string, handler: (params: any, context?: any) => Promise<any>): void;
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
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Get raw client instance
     */
    getClient(): IPCClient;
}
