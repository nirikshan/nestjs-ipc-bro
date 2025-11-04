"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var IPCServerModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCServer = exports.IPCServerService = exports.IPCServerModule = exports.IPC_SERVER_CONFIG = exports.IPC_SERVER_TOKEN = void 0;
const common_1 = require("@nestjs/common");
const ipc_bro_1 = require("ipc-bro");
Object.defineProperty(exports, "IPCServer", { enumerable: true, get: function () { return ipc_bro_1.IPCServer; } });
// ============================================================================
// CONSTANTS
// ============================================================================
/**
 * Token for injecting IPCServer instance
 */
exports.IPC_SERVER_TOKEN = "IPC_SERVER";
/**
 * Token for server configuration
 */
exports.IPC_SERVER_CONFIG = "IPC_SERVER_CONFIG";
// ============================================================================
// IPC SERVER MODULE
// ============================================================================
let IPCServerModule = IPCServerModule_1 = class IPCServerModule {
    constructor() {
        this.logger = new common_1.Logger(IPCServerModule_1.name);
    } // @Inject(IPC_SERVER_TOKEN) private readonly server?: IPCServer, // Can be injected if module is imported dynamically
    /**
     * Called when module initializes
     * If server was provided via DI, we could start it here
     */
    async onModuleInit() {
        // This is called if module is imported normally
        // For our use case, we use static boot() method instead
        this.logger.log("IPCServerModule initialized");
    }
    /**
     * Called when module is destroyed
     * Cleanup: stop server if running
     */
    async onModuleDestroy() {
        if (IPCServerModule_1.server) {
            this.logger.log("Stopping IPC Server...");
            await IPCServerModule_1.server.stop();
            IPCServerModule_1.server = null;
            this.logger.log("IPC Server stopped");
        }
    }
    // ============================================================================
    // DYNAMIC MODULE REGISTRATION
    // ============================================================================
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
    static register(config) {
        // Create server instance
        const server = new ipc_bro_1.IPCServer(config || {});
        // Create providers
        const serverProvider = {
            provide: exports.IPC_SERVER_TOKEN,
            useValue: server,
        };
        const configProvider = {
            provide: exports.IPC_SERVER_CONFIG,
            useValue: config || {},
        };
        return {
            module: IPCServerModule_1,
            providers: [serverProvider, configProvider],
            exports: [exports.IPC_SERVER_TOKEN, exports.IPC_SERVER_CONFIG],
            global: true, // Make available globally
        };
    }
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
    static registerAsync(options) {
        const serverProvider = {
            provide: exports.IPC_SERVER_TOKEN,
            useFactory: async (...args) => {
                const config = await options.useFactory(...args);
                const server = new ipc_bro_1.IPCServer(config);
                return server;
            },
            inject: options.inject || [],
        };
        const configProvider = {
            provide: exports.IPC_SERVER_CONFIG,
            useFactory: options.useFactory,
            inject: options.inject || [],
        };
        return {
            module: IPCServerModule_1,
            imports: options.imports || [],
            providers: [serverProvider, configProvider],
            exports: [exports.IPC_SERVER_TOKEN, exports.IPC_SERVER_CONFIG],
            global: true,
        };
    }
    // ============================================================================
    // STATIC BOOT METHOD (RECOMMENDED FOR GATEWAY)
    // ============================================================================
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
    static async boot(config, onLog) {
        const logger = new common_1.Logger("IPCServerBoot");
        try {
            logger.log("Starting IPC Gateway...");
            // Create server instance
            const server = new ipc_bro_1.IPCServer(config || {});
            // Setup event listeners for logging
            if (onLog) {
                server.on("log", (logData) => {
                    onLog(logData.message, logData.data);
                });
            }
            // Log important events
            server.on("started", (data) => {
                logger.log(`Gateway listening on: ${data.socketPath}`);
            });
            server.on("service-registered", (data) => {
                logger.log(`Service registered: ${data.serviceName} (${data.methods.length} methods)`);
            });
            server.on("service-disconnected", (data) => {
                logger.log(`Service disconnected: ${data.serviceName}`);
            });
            server.on("call-routed", (data) => {
                if (config?.debug) {
                    logger.debug(`Routing CALL: ${data.from} → ${data.to}.${data.method}()`);
                }
            });
            server.on("response-routed", (data) => {
                if (config?.debug) {
                    logger.debug(`Routing RESPONSE: ${data.from} → ${data.to} [${data.status}]`);
                }
            });
            server.on("error", (error) => {
                logger.error("Gateway error:", error);
            });
            // Start server
            await server.start();
            // Store reference for cleanup
            IPCServerModule_1.server = server;
            logger.log("✓ IPC Gateway started successfully");
            return server;
        }
        catch (error) {
            logger.error("Failed to start IPC Gateway:", error);
            throw error;
        }
    }
    /**
     * Stop the server
     *
     * Usage:
     * await IPCServerModule.shutdown();
     */
    static async shutdown() {
        const logger = new common_1.Logger("IPCServerShutdown");
        if (IPCServerModule_1.server) {
            logger.log("Shutting down IPC Gateway...");
            await IPCServerModule_1.server.stop();
            IPCServerModule_1.server = null;
            logger.log("✓ IPC Gateway stopped");
        }
    }
    /**
     * Get server instance
     *
     * @returns Server instance or null
     */
    static getServer() {
        return IPCServerModule_1.server;
    }
    /**
     * Get server status
     */
    static getStatus() {
        if (!IPCServerModule_1.server) {
            return {
                running: false,
                connectedServices: 0,
                services: [],
            };
        }
        return IPCServerModule_1.server.getStatus();
    }
};
exports.IPCServerModule = IPCServerModule;
IPCServerModule.server = null;
exports.IPCServerModule = IPCServerModule = IPCServerModule_1 = __decorate([
    (0, common_1.Module)({}),
    __metadata("design:paramtypes", [])
], IPCServerModule);
// ============================================================================
// HELPER SERVICE (Optional)
// ============================================================================
/**
 * Injectable service for accessing IPCServer
 *
 * Usage in controllers/services:
 *
 * @Injectable()
 * export class AdminService {
 *   constructor(private readonly ipcServerService: IPCServerService) {}
 *
 *   getConnectedServices() {
 *     return this.ipcServerService.getConnectedServices();
 *   }
 * }
 */
const common_2 = require("@nestjs/common");
let IPCServerService = class IPCServerService {
    constructor(server) {
        this.server = server;
    }
    /**
     * Get list of connected services
     */
    getConnectedServices() {
        return this.server.getConnectedServices();
    }
    /**
     * Get service info
     */
    getService(serviceName) {
        return this.server.getService(serviceName);
    }
    /**
     * Check if service is connected
     */
    isServiceConnected(serviceName) {
        return this.server.isServiceConnected(serviceName);
    }
    /**
     * Get server status
     */
    getStatus() {
        return this.server.getStatus();
    }
    /**
     * Get raw server instance (use carefully)
     */
    getServerInstance() {
        return this.server;
    }
};
exports.IPCServerService = IPCServerService;
exports.IPCServerService = IPCServerService = __decorate([
    (0, common_2.Injectable)(),
    __param(0, (0, common_2.Inject)(exports.IPC_SERVER_TOKEN)),
    __metadata("design:paramtypes", [ipc_bro_1.IPCServer])
], IPCServerService);
