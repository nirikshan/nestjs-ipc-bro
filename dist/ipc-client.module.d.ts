/**
 * NestJS Module for IPC Client (Services)
 */
import { DynamicModule } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { IPCClient, IPCClientConfig } from "ipc-bro";
import { IPCClientService } from "./ipc-client.service";
export declare const IPC_CLIENT_TOKEN = "IPC_CLIENT";
export declare const IPC_CLIENT_CONFIG = "IPC_CLIENT_CONFIG";
export declare class IPCClientModule {
    /**
     * Register module with configuration
     */
    static register(config: IPCClientConfig): DynamicModule;
    /**
     * Register module asynchronously
     */
    static registerAsync(options: {
        imports?: any[];
        inject?: any[];
        useFactory: (...args: any[]) => Promise<IPCClientConfig> | IPCClientConfig;
    }): DynamicModule;
    /**
     * Simple boot method using environment variables
     */
    static boot(configOverride?: Partial<IPCClientConfig>): DynamicModule;
}
export declare function getIPCClient(moduleRef: ModuleRef): IPCClient;
export { IPCClientService };
