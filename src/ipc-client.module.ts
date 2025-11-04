/**
 * NestJS Module for IPC Client (Services)
 */

import { Module, DynamicModule, Provider, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { IPCClient, IPCClientConfig } from "ipc-bro";
import { IPCClientService } from "./ipc-client.service"; // ✅ NAMED IMPORT

// ============================================================================
// CONSTANTS
// ============================================================================

export const IPC_CLIENT_TOKEN = "IPC_CLIENT";
export const IPC_CLIENT_CONFIG = "IPC_CLIENT_CONFIG";

// ============================================================================
// IPC CLIENT MODULE
// ============================================================================

// ============================================================================
// IPC CLIENT MODULE
// ============================================================================

@Module({})
export class IPCClientModule {
  /**
   * Register module with configuration
   */
  static register(config: IPCClientConfig): DynamicModule {
    // Validate config
    if (!config.serviceName) {
      throw new Error("serviceName is required in IPCClientModule.register()");
    }

    // Create client instance
    const client = new IPCClient(config);

    // Setup event logging
    const logger = new Logger(`IPCClient:${config.serviceName}`);

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
        logger.debug(
          `Method executed: ${data.method} [${
            data.success ? "success" : "failed"
          }]`
        );
      }
    });

    client.on("error", (error) => {
      logger.error("IPC Client error:", error);
    });

    // Create providers
    const clientProvider: Provider = {
      provide: IPC_CLIENT_TOKEN,
      useValue: client,
    };

    const configProvider: Provider = {
      provide: IPC_CLIENT_CONFIG,
      useValue: config,
    };

    return {
      module: IPCClientModule,
      providers: [
        clientProvider,
        configProvider,
        IPCClientService, // Injectable service
      ],
      exports: [IPC_CLIENT_TOKEN, IPC_CLIENT_CONFIG, IPCClientService],
      global: true, // Make available globally
    };
  }

  /**
   * Register module asynchronously
   */
  static registerAsync(options: {
    imports?: any[];
    inject?: any[];
    useFactory: (...args: any[]) => Promise<IPCClientConfig> | IPCClientConfig;
  }): DynamicModule {
    const clientProvider: Provider = {
      provide: IPC_CLIENT_TOKEN,
      useFactory: async (...args: any[]) => {
        const config = await options.useFactory(...args);

        if (!config.serviceName) {
          throw new Error("serviceName is required in IPCClientModule config");
        }

        const client = new IPCClient(config);

        // Setup logging
        const logger = new Logger(`IPCClient:${config.serviceName}`);
        client.on("connected", () => logger.log("Connected to Gateway"));
        client.on("disconnected", () =>
          logger.warn("Disconnected from Gateway")
        );
        client.on("registered", () => logger.log("Registered with Gateway"));
        client.on("error", (error) => logger.error("IPC Client error:", error));

        return client;
      },
      inject: options.inject || [],
    };

    const configProvider: Provider = {
      provide: IPC_CLIENT_CONFIG,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: IPCClientModule,
      imports: [...(options.imports || [])],
      providers: [clientProvider, configProvider, IPCClientService],
      exports: [IPC_CLIENT_TOKEN, IPC_CLIENT_CONFIG, IPCClientService],
      global: true,
    };
  }

  /**
   * Simple boot method using environment variables
   */
  static boot(configOverride?: Partial<IPCClientConfig>): DynamicModule {
    const serviceName = configOverride?.serviceName || process.env.SERVICE_NAME;

    if (!serviceName) {
      throw new Error(
        "SERVICE_NAME environment variable is required when using IPCClientModule.boot()"
      );
    }

    const config: IPCClientConfig = {
      serviceName,
      gatewayPath:
        configOverride?.gatewayPath ||
        process.env.IPC_GATEWAY_PATH ||
        "/tmp/brodox-gateway.sock",
      autoReconnect: configOverride?.autoReconnect !== false,
      reconnectDelay: configOverride?.reconnectDelay || 5000,
      timeout: configOverride?.timeout || 30000,
      heartbeatInterval: configOverride?.heartbeatInterval || 30000,
      debug: configOverride?.debug || process.env.DEBUG === "true",
      serializer: (configOverride?.serializer as any) || "msgpack",
      poolSize:
        configOverride?.poolSize || parseInt(process.env.IPC_POOL_SIZE || "1"),
    };

    return this.register(config);
  }
}

// ============================================================================
// HELPER
// ============================================================================

export function getIPCClient(moduleRef: ModuleRef): IPCClient {
  return moduleRef.get<IPCClient>(IPC_CLIENT_TOKEN, { strict: false });
}

export { IPCClientService };
