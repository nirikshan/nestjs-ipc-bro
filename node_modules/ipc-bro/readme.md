## IPC

### Types Used On IPC

##### Types:

- MessageType: 'CALL' | 'RESPONSE' | 'REGISTER' | 'HEARTBEAT'
- ResponseStatus: 'success' | 'error'
- MethodHandler: Function type for handlers
- MethodRegistry: Map of method handlers

---

#### Interfaces:

- IPCContext: Request chain tracking
- BaseMessage: Common message fields
- CallMessage: Method call request
- ResponseMessage: Method call result
- RegisterMessage: Service registration
- HeartbeatMessage: Keep-alive
- IPCMessage: Union of all messages
- PendingRequest: Promise tracking
- ServiceEntry: Connected service info
- IPCServerConfig: Gateway configuration
- IPCClientConfig: Service configuration

---

#### Classes:

- IPCError: Custom error class
- IPCErrorCode: Error code enum

### Util Methods

##### Utility functions for Bro IPC system This file contains helper functions for:

- Message serialization/deserialization (length-prefixed JSON)
- ID generation
- Context management (create, extend, validate)
- Time/deadline helpers

### 1. **Message Serialization** (Core Feature)

- `serialize()` - Converts message to length-prefixed buffer
- `deserialize()` - Converts buffer back to message
- `readMessageLength()` - Peek at message length without parsing
- `hasCompleteMessage()` - Check if buffer has full message
- `splitMessages()` - Handle multiple messages in one buffer

### 2. **ID Generation**

- `generateId()` - Unique request IDs
- `generateRootId()` - Correlation IDs for tracking

### 3. **Context Management** (Critical for Nested Calls)

- `createContext()` - Start new request chain
- `extendContext()` - Propagate context to nested calls
- `validateContext()` - Ensure context is valid

### 4. **Time/Deadline**

- `isDeadlineExceeded()` - Check timeouts
- `getRemainingTime()` - Calculate time left
- `calculateDeadline()` - Convert duration to timestamp

### 5. **Message Builders**

- `createCallMessage()` - Build CALL messages
- `createSuccessResponse()` - Build success responses
- `createErrorResponse()` - Build error responses

### 6. **Validation**

- `validateMessage()` - Ensure message structure
- `isMaxDepthExceeded()` - Prevent infinite loops

### 7. **Debug Helpers**

- `formatMessageForLog()` - Pretty print messages
- `formatContext()` - Display call chain

### 8. **Utilities**

- `calculateBackoff()` - Exponential backoff for retries
- `sleep()` - Async delay
- `createTimeoutPromise()` - Timeout helper

---

## Implementation Details

### Length-Prefixed Protocol

```js
Buffer: [0x00, 0x00, 0x00, 0x32] + JSON bytes
         └─────────┬────────┘
              50 bytes (length)
```

### Context Flow

```js
Order creates context:
{ root: 'root-123', chain: ['order'], depth: 1 }

Order calls User (extends context):
{ root: 'root-123', chain: ['order', 'user'], depth: 2 }

User calls Role (extends again):
{ root: 'root-123', chain: ['order', 'user', 'role'], depth: 3 }
```

## ipc-server

The IPC Server acts as a **hub** that:

- Listens on a Unix Domain Socket
- Accepts connections from services
- Routes CALL messages to target services
- Routes RESPONSE messages back to callers
- Manages service registry
- Monitors service health via heartbeats

```
                    Gateway (IPC Server)
                /tmp/bro-gateway.sock
                         |
        +----------------+----------------+
        |                |                |
   Order Service    Cart Service    User Service
   (connects)       (connects)      (connects)
```

---

## Architecture

### Message Flow

```
1. Service A connects → Gateway stores connection
2. Service B connects → Gateway stores connection
3. Service A sends CALL to Service B
   ↓
4. Gateway receives CALL
   ↓
5. Gateway looks up Service B socket
   ↓
6. Gateway forwards CALL to Service B
   ↓
7. Service B executes method
   ↓
8. Service B sends RESPONSE to Gateway
   ↓
9. Gateway forwards RESPONSE to Service A
   ↓
10. Service A receives result
```

## 🚀 Basic Usage

### Standalone (No NestJS)

```typescript
import { IPCServer } from "./ipc/core/ipc-server";

// Create server
const server = new IPCServer({
  socketPath: "/tmp/bro-gateway.sock",
  debug: true,
});

// Listen to events
server.on("service-registered", (data) => {
  console.log(`Service registered: ${data.serviceName}`);
});

server.on("call-routed", (data) => {
  console.log(`Routing: ${data.from} → ${data.to}.${data.method}()`);
});

// Start server
await server.start();
console.log("Gateway running!");

// Later... stop server
await server.stop();
```

## 📚 API Reference

### Constructor

```typescript
new IPCServer(config?: Partial)
```

Creates a new IPC Server instance.

**Parameters:**

- `config` (optional): Server configuration object

**Example:**

```typescript
const server = new IPCServer({
  socketPath: "/tmp/bro-gateway.sock",
  heartbeatInterval: 30000,
  timeout: 30000,
  debug: false,
});
```

---

### Methods

#### `start(): Promise<void>`

Starts the IPC Server and begins listening for connections.

**Returns:** Promise that resolves when server is listening

**Throws:** `IPCError` if server fails to start

**Example:**

```typescript
await server.start();
console.log("Server started successfully!");
```

**What it does:**

1. Removes existing socket file if present
2. Creates net.Server
3. Listens on Unix socket path
4. Sets up connection handlers
5. Emits `started` event

---

#### `stop(): Promise<void>`

Stops the IPC Server gracefully.

**Returns:** Promise that resolves when server is stopped

**Example:**

```typescript
await server.stop();
console.log("Server stopped");
```

**What it does:**

1. Closes all service connections
2. Closes server
3. Removes socket file
4. Clears registries
5. Emits `stopped` event

---

#### `getConnectedServices(): string[]`

Gets list of connected service names.

**Returns:** Array of service names

**Example:**

```typescript
const services = server.getConnectedServices();
console.log("Connected services:", services);
// Output: ['order-service', 'user-service', 'cart-service']
```

---

#### `getService(serviceName: string): ServiceEntry | undefined`

Gets detailed information about a specific service.

**Parameters:**

- `serviceName`: Name of the service

**Returns:** ServiceEntry object or undefined if not found

**Example:**

```typescript
const service = server.getService("order-service");
console.log(service);
// Output:
// {
//   name: 'order-service',
//   socket: Socket {...},
//   methods: ['getOrderList', 'createOrder'],
//   connectedAt: 1699005123456,
//   lastHeartbeat: 1699005150000,
//   metadata: {}
// }
```

---

#### `isServiceConnected(serviceName: string): boolean`

Checks if a service is currently connected.

**Parameters:**

- `serviceName`: Name of the service

**Returns:** true if connected, false otherwise

**Example:**

```typescript
if (server.isServiceConnected("user-service")) {
  console.log("User service is online");
} else {
  console.log("User service is offline");
}
```

---

#### `getStatus(): object`

Gets server status and statistics.

**Returns:** Status object with server information

**Example:**

```typescript
const status = server.getStatus();
console.log(status);
// Output:
// {
//   running: true,
//   socketPath: '/tmp/bro-gateway.sock',
//   connectedServices: 3,
//   services: ['order-service', 'user-service', 'cart-service']
// }
```

---

## ⚙️ Configuration

### IPCServerConfig Interface

```typescript
interface IPCServerConfig {
  socketPath: string; // Unix socket path
  heartbeatInterval?: number; // Heartbeat interval (ms)
  timeout?: number; // Request timeout (ms)
  debug?: boolean; // Enable debug logging
  serializer?: "json" | "msgpack"; // Serialization format
}
```

### Configuration Options

| Option              | Type    | Default                 | Description                         |
| ------------------- | ------- | ----------------------- | ----------------------------------- |
| `socketPath`        | string  | `/tmp/bro-gateway.sock` | Unix socket file path               |
| `heartbeatInterval` | number  | `30000`                 | How often to expect heartbeats (ms) |
| `timeout`           | number  | `30000`                 | Request timeout duration (ms)       |
| `debug`             | boolean | `false`                 | Enable debug logging (slower)       |
| `serializer`        | string  | `'json'`                | Message serialization format        |

### Configuration Examples

#### Development (Verbose logging)

```typescript
const server = new IPCServer({
  socketPath: "/tmp/dev-gateway.sock",
  debug: true,
  heartbeatInterval: 10000, // Faster heartbeat
});
```

#### Production (Optimized)

```typescript
const server = new IPCServer({
  socketPath: "/var/run/bro-gateway.sock",
  debug: false,
  // serializer: 'msgpack', // I will implement this later for Faster serialization after implementation I will uncomment it
  timeout: 60000, // Longer timeout
});
```

#### Testing

```typescript
const server = new IPCServer({
  socketPath: "/tmp/test-gateway.sock",
  debug: true,
  timeout: 5000, // Shorter timeout
});
```

---

---

## 🎪 Events

The IPC Server is an EventEmitter and emits the following events:

### `started`

Emitted when server starts successfully.

**Payload:**

```typescript
{
  socketPath: string;
}
```

**Example:**

```typescript
server.on("started", (data) => {
  console.log(`Gateway listening on: ${data.socketPath}`);
});
```

---

### `stopped`

Emitted when server stops.

**Example:**

```typescript
server.on("stopped", () => {
  console.log("Gateway stopped");
});
```

---

### `service-registered`

Emitted when a service connects and registers.

**Payload:**

```typescript
{
  serviceName: string;
  methods: string[];
  version?: string;
  metadata?: object;
}
```

**Example:**

```typescript
server.on("service-registered", (data) => {
  console.log(`Service registered: ${data.serviceName}`);
  console.log(`Available methods: ${data.methods.join(", ")}`);
});
```

---

### `service-disconnected`

Emitted when a service disconnects.

**Payload:**

```typescript
{
  serviceName: string;
}
```

**Example:**

```typescript
server.on("service-disconnected", (data) => {
  console.log(`Service disconnected: ${data.serviceName}`);
  // Maybe trigger alerts or restart service
});
```

---

### `call-routed`

Emitted when a CALL message is routed.

**Payload:**

```typescript
{
  from: string;
  to: string;
  method: string;
  requestId: string;
  context: IPCContext;
}
```

**Example:**

```typescript
server.on("call-routed", (data) => {
  console.log(`${data.from} → ${data.to}.${data.method}()`);

  // Track metrics
  metrics.increment("ipc.calls", {
    from: data.from,
    to: data.to,
    method: data.method,
  });
});
```

---

### `response-routed`

Emitted when a RESPONSE message is routed.

**Payload:**

```typescript
{
  from: string;
  to: string;
  status: "success" | "error";
  requestId: string;
}
```

**Example:**

```typescript
server.on("response-routed", (data) => {
  console.log(`Response: ${data.from} → ${data.to} [${data.status}]`);

  // Track success/error rates
  metrics.increment(`ipc.responses.${data.status}`);
});
```

---

### `error`

Emitted when an error occurs.

**Payload:**

```typescript
Error;
```

**Example:**

```typescript
server.on("error", (error) => {
  console.error("Gateway error:", error);
  // Log to monitoring system
  logger.error("IPC Gateway Error", { error });
});
```

---

### `log`

Emitted for all log messages (regardless of debug setting).

**Payload:**

```typescript
{
  message: string;
  data?: any;
  timestamp: number;
}
```

**Example:**

```typescript
server.on("log", (logData) => {
  // Send to external logging service
  winston.info(logData.message, logData.data);
});
```

---

## 💡 Examples

### Example 1: Basic Gateway

```typescript
import { IPCServer } from "./ipc/core/ipc-server";

async function startGateway() {
  const server = new IPCServer({
    socketPath: "/tmp/bro-gateway.sock",
    debug: true,
  });

  // Listen to events
  server.on("service-registered", (data) => {
    console.log(`✓ ${data.serviceName} registered`);
  });

  server.on("call-routed", (data) => {
    console.log(`→ ${data.from} calling ${data.to}.${data.method}()`);
  });

  // Start server
  await server.start();
  console.log("Gateway running!");

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    await server.stop();
    process.exit(0);
  });
}

startGateway();
```

---

### Example 2: Gateway with Metrics

```typescript
import { IPCServer } from "./ipc/core/ipc-server";
import { StatsD } from "hot-shots";

const statsd = new StatsD();

const server = new IPCServer({
  socketPath: "/tmp/bro-gateway.sock",
  debug: false,
});

// Track service connections
server.on("service-registered", (data) => {
  statsd.increment("gateway.services.connected");
  statsd.gauge("gateway.services.total", server.getConnectedServices().length);
});

server.on("service-disconnected", (data) => {
  statsd.increment("gateway.services.disconnected");
  statsd.gauge("gateway.services.total", server.getConnectedServices().length);
});

// Track message routing
server.on("call-routed", (data) => {
  statsd.increment("gateway.calls.routed", {
    from: data.from,
    to: data.to,
  });
});

server.on("response-routed", (data) => {
  statsd.increment(`gateway.responses.${data.status}`);
});

await server.start();
```

---

### Example 3: Gateway with Health Checks

```typescript
import { IPCServer } from "./ipc/core/ipc-server";
import express from "express";

const server = new IPCServer({
  socketPath: "/tmp/bro-gateway.sock",
});

// HTTP health endpoint
const app = express();

app.get("/health", (req, res) => {
  const status = server.getStatus();

  res.json({
    healthy: status.running,
    services: status.services,
    connectedServices: status.connectedServices,
  });
});

app.get("/services", (req, res) => {
  const services = server.getConnectedServices().map((name) => {
    const service = server.getService(name);
    return {
      name: service.name,
      methods: service.methods,
      connectedAt: new Date(service.connectedAt).toISOString(),
      lastHeartbeat: new Date(service.lastHeartbeat).toISOString(),
    };
  });

  res.json({ services });
});

await server.start();
app.listen(3000);
console.log("Gateway running with health API on port 3000");
```

---

### Example 4: Gateway with Auto-Restart

```typescript
import { IPCServer } from "./ipc/core/ipc-server";

async function startGateway() {
  let server: IPCServer;
  let restartCount = 0;
  const maxRestarts = 5;

  const start = async () => {
    try {
      server = new IPCServer({
        socketPath: "/tmp/bro-gateway.sock",
        debug: true,
      });

      server.on("error", async (error) => {
        console.error("Gateway error:", error);

        if (restartCount < maxRestarts) {
          restartCount++;
          console.log(`Restarting gateway (attempt ${restartCount})...`);

          await server.stop();
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await start();
        } else {
          console.error("Max restarts reached, giving up");
          process.exit(1);
        }
      });

      await server.start();
      console.log("Gateway started");
      restartCount = 0; // Reset on successful start
    } catch (error) {
      console.error("Failed to start gateway:", error);
      process.exit(1);
    }
  };

  await start();
}

startGateway();
```

## ipc-client

The IPC Client allows services to:

- Connect to the Gateway
- Register methods that can be called by other services
- Call methods on other services
- Handle automatic reconnection
- Track pending requests with promises

```
Service (Order/User/Cart)
         |
    IPCClient ────────> Gateway (/tmp/bro-gateway.sock)
         |
   (Your Methods)
```

---

## 🏗️ Architecture

### Connection Flow

```
1. Create IPCClient instance
   ↓
2. Register local methods (what this service can do)
   ↓
3. Connect to Gateway
   ↓
4. Send REGISTER message (tell Gateway about methods)
   ↓
5. Start heartbeat
   ↓
6. Ready to send/receive calls
```

### Call Flow

```
// Making a call
Service A → client.call() → Gateway → Service B
                                ↓
Service A ← Gateway ← Service B (response)

-------------------------------------------------

// Receiving a call
Service B ← Gateway ← Service A (incoming call)
     ↓
Execute method
     ↓
Service B → Gateway → Service A (send response)
```

### Basic Usage

```typescript
import { IPCClient } from "./ipc/core/ipc-client";

// Create client
const client = new IPCClient({
  serviceName: "order-service",
  gatewayPath: "/tmp/bro-gateway.sock",
  debug: true,
});

// Register methods this service provides
client.registerMethod("getOrderList", async (params, context) => {
  console.log("Getting orders for user:", params.userId);
  return [
    { id: 1, name: "Order #1" },
    { id: 2, name: "Order #2" },
  ];
});

// Connect to Gateway
await client.connect();
console.log("Connected to Gateway!");

// Call another service
const userData = await client.call("user-service", "getUserById", {
  userId: "123",
});

console.log("User data:", userData);

// Later... disconnect
await client.disconnect();
```

## API Reference

### Constructor

```typescript
new IPCClient(config: IPCClientConfig)
```

Creates a new IPC Client instance.

**Parameters:**

- `config`: Client configuration object (required)

**Example:**

```typescript
const client = new IPCClient({
  serviceName: "order-service",
  gatewayPath: "/tmp/bro-gateway.sock",
  autoReconnect: true,
  reconnectDelay: 5000,
  timeout: 30000,
  debug: false,
});
```

---

### Methods

#### `connect(): Promise<void>`

Connects to the Gateway and registers the service.

**Returns:** Promise that resolves when connected and registered

**Throws:** `IPCError` if connection fails

**Example:**

```typescript
try {
  await client.connect();
  console.log("✓ Connected to Gateway");
} catch (error) {
  console.error("Failed to connect:", error);
}
```

**What it does:**

1. Creates socket connection
2. Sends REGISTER message with service name and methods
3. Waits for acknowledgment
4. Starts heartbeat
5. Emits `connected` event

---

#### `disconnect(): Promise<void>`

Disconnects from the Gateway gracefully.

**Returns:** Promise that resolves when disconnected

**Example:**

```typescript
await client.disconnect();
console.log("Disconnected from Gateway");
```

**What it does:**

1. Stops heartbeat
2. Rejects all pending requests
3. Closes socket
4. Clears state
5. Emits `disconnected` event

---

#### `registerMethod(methodName: string, handler: MethodHandler): void`

Registers a method that can be called by other services.

**Parameters:**

- `methodName`: Name of the method
- `handler`: Async function that handles the method call

**Example:**

```typescript
client.registerMethod("getUserById", async (params, context) => {
  console.log("Getting user:", params.userId);
  console.log("Call chain:", context.chain);

  return {
    id: params.userId,
    name: "Nirikshan Bhusal",
    email: "nirikshan@nirikshan.com",
  };
});
```

**Handler Signature:**

```typescript
type MethodHandler = (params: any, context: IPCContext) => Promise;
```

---

#### `unregisterMethod(methodName: string): void`

Removes a registered method.

**Parameters:**

- `methodName`: Name of the method to remove

**Example:**

```typescript
client.unregisterMethod("oldMethod");
```

---

#### `call<T>(targetService: string, method: string, params: any, context?: IPCContext): Promise<T>`

Calls a method on another service.

**Parameters:**

- `targetService`: Name of the service to call
- `method`: Method name to execute
- `params`: Parameters to pass
- `context` (optional): Custom context (rarely needed)

**Returns:** Promise that resolves with the result

**Throws:** `IPCError` if call fails or times out

**Example:**

```typescript
// Simple call
const user = await client.call("user-service", "getUserById", {
  userId: "123",
});

// Typed call
interface User {
  id: string;
  name: string;
  email: string;
}

const user = await client.call("user-service", "getUserById", {
  userId: "123",
});

console.log(user.name); // TypeScript knows the type!
```

**Advanced Example:**

```typescript
try {
  const result = await client.call("payment-service", "processPayment", {
    orderId: "ORD-123",
    amount: 99.99,
  });

  console.log("Payment processed:", result);
} catch (error) {
  if (error.code === "TIMEOUT") {
    console.error("Payment service timeout");
  } else if (error.code === "SERVICE_NOT_FOUND") {
    console.error("Payment service offline");
  } else {
    console.error("Payment failed:", error);
  }
}
```

---

#### `getRegisteredMethods(): string[]`

Gets list of methods registered by this client.

**Returns:** Array of method names

**Example:**

```typescript
const methods = client.getRegisteredMethods();
console.log("Available methods:", methods);
// Output: ['getUserById', 'createUser', 'updateUser']
```

---

#### `isConnected(): boolean`

Checks if client is connected to the Gateway.

**Returns:** true if connected and registered, false otherwise

**Example:**

```typescript
if (client.isConnected()) {
  console.log("Ready to make calls");
} else {
  console.log("Not connected to Gateway");
}
```

---

#### `getStatus(): object`

Gets client status and statistics.

**Returns:** Status object

**Example:**

```typescript
const status = client.getStatus();
console.log(status);
// Output:
// {
//   connected: true,
//   registered: true,
//   serviceName: 'order-service',
//   pendingRequests: 3,
//   registeredMethods: 5
// }
```

---

## ⚙️ Configuration

### IPCClientConfig Interface

```typescript
interface IPCClientConfig {
  serviceName: string; // Required: Unique service name
  gatewayPath: string; // Gateway socket path
  autoReconnect?: boolean; // Auto-reconnect on disconnect
  reconnectDelay?: number; // Reconnect delay (ms)
  timeout?: number; // Request timeout (ms)
  heartbeatInterval?: number; // Heartbeat interval (ms)
  debug?: boolean; // Enable debug logging
  // I will implement message pack later
  //   serializer?: string; // Serialization format
  //   poolSize?: number; // Connection pool size
}
```

### Configuration Options

| Option              | Type    | Default                 | Description                           |
| ------------------- | ------- | ----------------------- | ------------------------------------- |
| `serviceName`       | string  | _required_              | Unique name for this service          |
| `gatewayPath`       | string  | `/tmp/bro-gateway.sock` | Gateway socket path                   |
| `autoReconnect`     | boolean | `true`                  | Automatically reconnect on disconnect |
| `reconnectDelay`    | number  | `5000`                  | Initial reconnect delay (ms)          |
| `timeout`           | number  | `30000`                 | Request timeout (ms)                  |
| `heartbeatInterval` | number  | `30000`                 | Heartbeat interval (ms)               |
| `debug`             | boolean | `false`                 | Enable debug logging                  |

<!-- Not implemented now will implement it later -->
<!-- | `serializer`        | string  | `'json'`                   | `'json'`, `'fast-json'`, or `'msgpack'` |
| `poolSize`          | number  | `1`                        | Number of connections (advanced)        | -->

### Configuration Examples

#### Development (Verbose)

```typescript
const client = new IPCClient({
  serviceName: "order-service",
  gatewayPath: "/tmp/dev-gateway.sock",
  debug: true,
  timeout: 10000, // Shorter timeout for faster feedback
});
```

#### Production (Optimized)

```typescript
const client = new IPCClient({
  serviceName: "order-service",
  gatewayPath: "/var/run/bro-gateway.sock",
  debug: false,
  //   serializer: 'msgpack', // Faster
  autoReconnect: true,
  timeout: 60000, // Longer timeout
});
```

#### High Throughput

```typescript
const client = new IPCClient({
  serviceName: "order-service",
  gatewayPath: "/tmp/bro-gateway.sock",
  debug: false,
  // I will implement this later pooling and msgpack
  //   serializer: 'msgpack',
  //   poolSize: 4, // 4 connections = higher throughput
});
```

## 🎪 Events

The IPC Client is an EventEmitter and emits the following events:

### `connected`

Emitted when successfully connected to Gateway.

**Example:**

```typescript
client.on("connected", () => {
  console.log("Connected to Gateway!");
});
```

---

### `disconnected`

Emitted when disconnected from Gateway.

**Example:**

```typescript
client.on("disconnected", () => {
  console.warn("Disconnected from Gateway");
  // Maybe notify admin or trigger alert
});
```

---

### `registered`

Emitted when registration is acknowledged by Gateway.

**Example:**

```typescript
client.on("registered", () => {
  console.log("Service registered with Gateway");
});
```

---

### `method-executed`

Emitted when a method is executed (called by another service).

**Payload:**

```typescript
{
  method: string;
  requestId: string;
  success: boolean;
  error?: string;
}
```

**Example:**

```typescript
client.on("method-executed", (data) => {
  console.log(
    `Method executed: ${data.method} [${data.success ? "success" : "failed"}]`
  );

  // Track metrics
  if (data.success) {
    metrics.increment(`methods.${data.method}.success`);
  } else {
    metrics.increment(`methods.${data.method}.error`);
  }
});
```

---

### `response-received`

Emitted when a response is received for a call.

**Payload:**

```typescript
{
  requestId: string;
  success: boolean;
  error?: string;
}
```

**Example:**

```typescript
client.on("response-received", (data) => {
  console.log(`Response received: ${data.requestId} [${data.success}]`);
});
```

---

### `error`

Emitted when an error occurs.

**Payload:**

```typescript
Error;
```

**Example:**

```typescript
client.on("error", (error) => {
  console.error("IPC Client error:", error);
});
```

---

### `gateway-error`

Emitted when Gateway sends an error message.

**Payload:**

```typescript
{
  message: string;
  code: string;
  stack?: string;
}
```

**Example:**

```typescript
client.on("gateway-error", (error) => {
  console.error("Gateway error:", error.message);
});
```

---

### `log`

Emitted for all log messages.

**Payload:**

```typescript
{
  serviceName: string;
  message: string;
  data?: any;
  timestamp: number;
}
```

**Example:**

```typescript
client.on("log", (logData) => {
  // Send to external logging
  logger.info(logData.message, logData.data);
});
```

## Examples

### Example 1: Simple Service

```typescript
import { IPCClient } from "./ipc/core/ipc-client";

async function startService() {
  const client = new IPCClient({
    serviceName: "user-service",
    gatewayPath: "/tmp/bro-gateway.sock",
    debug: true,
  });

  // Register method
  client.registerMethod("getUserById", async (params, context) => {
    console.log(`Getting user: ${params.userId}`);
    console.log(`Called by: ${context.chain[context.chain.length - 2]}`);

    // Simulate database lookup
    return {
      id: params.userId,
      name: "Nirikshan Bhusal",
      email: "nirikshan@nirikshan.com",
    };
  });

  // Connect
  await client.connect();
  console.log("User service ready!");

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    await client.disconnect();
    process.exit(0);
  });
}

startService();
```

---

### Example 2: Service with Nested Calls

```typescript
import { IPCClient } from "./ipc/core/ipc-client";

async function startOrderService() {
  const client = new IPCClient({
    serviceName: "order-service",
    gatewayPath: "/tmp/bro-gateway.sock",
  });

  // Register method that calls other services
  client.registerMethod("getOrderDetails", async (params, context) => {
    console.log(`[Depth ${context.depth}] Getting order: ${params.orderId}`);

    // Get order from database
    const order = {
      id: params.orderId,
      userId: "123",
      items: ["item1", "item2"],
      total: 99.99,
    };

    // Call User Service to get user info (nested call!)
    const user = await client.call("user-service", "getUserById", {
      userId: order.userId,
    });

    // Call Inventory Service to check stock
    const inventory = await client.call("inventory-service", "checkStock", {
      items: order.items,
    });

    return {
      order,
      user,
      inventory,
    };
  });

  await client.connect();
  console.log("Order service ready!");
}

startOrderService();
```

---

### Example 3: Service with Error Handling

```typescript
import { IPCClient } from "./ipc/core/ipc-client";

async function startPaymentService() {
  const client = new IPCClient({
    serviceName: "payment-service",
    gatewayPath: "/tmp/bro-gateway.sock",
    timeout: 60000, // Longer timeout for payment processing
  });

  client.registerMethod("processPayment", async (params, context) => {
    try {
      // Validate user exists
      const user = await client.call("user-service", "getUserById", {
        userId: params.userId,
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Validate order exists
      const order = await client.call("order-service", "getOrderById", {
        orderId: params.orderId,
      });

      if (!order) {
        throw new Error("Order not found");
      }

      // Process payment (simulate)
      console.log(`Processing payment: $${params.amount}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      return {
        success: true,
        transactionId: `TXN-${Date.now()}`,
        amount: params.amount,
      };
    } catch (error) {
      console.error("Payment processing failed:", error);

      // Return structured error
      return {
        success: false,
        error: error.message,
      };
    }
  });

  await client.connect();
  console.log("Payment service ready!");
}

startPaymentService();
```

---

### Example 4: Service with Metrics

```typescript
import { IPCClient } from "./ipc/core/ipc-client";
import { StatsD } from "hot-shots";

const statsd = new StatsD();

async function startService() {
  const client = new IPCClient({
    serviceName: "analytics-service",
    gatewayPath: "/tmp/bro-gateway.sock",
  });

  // Track method execution
  client.on("method-executed", (data) => {
    const tags = { method: data.method, success: data.success };
    statsd.increment("ipc.methods.executed", tags);
  });

  // Track outgoing calls
  client.registerMethod("trackEvent", async (params, context) => {
    const start = Date.now();

    try {
      // Store event
      console.log("Tracking event:", params.event);

      // Maybe call another service
      if (params.userId) {
        await client.call("user-service", "updateActivity", {
          userId: params.userId,
          activity: params.event,
        });
      }

      const duration = Date.now() - start;
      statsd.timing("ipc.methods.trackEvent.duration", duration);

      return { success: true };
    } catch (error) {
      statsd.increment("ipc.methods.trackEvent.error");
      throw error;
    }
  });

  await client.connect();
}

startService();
```

---

### Example 5: Service with Auto-Retry

```typescript
import { IPCClient } from "./ipc/core/ipc-client";

async function callWithRetry(
  client: IPCClient,
  service: string,
  method: string,
  params: any,
  maxRetries: number = 3
): Promise {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }

      return await client.call(service, method, params);
    } catch (error) {
      lastError = error;

      // Don't retry on certain errors
      if (
        error.code === "METHOD_NOT_FOUND" ||
        error.code === "SERVICE_NOT_FOUND"
      ) {
        throw error;
      }

      console.warn(`Call failed (attempt ${attempt + 1}):`, error.message);
    }
  }

  throw lastError;
}

// Usage
const client = new IPCClient({
  serviceName: "order-service",
  gatewayPath: "/tmp/bro-gateway.sock",
});

await client.connect();

// Call with automatic retry
const result = await callWithRetry(
  client,
  "flaky-service",
  "getData",
  { id: "123" },
  3 // Max 3 retries
);
```

---

## Best Practices

### 1. Always Use Unique Service Names

```typescript
//   GOOD - Unique names
new IPCClient({ serviceName: "order-service" });
new IPCClient({ serviceName: "user-service" });

// ❌ BAD - Duplicate names
new IPCClient({ serviceName: "service" }); // Too generic
new IPCClient({ serviceName: "service" }); // Conflict!
```

### 2. Register Methods Before Connecting

```typescript
//   GOOD
client.registerMethod("getUser", handler);
client.registerMethod("createUser", handler);
await client.connect(); // Methods are sent during registration

// ❌ BAD
await client.connect();
client.registerMethod("getUser", handler); // Too late!
```

### 3. Handle Connection Errors

```typescript
//   GOOD
try {
  await client.connect();
  console.log("Connected!");
} catch (error) {
  console.error("Failed to connect:", error);
  process.exit(1);
}

// ❌ BAD
await client.connect(); // Unhandled promise rejection!
```

### 4. Implement Graceful Shutdown

```typescript
//   GOOD
process.on("SIGTERM", async () => {
  await client.disconnect();
  process.exit(0);
});

// ❌ BAD
process.on("SIGTERM", () => {
  process.exit(0); // Socket not closed!
});
```

### 5. Use TypeScript Generics

```typescript
//   GOOD - Type-safe
interface User {
  id: string;
  name: string;
}

const user = await client.call("user-service", "getUser", { id: "123" });
console.log(user.name); // TypeScript knows the type!

// ❌ BAD - No type safety
const user = await client.call("user-service", "getUser", { id: "123" });
console.log(user.name); // Could be undefined!
```

### 6. Disable Debug in Production

```typescript
// Development
new IPCClient({
  serviceName: "order-service",
  debug: true, //   OK in dev
});

// Production
new IPCClient({
  serviceName: "order-service",
  debug: false, //   REQUIRED for performance
});
```

### 7. Set Appropriate Timeouts

```typescript
// Fast operations
new IPCClient({
  serviceName: "cache-service",
  timeout: 5000, // 5 seconds
});

// Slow operations
new IPCClient({
  serviceName: "report-service",
  timeout: 120000, // 2 minutes
});
```

---

## 🐛 Troubleshooting

### Problem: "Not connected to Gateway"

**Cause:** Forgot to call `connect()` or connection failed

**Solution:**

```typescript
// Always check connection status
if (!client.isConnected()) {
  console.error("Not connected!");
  await client.connect();
}

await client.call("user-service", "getUser", {});
```

---

### Problem: "Service not found"

**Cause:** Target service not connected or wrong name

**Solution:**

```typescript
// Check service name is correct
await client.call("user-service", "getUser", {}); //   Correct

await client.call("userservice", "getUser", {}); // ❌ Wrong name
```

---

### Problem: "Method not found"

**Cause:** Method not registered on target service

**Solution:**

```typescript
// Check method name and ensure it's registered
client.registerMethod("getUserById", handler); //   Registered

await client.call("user-service", "getUserById", {}); //   Correct
await client.call("user-service", "getUser", {}); // ❌ Wrong name
```

---

### Problem: "Request timeout"

**Cause:** Target service too slow or not responding

**Solution:**

```typescript
// Increase timeout for slow operations
const client = new IPCClient({
  serviceName: "order-service",
  timeout: 60000, // 60 seconds
});

// Or handle timeout errors
try {
  await client.call("slow-service", "heavyOperation", {});
} catch (error) {
  if (error.code === "TIMEOUT") {
    console.error("Operation timed out");
  }
}
```

---

### Problem: Connection keeps dropping

**Cause:** Network issues or Gateway restart

**Solution:**

```typescript
// Enable auto-reconnect
const client = new IPCClient({
  serviceName: "order-service",
  autoReconnect: true, //   Enabled
  reconnectDelay: 5000,
});

// Listen to reconnection events
client.on("disconnected", () => {
  console.warn("Lost connection to Gateway");
});

client.on("connected", () => {
  console.log("Reconnected to Gateway!");
});
```

---

## 📊 Pending Works

1. **Use MessagePack** serialization (40-60% faster)
2. **Enable connection pooling** for high throughput
3. Build the way to **Batch multiple calls**
4. **Cache frequently-accessed data**

---

## 📝 License

MIT

---

## 👥 Contributing

Contributions welcome! Please read readme.md first.
