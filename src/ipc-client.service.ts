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
import { ModuleRef } from "@nestjs/core";
import { IPCClient, IPCClientConfig } from "ipc-bro";

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
    @Inject(IPC_CLIENT_CONFIG) private readonly config: IPCClientConfig
  ) {
    this.logger.log("IPCClientService initialized");
  }

  async onModuleInit(): Promise<void> {
    try {
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
}
