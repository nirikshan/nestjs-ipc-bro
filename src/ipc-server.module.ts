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

import {
  Module,
  DynamicModule,
  Provider,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { IPCServer } from "ipc-bro";
import { IPCServerConfig } from "ipc-bro";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Token for injecting IPCServer instance
 */
export const IPC_SERVER_TOKEN = "IPC_SERVER";

/**
 * Token for server configuration
 */
export const IPC_SERVER_CONFIG = "IPC_SERVER_CONFIG";

// ============================================================================
// IPC SERVER MODULE
// ============================================================================

@Module({})
export class IPCServerModule implements OnModuleInit, OnModuleDestroy {
  private static server: IPCServer | null = null;
  private readonly logger = new Logger(IPCServerModule.name);

  constructor() {} // @Inject(IPC_SERVER_TOKEN) private readonly server?: IPCServer, // Can be injected if module is imported dynamically

  /**
   * Called when module initializes
   * If server was provided via DI, we could start it here
   */
  async onModuleInit(): Promise<void> {
    // This is called if module is imported normally
    // For our use case, we use static boot() method instead
    this.logger.log("IPCServerModule initialized");
  }

  /**
   * Called when module is destroyed
   * Cleanup: stop server if running
   */
  async onModuleDestroy(): Promise<void> {
    if (IPCServerModule.server) {
      this.logger.log("Stopping IPC Server...");
      await IPCServerModule.server.stop();
      IPCServerModule.server = null;
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
  static register(config?: Partial<IPCServerConfig>): DynamicModule {
    // Create server instance
    const server = new IPCServer(config || {});

    // Create providers
    const serverProvider: Provider = {
      provide: IPC_SERVER_TOKEN,
      useValue: server,
    };

    const configProvider: Provider = {
      provide: IPC_SERVER_CONFIG,
      useValue: config || {},
    };

    return {
      module: IPCServerModule,
      providers: [serverProvider, configProvider],
      exports: [IPC_SERVER_TOKEN, IPC_SERVER_CONFIG],
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
  static registerAsync(options: {
    imports?: any[];
    inject?: any[];
    useFactory: (
      ...args: any[]
    ) => Promise<Partial<IPCServerConfig>> | Partial<IPCServerConfig>;
  }): DynamicModule {
    const serverProvider: Provider = {
      provide: IPC_SERVER_TOKEN,
      useFactory: async (...args: any[]) => {
        const config = await options.useFactory(...args);
        const server = new IPCServer(config);
        return server;
      },
      inject: options.inject || [],
    };

    const configProvider: Provider = {
      provide: IPC_SERVER_CONFIG,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: IPCServerModule,
      imports: options.imports || [],
      providers: [serverProvider, configProvider],
      exports: [IPC_SERVER_TOKEN, IPC_SERVER_CONFIG],
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
  static async boot(
    config?: Partial<IPCServerConfig>,
    onLog?: (message: string, data?: any) => void
  ): Promise<IPCServer> {
    const logger = new Logger("IPCServerBoot");

    try {
      logger.log("Starting IPC Gateway...");

      // Create server instance
      const server = new IPCServer(config || {});

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
        logger.log(
          `Service registered: ${data.serviceName} (${data.methods.length} methods)`
        );
      });

      server.on("service-disconnected", (data) => {
        logger.log(`Service disconnected: ${data.serviceName}`);
      });

      server.on("call-routed", (data) => {
        if (config?.debug) {
          logger.debug(
            `Routing CALL: ${data.from} → ${data.to}.${data.method}()`
          );
        }
      });

      server.on("response-routed", (data) => {
        if (config?.debug) {
          logger.debug(
            `Routing RESPONSE: ${data.from} → ${data.to} [${data.status}]`
          );
        }
      });

      server.on("error", (error) => {
        logger.error("Gateway error:", error);
      });

      // Start server
      await server.start();

      // Store reference for cleanup
      IPCServerModule.server = server;

      logger.log("✓ IPC Gateway started successfully");

      return server;
    } catch (error) {
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
  static async shutdown(): Promise<void> {
    const logger = new Logger("IPCServerShutdown");

    if (IPCServerModule.server) {
      logger.log("Shutting down IPC Gateway...");
      await IPCServerModule.server.stop();
      IPCServerModule.server = null;
      logger.log("✓ IPC Gateway stopped");
    }
  }

  /**
   * Get server instance
   *
   * @returns Server instance or null
   */
  static getServer(): IPCServer | null {
    return IPCServerModule.server;
  }

  /**
   * Get server status
   */
  static getStatus() {
    if (!IPCServerModule.server) {
      return {
        running: false,
        connectedServices: 0,
        services: [],
      };
    }

    return IPCServerModule.server.getStatus();
  }
}

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
import { Injectable, Inject } from "@nestjs/common";

@Injectable()
export class IPCServerService {
  constructor(
    @Inject(IPC_SERVER_TOKEN)
    private readonly server: IPCServer
  ) {}

  /**
   * Get list of connected services
   */
  getConnectedServices(): string[] {
    return this.server.getConnectedServices();
  }

  /**
   * Get service info
   */
  getService(serviceName: string) {
    return this.server.getService(serviceName);
  }

  /**
   * Check if service is connected
   */
  isServiceConnected(serviceName: string): boolean {
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
  getServerInstance(): IPCServer {
    return this.server;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { IPCServer, IPCServerConfig };
