/**
 * NestJS Module for IPC Client (Services)
 */

import {
  Module,
  DynamicModule,
  Provider,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from "@nestjs/common";
import { IPCClient, IPCClientConfig } from "ipc-bro";
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
  ModuleRef,
} from "@nestjs/core";
import { IPC_METHOD_METADATA_KEY } from "./ipc-method.decorator";

// ============================================================================
// CONSTANTS
// ============================================================================

export const IPC_CLIENT_TOKEN = "IPC_CLIENT";
export const IPC_CLIENT_CONFIG = "IPC_CLIENT_CONFIG";

// ============================================================================
// IPC CLIENT SERVICE (Injectable wrapper)
// ============================================================================

import { Injectable } from "@nestjs/common";

@Injectable()
export class IPCClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IPCClientService.name);

  constructor(
    @Inject(IPC_CLIENT_TOKEN) private readonly client: IPCClient,
    @Inject(IPC_CLIENT_CONFIG) private readonly config: IPCClientConfig,
    private readonly discovery: DiscoveryService,
    private readonly moduleRef: ModuleRef,
    private readonly metadataScanner: MetadataScanner
  ) {
    this.logger.log("IPCClientService initialized");
  }

  async onModuleInit(): Promise<void> {
    try {
      this.discoverAndRegisterMethods();
      this.logger.log(`Connecting to Gateway: ${this.config.serviceName}`);
      await this.client.connect();
      this.logger.log("✓ Connected to Gateway");
    } catch (error) {
      this.logger.error("Failed to connect to Gateway:", error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.logger.log("Disconnecting from Gateway...");
      await this.client.disconnect();
      this.logger.log("✓ Disconnected from Gateway");
    } catch (error) {
      this.logger.error("Error during disconnect:", error);
    }
  }

  /**
   * Call remote service method
   */
  async call<T = any>(
    targetService: string,
    method: string,
    params: any = {}
  ): Promise<T> {
    return this.client.call<T>(targetService, method, params);
  }

  /**
   * Register local method
   */
  registerMethod(
    methodName: string,
    handler: (params: any, context?: any) => Promise<any>
  ): void {
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
  isConnected(): boolean {
    return this.client.isConnected();
  }

  /**
   * Get raw client instance
   */
  getClient(): IPCClient {
    return this.client;
  }

  private async discoverAndRegisterMethods(): Promise<void> {
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
        const metadata = Reflect.getMetadata(
          IPC_METHOD_METADATA_KEY,
          prototype,
          methodName
        );

        if (metadata) {
          // This method has @IPCMethod decorator!
          const ipcMethodName = metadata.name || methodName;

          this.logger.log(
            `  → Registering: ${ipcMethodName} (${wrapper.name}.${methodName})`
          );

          // Create handler that binds to instance
          const handler = async (params: any, context: any) => {
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
}
