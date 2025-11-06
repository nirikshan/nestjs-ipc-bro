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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var IPCClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCClientService = exports.IPC_CLIENT_CONFIG = exports.IPC_CLIENT_TOKEN = void 0;
const common_1 = require("@nestjs/common");
const ipc_bro_1 = require("ipc-bro");
const core_1 = require("@nestjs/core");
const ipc_method_decorator_1 = require("./ipc-method.decorator");
// ============================================================================
// CONSTANTS
// ============================================================================
exports.IPC_CLIENT_TOKEN = "IPC_CLIENT";
exports.IPC_CLIENT_CONFIG = "IPC_CLIENT_CONFIG";
// ============================================================================
// IPC CLIENT SERVICE (Injectable wrapper)
// ============================================================================
const common_2 = require("@nestjs/common");
let IPCClientService = IPCClientService_1 = class IPCClientService {
    constructor(client, config, discovery, moduleRef, metadataScanner) {
        this.client = client;
        this.config = config;
        this.discovery = discovery;
        this.moduleRef = moduleRef;
        this.metadataScanner = metadataScanner;
        this.logger = new common_1.Logger(IPCClientService_1.name);
        this.logger.log("IPCClientService initialized");
    }
    async onModuleInit() {
        try {
            this.discoverAndRegisterMethods();
            this.logger.log(`Connecting to Gateway: ${this.config.serviceName}`);
            await this.client.connect();
            this.logger.log("✓ Connected to Gateway");
        }
        catch (error) {
            this.logger.error("Failed to connect to Gateway:", error);
            throw error;
        }
    }
    async onModuleDestroy() {
        try {
            this.logger.log("Disconnecting from Gateway...");
            await this.client.disconnect();
            this.logger.log("✓ Disconnected from Gateway");
        }
        catch (error) {
            this.logger.error("Error during disconnect:", error);
        }
    }
    /**
     * Call remote service method
     */
    async call(targetService, method, params = {}) {
        return this.client.call(targetService, method, params);
    }
    /**
     * Register local method
     */
    registerMethod(methodName, handler) {
        this.client.registerMethod(methodName, handler);
    }
    /**
     * Get client status
     */
    getStatus() {
        return this.client.getStatus();
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.client.isConnected();
    }
    /**
     * Get raw client instance
     */
    getClient() {
        return this.client;
    }
    async discoverAndRegisterMethods() {
        this.logger.log("Discovering @IPCMethod decorated methods...");
        console.log("this is fine");
        // Get all providers and controllers
        const providers = this.discovery.getProviders();
        const controllers = this.discovery.getControllers();
        const instances = [...providers, ...controllers];
        let methodCount = 0;
        // Scan each instance
        for (const wrapper of instances) {
            const { instance } = wrapper;
            if (!instance || !Object.getPrototypeOf(instance)) {
                continue;
            }
            // Get all method names from the prototype
            const prototype = Object.getPrototypeOf(instance);
            const methodNames = this.metadataScanner.getAllMethodNames(prototype);
            // Check each method for @IPCMethod decorator
            for (const methodName of methodNames) {
                const methodRef = prototype[methodName];
                // Get metadata from decorator
                const metadata = Reflect.getMetadata(ipc_method_decorator_1.IPC_METHOD_METADATA_KEY, prototype, methodName);
                if (metadata) {
                    // This method has @IPCMethod decorator!
                    const ipcMethodName = metadata.name || methodName;
                    this.logger.log(`  → Registering: ${ipcMethodName} (${wrapper.name}.${methodName})`);
                    // Create handler that binds to instance
                    const handler = async (params, context) => {
                        // Bind method to its instance (preserve 'this')
                        return await methodRef.call(instance, params, context);
                    };
                    // Register with IPCClient
                    this.client.registerMethod(ipcMethodName, handler);
                    methodCount++;
                }
            }
        }
        this.logger.log(`✓ Registered ${methodCount} IPC methods`);
    }
};
exports.IPCClientService = IPCClientService;
exports.IPCClientService = IPCClientService = IPCClientService_1 = __decorate([
    (0, common_2.Injectable)(),
    __param(0, (0, common_1.Inject)(exports.IPC_CLIENT_TOKEN)),
    __param(1, (0, common_1.Inject)(exports.IPC_CLIENT_CONFIG)),
    __metadata("design:paramtypes", [ipc_bro_1.IPCClient, Object, core_1.DiscoveryService,
        core_1.ModuleRef,
        core_1.MetadataScanner])
], IPCClientService);
