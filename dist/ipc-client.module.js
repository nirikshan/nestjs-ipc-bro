"use strict";
/**
 * NestJS Module for IPC Client (Services)
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var IPCClientModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCClientService = exports.IPCClientModule = exports.IPC_CLIENT_CONFIG = exports.IPC_CLIENT_TOKEN = void 0;
exports.getIPCClient = getIPCClient;
const common_1 = require("@nestjs/common");
const ipc_bro_1 = require("ipc-bro");
const ipc_client_service_1 = require("./ipc-client.service");
Object.defineProperty(exports, "IPCClientService", { enumerable: true, get: function () { return ipc_client_service_1.IPCClientService; } });
const core_1 = require("@nestjs/core");
// ============================================================================
// CONSTANTS
// ============================================================================
exports.IPC_CLIENT_TOKEN = "IPC_CLIENT";
exports.IPC_CLIENT_CONFIG = "IPC_CLIENT_CONFIG";
// ============================================================================
// IPC CLIENT MODULE
// ============================================================================
// ============================================================================
// IPC CLIENT MODULE
// ============================================================================
console.log("this is message from ipc client nestjs...");
let IPCClientModule = IPCClientModule_1 = class IPCClientModule {
    /**
     * Register module with configuration
     */
    static register(config) {
        // Validate config
        if (!config.serviceName) {
            throw new Error("serviceName is required in IPCClientModule.register()");
        }
        // Create client instance
        const client = new ipc_bro_1.IPCClient(config);
        // Setup event logging
        const logger = new common_1.Logger(`IPCClient:${config.serviceName}`);
        client.on("connected", () => {
            logger.log("Connected to Gateway");
        });
        client.on("disconnected", () => {
            logger.warn("Disconnected from Gateway");
        });
        client.on("registered", () => {
            logger.log("Registered with Gateway");
        });
        client.on("method-executed", (data) => {
            if (config.debug) {
                logger.debug(`Method executed: ${data.method} [${data.success ? "success" : "failed"}]`);
            }
        });
        client.on("error", (error) => {
            logger.error("IPC Client error:", error);
        });
        // Create providers
        const clientProvider = {
            provide: exports.IPC_CLIENT_TOKEN,
            useValue: client,
        };
        const configProvider = {
            provide: exports.IPC_CLIENT_CONFIG,
            useValue: config,
        };
        return {
            module: IPCClientModule_1,
            providers: [
                clientProvider,
                configProvider,
                ipc_client_service_1.IPCClientService, // Injectable service
            ],
            exports: [exports.IPC_CLIENT_TOKEN, exports.IPC_CLIENT_CONFIG, ipc_client_service_1.IPCClientService],
            global: true, // Make available globally
        };
    }
    /**
     * Register module asynchronously
     */
    static registerAsync(options) {
        const clientProvider = {
            provide: exports.IPC_CLIENT_TOKEN,
            useFactory: async (...args) => {
                const config = await options.useFactory(...args);
                if (!config.serviceName) {
                    throw new Error("serviceName is required in IPCClientModule config");
                }
                const client = new ipc_bro_1.IPCClient(config);
                // Setup logging
                const logger = new common_1.Logger(`IPCClient:${config.serviceName}`);
                client.on("connected", () => logger.log("Connected to Gateway"));
                client.on("disconnected", () => logger.warn("Disconnected from Gateway"));
                client.on("registered", () => logger.log("Registered with Gateway"));
                client.on("error", (error) => logger.error("IPC Client error:", error));
                return client;
            },
            inject: options.inject || [],
        };
        const configProvider = {
            provide: exports.IPC_CLIENT_CONFIG,
            useFactory: options.useFactory,
            inject: options.inject || [],
        };
        return {
            module: IPCClientModule_1,
            imports: [...(options.imports || [])],
            providers: [clientProvider, configProvider, ipc_client_service_1.IPCClientService],
            exports: [exports.IPC_CLIENT_TOKEN, exports.IPC_CLIENT_CONFIG, ipc_client_service_1.IPCClientService],
            global: true,
        };
    }
    /**
     * Simple boot method using environment variables
     */
    static boot(configOverride) {
        const serviceName = configOverride?.serviceName || process.env.SERVICE_NAME;
        if (!serviceName) {
            throw new Error("SERVICE_NAME environment variable is required when using IPCClientModule.boot()");
        }
        const config = {
            serviceName,
            gatewayPath: configOverride?.gatewayPath ||
                process.env.IPC_GATEWAY_PATH ||
                "/tmp/brodox-gateway.sock",
            autoReconnect: configOverride?.autoReconnect !== false,
            reconnectDelay: configOverride?.reconnectDelay || 5000,
            timeout: configOverride?.timeout || 30000,
            heartbeatInterval: configOverride?.heartbeatInterval || 30000,
            debug: configOverride?.debug || process.env.DEBUG === "true",
            serializer: configOverride?.serializer || "msgpack",
            poolSize: configOverride?.poolSize || parseInt(process.env.IPC_POOL_SIZE || "1"),
        };
        return this.register(config);
    }
};
exports.IPCClientModule = IPCClientModule;
exports.IPCClientModule = IPCClientModule = IPCClientModule_1 = __decorate([
    (0, common_1.Module)({
        providers: [core_1.DiscoveryService, core_1.MetadataScanner],
    })
], IPCClientModule);
// ============================================================================
// HELPER
// ============================================================================
function getIPCClient(moduleRef) {
    return moduleRef.get(exports.IPC_CLIENT_TOKEN, { strict: false });
}
