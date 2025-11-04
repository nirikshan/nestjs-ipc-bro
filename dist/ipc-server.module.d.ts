/**
 * NestJS Module for IPC Server (Gateway)
 *
 * This module provides a NestJS-friendly way to start the Gateway.
 * It wraps the core IPCServer class and integrates it with NestJS DI.
 *
 * Usage in Gateway's main.ts:
 *
 * import { IPCServerModule } from './ipc/nestjs/ipc-server.module';
 *
 * async function bootstrap() {
 *   // Start IPC Gateway
 *   await IPCServerModule.boot({
 *     socketPath: '/tmp/brodox-gateway.sock',
 *     debug: true,
 *   });
 *
 *   // Start HTTP API
 *   const app = await NestFactory.create(AppModule);
 *   await app.listen(3000);
 * }
 */
import { DynamicModule, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { IPCServer } from "ipc-bro";
import { IPCServerConfig } from "ipc-bro";
/**
 * Token for injecting IPCServer instance
 */
export declare const IPC_SERVER_TOKEN = "IPC_SERVER";
/**
 * Token for server configuration
 */
export declare const IPC_SERVER_CONFIG = "IPC_SERVER_CONFIG";
export declare class IPCServerModule implements OnModuleInit, OnModuleDestroy {
    private static server;
    private readonly logger;
    constructor();
    /**
     * Called when module initializes
     * If server was provided via DI, we could start it here
     */
    onModuleInit(): Promise<void>;
    /**
     * Called when module is destroyed
     * Cleanup: stop server if running
     */
    onModuleDestroy(): Promise<void>;
    /**
     * Register module with configuration
     *
     * This method allows importing the module in AppModule
     * and injecting the server instance into other services.
     *
     * Usage in app.module.ts:
     *
     * @Module({
     *   imports: [
     *     IPCServerModule.register({
     *       socketPath: '/tmp/brodox-gateway.sock',
     *       debug: true,
     *     })
     *   ]
     * })
     * export class AppModule {}
     *
     * Then inject in services:
     * constructor(@Inject(IPC_SERVER_TOKEN) private server: IPCServer) {}
     *
     * @param config - Server configuration
     * @returns DynamicModule
     */
    static register(config?: Partial<IPCServerConfig>): DynamicModule;
    /**
     * Register module asynchronously
     *
     * Useful when config needs to be loaded from ConfigService
     *
     * Usage:
     *
     * @Module({
     *   imports: [
     *     IPCServerModule.registerAsync({
     *       imports: [ConfigModule],
     *       inject: [ConfigService],
     *       useFactory: (config: ConfigService) => ({
     *         socketPath: config.get('IPC_SOCKET_PATH'),
     *         debug: config.get('DEBUG'),
     *       }),
     *     })
     *   ]
     * })
     *
     * @param options - Async configuration options
     * @returns DynamicModule
     */
    static registerAsync(options: {
        imports?: any[];
        inject?: any[];
        useFactory: (...args: any[]) => Promise<Partial<IPCServerConfig>> | Partial<IPCServerConfig>;
    }): DynamicModule;
    /**
     * Simple boot method for Gateway
     *
     * This is the RECOMMENDED way to start the Gateway in main.ts
     * It's simpler than using the full NestJS module system.
     *
     * Usage in main.ts:
     *
     * async function bootstrap() {
     *   // Start IPC Gateway - ONE LINE!
     *   await IPCServerModule.boot({
     *     socketPath: '/tmp/brodox-gateway.sock',
     *     debug: true,
     *   });
     *
     *   // Start NestJS app
     *   const app = await NestFactory.create(AppModule);
     *   await app.listen(3000);
     * }
     *
     * @param config - Server configuration
     * @param onLog - Optional log callback
     * @returns Server instance
     */
    static boot(config?: Partial<IPCServerConfig>, onLog?: (message: string, data?: any) => void): Promise<IPCServer>;
    /**
     * Stop the server
     *
     * Usage:
     * await IPCServerModule.shutdown();
     */
    static shutdown(): Promise<void>;
    /**
     * Get server instance
     *
     * @returns Server instance or null
     */
    static getServer(): IPCServer | null;
    /**
     * Get server status
     */
    static getStatus(): {
        running: boolean;
        socketPath: string;
        connectedServices: number;
        services: string[];
    } | {
        running: boolean;
        connectedServices: number;
        services: never[];
    };
}
export declare class IPCServerService {
    private readonly server;
    constructor(server: IPCServer);
    /**
     * Get list of connected services
     */
    getConnectedServices(): string[];
    /**
     * Get service info
     */
    getService(serviceName: string): import("ipc-bro").ServiceEntry | undefined;
    /**
     * Check if service is connected
     */
    isServiceConnected(serviceName: string): boolean;
    /**
     * Get server status
     */
    getStatus(): {
        running: boolean;
        socketPath: string;
        connectedServices: number;
        services: string[];
    };
    /**
     * Get raw server instance (use carefully)
     */
    getServerInstance(): IPCServer;
}
export { IPCServer, IPCServerConfig };
