import * as net from "net";
import * as fs from "fs";
import { EventEmitter } from "events";
import {
  IPCServerConfig,
  ServiceEntry,
  IPCMessage,
  CallMessage,
  ResponseMessage,
  RegisterMessage,
  HeartbeatMessage,
  IPCError,
  IPCErrorCode,
} from "./types";
import { IPCUtils } from "./utils";

export class IPCServer extends EventEmitter {
  private server: net.Server | null = null;
  private socketPath: string;
  private connectedServices: Map<string, ServiceEntry>;
  private socketToService: Map<net.Socket, string>;
  private config: IPCServerConfig;
  private isRunning: boolean = false;

  private socketBuffers: Map<net.Socket, Buffer>;

  constructor(config: Partial<IPCServerConfig> = {}) {
    super();

    this.config = {
      socketPath: config.socketPath || "/tmp/brodox-gateway.sock",
      heartbeatInterval: config.heartbeatInterval || 30000,
      timeout: config.timeout || 30000,
      debug: config.debug || false,
      serializer: config.serializer || "msgpack",
    };
    IPCUtils.setSerializer(this.config.serializer!);

    this.socketPath = this.config.socketPath;
    this.connectedServices = new Map();
    this.socketToService = new Map();
    this.socketBuffers = new Map();

    this.log("IPCServer initialized", { config: this.config });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new IPCError(
        "Server is already running",
        IPCErrorCode.CONNECTION_FAILED
      );
    }

    try {
      await this.removeSocketFile();

      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on("error", (error) => {
        this.log("Server error", { error });
        this.emit("error", error);
      });

      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.socketPath, () => {
          this.isRunning = true;
          this.log("Server started", { socketPath: this.socketPath });
          this.emit("started", { socketPath: this.socketPath });
          resolve();
        });

        this.server!.once("error", reject);
      });
    } catch (error: any) {
      throw new IPCError(
        `Failed to start server: ${error.message}`,
        IPCErrorCode.CONNECTION_FAILED,
        { error }
      );
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    try {
      /* Step 1: Close all service connections */
      for (const [serviceName, entry] of this.connectedServices.entries()) {
        entry.socket.destroy();
        this.log("Closed connection", { serviceName });
      }

      /*  Step 2: Close server */
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server!.close(() => {
            this.log("Server closed");
            resolve();
          });
        });
      }

      /* Step 3: Clean up */
      this.connectedServices.clear();
      this.socketToService.clear();
      this.socketBuffers.clear();
      await this.removeSocketFile();

      this.isRunning = false;
      this.emit("stopped");
    } catch (error) {
      this.log("Error stopping server", { error });
      throw error;
    }
  }

  getConnectedServices(): string[] {
    return Array.from(this.connectedServices.keys());
  }

  getService(serviceName: string): ServiceEntry | undefined {
    return this.connectedServices.get(serviceName);
  }

  isServiceConnected(serviceName: string): boolean {
    return this.connectedServices.has(serviceName);
  }

  getStatus(): {
    running: boolean;
    socketPath: string;
    connectedServices: number;
    services: string[];
  } {
    return {
      running: this.isRunning,
      socketPath: this.socketPath,
      connectedServices: this.connectedServices.size,
      services: this.getConnectedServices(),
    };
  }

  // ============================================================================
  // CONNECTION HANDLING
  // ============================================================================

  /**
   * Handle new service connection
   *
   * Called when a service connects to the Gateway socket
   *
   * Steps:
   * 1. Initialize buffer for this socket
   * 2. Setup event listeners (data, error, close)
   * 3. Wait for REGISTER message to identify service
   *
   * @param socket - Connected socket
   */
  private handleConnection(socket: net.Socket): void {
    this.log("New connection received");

    // Initialize buffer for this socket
    this.socketBuffers.set(socket, Buffer.alloc(0));

    // Setup socket event listeners
    socket.on("data", (data) => {
      this.handleSocketData(socket, data);
    });

    socket.on("error", (error) => {
      this.log("Socket error", { error });
      this.handleSocketError(socket, error);
    });

    socket.on("close", () => {
      this.handleSocketClose(socket);
    });

    this.emit("connection", { socket });
  }

  /**
   * Handle incoming data from socket
   *
   * Handles:
   * - Partial messages (accumulate in buffer)
   * - Multiple messages in one chunk (split them)
   * - Complete messages (process them)
   *
   * @param socket - Socket that sent data
   * @param data - Raw data buffer
   */
  private handleSocketData(socket: net.Socket, data: Buffer): void {
    try {
      // Get existing buffer for this socket
      let buffer = this.socketBuffers.get(socket) || Buffer.alloc(0);

      // Append new data
      buffer = Buffer.concat([buffer, data]);

      // Process all complete messages in buffer
      const { messages, remaining } = IPCUtils.splitMessages(buffer);

      // Store remaining buffer
      this.socketBuffers.set(socket, remaining);

      // Process each complete message
      for (const message of messages) {
        this.handleMessage(socket, message);
      }
    } catch (error) {
      this.log("Error handling socket data", { error });
      this.sendError(socket, null, error);
    }
  }

  /**
   * Handle socket error
   *
   * @param socket - Socket with error
   * @param error - Error object
   */
  private handleSocketError(socket: net.Socket, error: Error): void {
    const serviceName = this.socketToService.get(socket);

    this.log("Socket error", { serviceName, error: error.message });

    this.emit("socket-error", {
      serviceName,
      error,
    });

    // Close socket
    socket.destroy();
  }

  /**
   * Handle socket close (service disconnected)
   *
   * Steps:
   * 1. Find service name from socket
   * 2. Remove from registry
   * 3. Clean up buffers
   * 4. Emit event
   *
   * @param socket - Closed socket
   */
  private handleSocketClose(socket: net.Socket): void {
    const serviceName = this.socketToService.get(socket);

    if (serviceName) {
      this.log("Service disconnected", { serviceName });

      // Remove from registries
      this.connectedServices.delete(serviceName);
      this.socketToService.delete(socket);
      this.socketBuffers.delete(socket);

      this.emit("service-disconnected", { serviceName });
    } else {
      // Connection closed before registration
      this.socketBuffers.delete(socket);
    }
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  /**
   * Handle incoming message from a service
   *
   * Routes to appropriate handler based on message type:
   * - REGISTER -> registerService()
   * - CALL -> routeCall()
   * - RESPONSE -> routeResponse()
   * - HEARTBEAT -> handleHeartbeat()
   *
   * @param socket - Socket that sent message
   * @param message - Parsed message object
   */
  private handleMessage(socket: net.Socket, message: any): void {
    try {
      // Validate message structure
      IPCUtils.validateMessage(message);

      this.log("Message received", {
        type: message.type,
        from: message.from,
        to: message.to,
      });

      // Route based on message type
      switch (message.type) {
        case "REGISTER":
          this.handleRegister(socket, message as RegisterMessage);
          break;

        case "CALL":
          this.handleCall(socket, message as CallMessage);
          break;

        case "RESPONSE":
          this.handleResponse(socket, message as ResponseMessage);
          break;

        case "HEARTBEAT":
          this.handleHeartbeat(socket, message as HeartbeatMessage);
          break;

        default:
          throw new IPCError(
            `Unknown message type: ${message.type}`,
            IPCErrorCode.INVALID_MESSAGE
          );
      }
    } catch (error) {
      this.log("Error handling message", { error, message });
      this.sendError(socket, message, error);
    }
  }

  /**
   * Handle REGISTER message
   *
   * Service announces itself to Gateway
   *
   * Steps:
   * 1. Validate registration data
   * 2. Check for duplicate service name
   * 3. Store in registry
   * 4. Send acknowledgment
   * 5. Emit event
   *
   * @param socket - Service socket
   * @param message - REGISTER message
   */
  /**
   * Handle REGISTER message
   */
  // Correct signature
  /**
   * Handle REGISTER message
   */
  private handleRegister(socket: net.Socket, message: RegisterMessage): void {
    const { serviceName, methods, version, metadata } = message;

    this.log("Message received", {
      type: "REGISTER",
      from: serviceName,
      to: undefined,
    });

    //   Check if this is a pooled connection
    const isPoolConnection = metadata && typeof metadata.poolIndex === "number";

    //   Get existing service
    const existingService = this.connectedServices.get(serviceName);

    //   Allow multiple connections for pooled services
    if (existingService && !isPoolConnection) {
      // Single connection service already registered
      const errorMsg = {
        type: "ERROR",
        error: {
          message: `Service '${serviceName}' is already registered`,
          code: "CONNECTION_FAILED",
        },
      };

      const buffer = IPCUtils.serialize(errorMsg);
      socket.write(buffer);
      socket.end();
      return;
    }

    //   For pooled connections, add to existing service
    if (isPoolConnection && existingService) {
      this.log("Adding pooled connection", {
        serviceName,
        poolIndex: metadata.poolIndex,
      });

      // Store multiple sockets
      if (!(existingService as any).sockets) {
        (existingService as any).sockets = [existingService.socket];
      }
      (existingService as any).sockets.push(socket);

      // Update last heartbeat
      existingService.lastHeartbeat = Date.now();

      // Send ACK
      const ackMessage = { type: "REGISTER_ACK" };
      const buffer = IPCUtils.serialize(ackMessage);
      socket.write(buffer);

      return;
    }

    // Create new service entry
    const service: ServiceEntry = {
      name: serviceName,
      socket,
      methods: methods || [],
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      version,
      metadata,
    };

    // Store service
    this.connectedServices.set(serviceName, service);
    this.socketToService.set(socket, serviceName);

    this.log("Service registered", {
      serviceName,
      methods: methods?.length || 0,
      isPooled: isPoolConnection,
    });

    // Send ACK
    const ackMessage = { type: "REGISTER_ACK" };
    const buffer = IPCUtils.serialize(ackMessage);
    socket.write(buffer);

    // Emit event
    this.emit("service-registered", {
      serviceName,
      methods: methods || [],
    });
  }

  /**
   * Handle CALL message
   *
   * Route CALL from one service to another
   *
   * Steps:
   * 1. Validate context (check deadline)
   * 2. Find target service
   * 3. Forward message to target
   * 4. Emit event
   *
   * @param socket - Caller's socket
   * @param message - CALL message
   */
  /**
   * Handle CALL message
   */
  private handleCall(socket: net.Socket, message: CallMessage): void {
    const { from, to, method, context } = message;

    // Check deadline
    if (IPCUtils.isDeadlineExceeded(context)) {
      throw new IPCError(
        "Request deadline exceeded",
        IPCErrorCode.DEADLINE_EXCEEDED,
        { context }
      );
    }

    // Check max depth
    if (IPCUtils.isMaxDepthExceeded(context)) {
      throw new IPCError(
        "Maximum call depth exceeded",
        IPCErrorCode.MAX_DEPTH_EXCEEDED,
        { context }
      );
    }

    // Find target service
    const targetEntry = this.connectedServices.get(to);

    if (!targetEntry) {
      throw new IPCError(
        `Target service '${to}' not found`,
        IPCErrorCode.SERVICE_NOT_FOUND,
        { availableServices: this.getConnectedServices() }
      );
    }

    //   NEW: Use round-robin for pooled connections
    let targetSocket = targetEntry.socket;

    if ((targetEntry as any).sockets) {
      // Service has multiple sockets (connection pool)
      const sockets = (targetEntry as any).sockets as net.Socket[];
      const currentIndex = (targetEntry as any).currentSocketIndex || 0;

      targetSocket = sockets[currentIndex];

      // Update index for next call (round-robin)
      (targetEntry as any).currentSocketIndex =
        (currentIndex + 1) % sockets.length;

      this.log("Using pooled socket", {
        service: to,
        socketIndex: currentIndex,
        totalSockets: sockets.length,
      });
    }

    this.log("Routing CALL", {
      from,
      to,
      method,
      requestId: message.id,
    });

    // Forward message to target (using pooled socket if available)
    this.sendToSocket(targetSocket, message);

    // Emit event
    this.emit("call-routed", {
      from,
      to,
      method,
      requestId: message.id,
      context,
    });
  }

  /**
   * Handle RESPONSE message
   *
   * Route RESPONSE back to original caller
   *
   * Steps:
   * 1. Find caller service
   * 2. Forward message to caller
   * 3. Emit event
   *
   * @param socket - Responder's socket
   * @param message - RESPONSE message
   */
  private handleResponse(socket: net.Socket, message: ResponseMessage): void {
    const { from, to, status } = message;

    // Find caller service
    const targetEntry = this.connectedServices.get(to);

    if (!targetEntry) {
      // Caller disconnected, log and drop response
      this.log("Response target not found (caller disconnected)", {
        from,
        to,
        requestId: message.id,
      });
      return;
    }

    this.log("Routing RESPONSE", {
      from,
      to,
      status,
      requestId: message.id,
    });

    // Forward message to caller
    this.sendToSocket(targetEntry.socket, message);

    // Emit event
    this.emit("response-routed", {
      from,
      to,
      status,
      requestId: message.id,
    });
  }

  /**
   * Handle HEARTBEAT message
   *
   * Update last heartbeat timestamp for service
   *
   * @param socket - Service socket
   * @param message - HEARTBEAT message
   */
  private handleHeartbeat(socket: net.Socket, message: HeartbeatMessage): void {
    const serviceName = this.socketToService.get(socket);

    if (!serviceName) {
      return;
    }

    const entry = this.connectedServices.get(serviceName);

    if (entry) {
      entry.lastHeartbeat = Date.now();
      this.log("Heartbeat received", { serviceName });
    }
  }

  // ============================================================================
  // SENDING MESSAGES
  // ============================================================================

  /**
   * Send message to a specific socket
   *
   * @param socket - Target socket
   * @param message - Message to send
   */
  private sendToSocket(socket: net.Socket, message: any): void {
    try {
      const buffer = IPCUtils.serialize(message);
      socket.write(buffer);
    } catch (error) {
      this.log("Error sending message", { error, message });
      throw error;
    }
  }

  /**
   * Send error response back to caller
   *
   * @param socket - Caller socket
   * @param originalMessage - Original message that caused error
   * @param error - Error object
   */
  private sendError(
    socket: net.Socket,
    originalMessage: any,
    error: any
  ): void {
    try {
      const errorMessage = {
        type: "ERROR",
        id: originalMessage?.id,
        error: {
          message: error.message || "Unknown error",
          code: error.code || IPCErrorCode.EXECUTION_FAILED,
          stack: error.stack,
        },
        timestamp: Date.now(),
      };

      this.sendToSocket(socket, errorMessage);
    } catch (err) {
      this.log("Error sending error message", { err });
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Remove Unix socket file if exists
   */
  private async removeSocketFile(): Promise<void> {
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
        this.log("Removed existing socket file", {
          socketPath: this.socketPath,
        });
      }
    } catch (error) {
      this.log("Error removing socket file", { error });
    }
  }

  /**
   * Log helper (respects debug flag)
   *
   * @param message - Log message
   * @param data - Additional data
   */
  private log(message: string, data?: any): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[IPCServer] ${timestamp} - ${message}`, data || "");
    }

    // Always emit log event for external logging
    this.emit("log", { message, data, timestamp: Date.now() });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default IPCServer;
