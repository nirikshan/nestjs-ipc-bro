# IPC Bro - NestJS Integration Guide

This integration provides decorators, modules, and services for seamless inter-service communication.

---

## Quick Start

### Gateway Setup (without config)

```typescript
// main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { IPCServerModule } from "nestjs-ipc";

async function bootstrap() {
  // Start Gateway
  await IPCServerModule.boot({
    socketPath: "/tmp/bro-gateway.sock",
    debug: true,
  });

  // Start NestJS app
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

bootstrap();
```

### Service Setup (with config)

```typescript
SERVICE_NAME=order-service
IPC_GATEWAY_PATH=/tmp/gateway.sock
DEBUG=false
IPC_SERIALIZER=msgpack
IPC_POOL_SIZE=4
IPC_UPLOAD_DIR=/tmp/ipc-uploads
PORT=3001

// app.module.ts
import { Module } from '@nestjs/common';
import { IPCClientModule } from 'nestjs-ipc';
import { OrderController } from './order.controller';

@Module({
  imports: [
    IPCClientModule.boot(), // ← ONE LINE!
  ],
  controllers: [OrderController],
})
export class AppModule {}

// order.controller.ts
import { Controller } from '@nestjs/common';
import { IPCMethod  , IPCClientService , IPCContext } from 'nestjs-ipc';

@Controller('orders')
export class OrderController {
  constructor(private readonly ipc: IPCClientService) {}

  @IPCMethod() // ← Mark as IPC-callable
  async getOrderList(params: { userId: string }, context: IPCContext) {
    // Call another service
    const user = await this.ipc.call('user-service', 'getUserById', {
      userId: params.userId,
    });

    return { orders: [...], user };
  }
}
```

**Done! Your service is now IPC-enabled!** 🎉

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Gateway (main.ts)                        │
│                  IPCServerModule.boot()                     │
│                /tmp/bro-gateway.sock                     │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐  ┌────────▼─────┐  ┌────────▼─────┐
│ Order Service│  │ User Service │  │ Cart Service │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ AppModule    │  │ AppModule    │  │ AppModule    │
│ ├─IPCClient  │  │ ├─IPCClient  │  │ ├─IPCClient  │
│ │ Module     │  │ │ Module     │  │ │ Module     │
│ └──boot()    │  │ └──boot()    │  │ └──boot()    │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ Controllers  │  │ Controllers  │  │ Controllers  │
│ @IPCMethod() │  │ @IPCMethod() │  │ @IPCMethod() │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 📦 Modules

---

## IPCServerModule (Gateway)

Used **ONLY** in the Gateway application. Not needed in individual services.

### Static Methods

#### `boot(config?, logger?): Promise<IPCServer>`

**Simplest way to start the Gateway.**

```typescript
// main.ts
await IPCServerModule.boot({
  socketPath: "/tmp/bro-gateway.sock",
  debug: true,
  heartbeatInterval: 30000,
  timeout: 30000,
});
```

**Parameters:**

- `config` (optional): Server configuration
- `logger` (optional): Custom log function

**Returns:** IPCServer instance

**What it does:**

1. Creates IPCServer
2. Sets up event listeners
3. Starts server
4. Logs important events
5. Returns server instance for graceful shutdown

---

#### `register(config): DynamicModule`

**For advanced use cases with NestJS DI.**

```typescript
// app.module.ts (Gateway only)
@Module({
  imports: [
    IPCServerModule.register({
      socketPath: "/tmp/bro-gateway.sock",
      debug: true,
    }),
  ],
  controllers: [AdminController],
})
export class AppModule {}

// admin.controller.ts
@Controller("admin")
export class AdminController {
  constructor(
    @Inject(IPC_SERVER_TOKEN)
    private readonly server: IPCServer
  ) {}

  @Get("services")
  getServices() {
    return this.server.getConnectedServices();
  }
}
```

**When to use:**

- Need to inject IPCServer into controllers/services
- Want to use Gateway features in your API

---

#### `registerAsync(options): DynamicModule`

**For dynamic configuration with ConfigService.**

```typescript
// app.module.ts (Gateway only)
@Module({
  imports: [
    ConfigModule.forRoot(),
    IPCServerModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        socketPath: config.get("IPC_SOCKET_PATH"),
        debug: config.get("DEBUG") === "true",
      }),
    }),
  ],
})
export class AppModule {}
```

---

#### `shutdown(): Promise<void>`

**Stop the Gateway.**

```typescript
await IPCServerModule.shutdown();
```

---

#### `getServer(): IPCServer | null`

**Get server instance.**

```typescript
const server = IPCServerModule.getServer();
if (server) {
  console.log(server.getStatus());
}
```

---

#### `getStatus(): object`

**Get Gateway status.**

```typescript
const status = IPCServerModule.getStatus();
// {
//   running: true,
//   connectedServices: 3,
//   services: ['order-service', 'user-service', 'cart-service']
// }
```

---

## IPCClientModule (Services)

Used in **EVERY microservice** that needs IPC communication.

### Static Methods

#### `boot(configOverride?): DynamicModule`

**Simplest way - reads from environment variables.** ⭐ **RECOMMENDED**

```typescript
// .env
SERVICE_NAME = order - service;
IPC_GATEWAY_PATH = /tmp/bdoorx - gateway.sock;
DEBUG = true;

// app.module.ts
@Module({
  imports: [
    IPCClientModule.boot(), // ← Reads from env
  ],
  controllers: [OrderController],
})
export class AppModule {}
```

**With override:**

```typescript
@Module({
  imports: [
    IPCClientModule.boot({
      serviceName: "order-service", // Override env
      debug: false,
    }),
  ],
})
export class AppModule {}
```

**Required environment variables:**

- `SERVICE_NAME` - Unique service name

**Optional environment variables:**

- `IPC_GATEWAY_PATH` - Gateway socket path (default: `/tmp/bro-gateway.sock`)
- `DEBUG` - Enable debug logging (default: `false`)

---

#### `register(config): DynamicModule`

**Explicit configuration.**

```typescript
// app.module.ts
@Module({
  imports: [
    IPCClientModule.register({
      serviceName: "webhook-service",
      gatewayPath: "/tmp/bro-gateway.sock",
      debug: false, // ← Disable in production
      serializer: "msgpack", // ← MessagePack for performance
      poolSize: 4, // ← Connection pool (4 connections)
      timeout: 30000, // ← 30 second timeout
      heartbeatInterval: 30000, // ← 30 second heartbeat
      autoReconnect: true, // ← Auto-reconnect on disconnect
      reconnectDelay: 5000, // ← 5 second reconnect delay
    }),
  ],
  controllers: [OrderController],
})
export class AppModule {}
```

---

#### `registerAsync(options): DynamicModule`

**Dynamic configuration with ConfigService.**

```typescript
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot(),
    IPCClientModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceName: config.get("SERVICE_NAME"),
        gatewayPath: config.get("IPC_GATEWAY_PATH"),
        debug: config.get("DEBUG") === "true",
        timeout: parseInt(config.get("IPC_TIMEOUT", "30000")),
      }),
    }),
  ],
})
export class AppModule {}
```

---

### Lifecycle Hooks

**The module automatically:**

1. ✅ Discovers all `@IPCMethod()` decorated methods
2. ✅ Registers them with the Gateway
3. ✅ Connects to Gateway
4. ✅ Handles reconnection
5. ✅ Disconnects gracefully on shutdown

**You don't need to do anything!**

---

## 🛠️ Services

---

## IPCClientService

Injectable service for making IPC calls to other services.

### Injection

```typescript
import { Injectable } from "@nestjs/common";
import { IPCClientService } from "nestjs-ipc";

@Injectable()
export class OrderService {
  constructor(private readonly ipc: IPCClientService) {}

  async doSomething() {
    const result = await this.ipc.call("user-service", "getUser", {});
    return result;
  }
}
```

### Methods

#### `call<T>(service, method, params, options?): Promise<T>`

**Call another service's method.**

```typescript
// Basic call
const user = await this.ipc.call("user-service", "getUserById", {
  userId: "123",
});

// Typed call
interface User {
  id: string;
  name: string;
  email: string;
}

const user = await this.ipc.call<User>("user-service", "getUserById", {
  userId: "123",
});

// With options
const user = await this.ipc.call(
  "user-service",
  "getUserById",
  { userId: "123" },
  {
    timeout: 10000,
    debug: true,
    cache: true,
    cacheTTL: 60000,
  }
);
```

**Parameters:**

- `service` (string): Target service name
- `method` (string): Method name
- `params` (any): Parameters object
- `options` (optional): Call options

**Options:**

- `timeout` (number): Override timeout for this call
- `debug` (boolean): Enable debug logging
- `cache` (boolean): Enable caching
- `cacheTTL` (number): Cache time-to-live (ms)

---

#### `callAll<T>(calls): Promise<T[]>`

**Call multiple services in parallel.**

```typescript
const [user, orders, cart] = await this.ipc.callAll([
  {
    service: "user-service",
    method: "getUserById",
    params: { userId: "123" },
  },
  {
    service: "order-service",
    method: "getOrders",
    params: { userId: "123" },
  },
  {
    service: "cart-service",
    method: "getCart",
    params: { userId: "123" },
  },
]);
```

**Throws if ANY call fails.**

---

#### `callAllSettled(calls): Promise<PromiseSettledResult<any>[]>`

**Call multiple services with error tolerance.**

```typescript
const results = await this.ipc.callAllSettled([
  { service: "user-service", method: "getUser", params: { id: "123" } },
  { service: "order-service", method: "getOrders", params: { userId: "123" } },
  { service: "cart-service", method: "getCart", params: { userId: "123" } },
]);

// Check results
results.forEach((result, index) => {
  if (result.status === "fulfilled") {
    console.log("Success:", result.value);
  } else {
    console.log("Failed:", result.reason);
  }
});
```

**Never throws - returns all results.**

---

#### `callWithRetry<T>(service, method, params, options?): Promise<T>`

**Auto-retry on failure.**

```typescript
const result = await this.ipc.callWithRetry(
  "flaky-service",
  "getData",
  { id: "123" },
  {
    maxRetries: 3,
    retryDelay: 1000, // 1s, 2s, 4s (exponential backoff)
  }
);
```

**Retries on transient errors, not on:**

- `METHOD_NOT_FOUND`
- `SERVICE_NOT_FOUND`
- `INVALID_MESSAGE`

---

#### `callWithTimeout<T>(service, method, params, timeoutMs): Promise<T>`

**Simple timeout override.**

```typescript
const result = await this.ipc.callWithTimeout(
  "slow-service",
  "heavyOperation",
  { data: "..." },
  5000 // 5 second timeout
);
```

---

#### `isConnected(): boolean`

**Check connection status.**

```typescript
if (this.ipc.isConnected()) {
  console.log("Ready to make calls");
}
```

---

#### `getStatus(): object`

**Get client status.**

```typescript
const status = this.ipc.getStatus();
// {
//   connected: true,
//   registered: true,
//   serviceName: 'order-service',
//   pendingRequests: 2,
//   registeredMethods: 5
// }
```

---

#### `clearCache(pattern?): void`

**Clear method call cache.**

```typescript
// Clear all cache
this.ipc.clearCache();

// Clear specific pattern
this.ipc.clearCache("user-service");
```

---

## IPCServerService

Injectable service for accessing Gateway features (Gateway only).

```typescript
// Gateway's admin.controller.ts
import { Controller, Get } from "@nestjs/common";
import { IPCServerService } from "nestjs-ipc";

@Controller("admin")
export class AdminController {
  constructor(private readonly server: IPCServerService) {}

  @Get("services")
  getServices() {
    return this.server.getConnectedServices();
  }

  @Get("status")
  getStatus() {
    return this.server.getStatus();
  }
}
```

---

## 🎨 Decorators

---

## @IPCMethod()

**Mark a method as callable by other services.**

### Basic Usage

```typescript
@IPCMethod()
async getUserById(params: { userId: string }, context: IPCContext) {
  return {
    id: params.userId,
    name: 'Nirikshan Bhusal',
    email: 'nirikshan@nirikshan.com',
  };
}
```

**Other services can call:**

```typescript
await this.ipc.call("user-service", "getUserById", { userId: "123" });
```

---

### With Custom Name

```typescript
@IPCMethod('get-user-by-id')
async getUserById(params: { userId: string }, context: IPCContext) {
  return { ... };
}
```

**Called as:**

```typescript
await this.ipc.call("user-service", "get-user-by-id", { userId: "123" });
```

---

### With Options

```typescript
@IPCMethod({
  name: 'getUserById',
  description: 'Retrieve user information by user ID',
  timeout: 5000,
})
async getUserById(params: { userId: string }, context: IPCContext) {
  return { ... };
}
```

---

### Method Signature

```typescript
@IPCMethod()
async methodName(
  params: any,           // Parameters from caller
  context: IPCContext    // IPC context (automatic)
): Promise<any> {
  // Your logic here
  return result;
}
```

**Parameters:**

- `params`: Object with method parameters
- `context`: IPC context with call chain, depth, deadline

**Must return:** Promise with result

---

### In Services (Not Just Controllers)

```typescript
@Injectable()
export class UserService {
  @IPCMethod()
  async getUserById(params: { userId: string }, context: IPCContext) {
    return { ... };
  }
}
```

---

### Access Context

```typescript
@IPCMethod()
async getOrderList(params: { userId: string }, context: IPCContext) {
  console.log('Root request ID:', context.root);
  console.log('Call chain:', context.chain.join(' → '));
  console.log('Current depth:', context.depth);
  console.log('Deadline:', new Date(context.deadline));

  return { ... };
}
```

---

### Nested Calls (Automatic Context Propagation)

```typescript
@IPCMethod()
async getOrderDetails(params: { orderId: string }, context: IPCContext) {
  // Context is automatically passed to nested calls!
  const user = await this.ipc.call('user-service', 'getUserById', {
    userId: '123',
  });

  // No need to pass context manually - it's automatic!
  return { order: {...}, user };
}
```

---

## @IPCValidate()

**Add parameter validation to IPC methods.**

```typescript
@IPCMethod()
@IPCValidate((params) => {
  return params.userId && typeof params.userId === 'string';
})
async getUserById(params: { userId: string }, context: IPCContext) {
  // This runs only if validation passes
  return { ... };
}
```

**With async validation:**

```typescript
@IPCMethod()
@IPCValidate(async (params) => {
  // Can do async checks
  const exists = await database.userExists(params.userId);
  return exists;
})
async getUserById(params: { userId: string }, context: IPCContext) {
  return { ... };
}
```

**Validation failure:**

```typescript
// Throws: "Validation failed for method: getUserById"
```

---

## @IPCTimeout()

**Set custom timeout for a specific method.**

```typescript
@IPCMethod()
@IPCTimeout(60000) // 60 seconds
async generateReport(params: { year: number }, context: IPCContext) {
  // This method can take up to 60 seconds
  return { report: '...' };
}
```

**Useful for:**

- Long-running operations
- Report generation
- Data processing
- External API calls

---

## @IPCDescription()

**Add documentation to IPC methods.**

```typescript
@IPCMethod()
@IPCDescription('Retrieve user information including profile, preferences, and recent activity')
async getUserProfile(params: { userId: string }, context: IPCContext) {
  return { ... };
}
```

**Used for:**

- Auto-generated documentation
- IDE tooltips
- API discovery

---

## @IPCParam()

**Extract specific parameters (advanced).**

```typescript
@IPCMethod()
async getUser(
  @IPCParam('userId') userId: string,
  @IPCParam('includeOrders') includeOrders: boolean,
  @IPCCallContext() context: IPCContext
) {
  console.log('User ID:', userId);
  console.log('Include orders:', includeOrders);

  return { ... };
}
```

**Called as:**

```typescript
await this.ipc.call("user-service", "getUser", {
  userId: "123",
  includeOrders: true,
});
```

---

## @IPCCallContext()

**Extract IPC context as parameter (advanced).**

```typescript
@IPCMethod()
async getUser(
  params: any,
  @IPCCallContext() context: IPCContext
) {
  console.log('Call chain:', context.chain);
  return { ... };
}
```

**Note:** Context is already passed as second parameter, this is just an alternative syntax.

---

## 💡 Complete Examples

---

### Example 1: Simple Service

```typescript
// user.service.ts
import { Injectable } from "@nestjs/common";
import { IPCMethod, IPCContext } from "nestjs-ipc";

@Injectable()
export class UserService {
  @IPCMethod()
  async getUserById(params: { userId: string }, context: IPCContext) {
    return {
      id: params.userId,
      name: "Nirikshan Bhusal",
      email: "nirikshan@nirikshan.com",
    };
  }

  @IPCMethod()
  async createUser(
    params: { name: string; email: string },
    context: IPCContext
  ) {
    return {
      id: Date.now().toString(),
      name: params.name,
      email: params.email,
    };
  }
}

// app.module.ts
@Module({
  imports: [IPCClientModule.boot()],
  providers: [UserService],
})
export class AppModule {}
```

---

### Example 2: Service with Nested Calls

```typescript
// order.controller.ts
import { Controller } from "@nestjs/common";
import { IPCClientService, IPCMethod, IPCContext } from "nestjs-ipc";

@Controller("orders")
export class OrderController {
  constructor(private readonly ipc: IPCClientService) {}

  @IPCMethod()
  async getOrderDetails(params: { orderId: string }, context: IPCContext) {
    console.log(`[Depth ${context.depth}] Getting order: ${params.orderId}`);

    // Get order
    const order = {
      id: params.orderId,
      userId: "123",
      items: ["item1", "item2"],
      total: 99.99,
    };

    // Call User Service (nested call)
    const user = await this.ipc.call("user-service", "getUserById", {
      userId: order.userId,
    });

    // Call Inventory Service (another nested call)
    const inventory = await this.ipc.call("inventory-service", "checkStock", {
      items: order.items,
    });

    return { order, user, inventory };
  }
}
```

---

### Example 3: Service with Validation

```typescript
import { Controller } from "@nestjs/common";
import {
  IPCMethod,
  IPCValidate,
  IPCTimeout,
  IPCClientService,
  IPCContext,
} from "nestjs-ipc";

@Controller("orders")
export class OrderController {
  constructor(private readonly ipc: IPCClientService) {}

  @IPCMethod()
  @IPCValidate((params) => {
    return params.userId && params.items && params.items.length > 0;
  })
  @IPCTimeout(15000)
  async createOrder(
    params: { userId: string; items: any[] },
    context: IPCContext
  ) {
    // Validate user exists
    const user = await this.ipc.call("user-service", "getUserById", {
      userId: params.userId,
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check inventory
    const stockCheck = await this.ipc.call("inventory-service", "checkStock", {
      items: params.items,
    });

    if (!stockCheck.available) {
      throw new Error("Items not in stock");
    }

    // Create order
    return {
      id: Date.now().toString(),
      userId: params.userId,
      items: params.items,
      status: "created",
    };
  }
}
```

---

### Example 4: Service with Parallel Calls

```typescript
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly ipc: IPCClientService) {}

  @IPCMethod()
  async getDashboard(params: { userId: string }, context: IPCContext) {
    // Call 3 services in parallel
    const [user, orders, cart] = await this.ipc.callAll([
      {
        service: "user-service",
        method: "getUserById",
        params: { userId: params.userId },
      },
      {
        service: "order-service",
        method: "getOrders",
        params: { userId: params.userId },
      },
      {
        service: "cart-service",
        method: "getCart",
        params: { userId: params.userId },
      },
    ]);

    return { user, orders, cart };
  }
}
```

---

### Example 5: Service with Caching

```typescript
@Controller("users")
export class UserController {
  constructor(private readonly ipc: IPCClientService) {}

  @IPCMethod()
  async getUserProfile(params: { userId: string }, context: IPCContext) {
    // Cache user data for 60 seconds
    const user = await this.ipc.call(
      "user-service",
      "getUserById",
      { userId: params.userId },
      { cache: true, cacheTTL: 60000 }
    );

    // Don't cache orders (real-time data)
    const orders = await this.ipc.call("order-service", "getOrders", {
      userId: params.userId,
    });

    return { user, orders };
  }
}
```

---

### Example 6: Gateway with Admin API

```typescript
// Gateway's main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { IPCServerModule } from "nestjs-ipc";

async function bootstrap() {
  // Start Gateway
  const server = await IPCServerModule.boot({
    socketPath: "/tmp/bro-gateway.sock",
    debug: true,
  });

  // Start NestJS app with admin API
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);

  console.log("Gateway running with admin API on http://localhost:3000");
}

bootstrap();

// admin.controller.ts
import { Controller, Get } from "@nestjs/common";
import { IPCServerModule } from "nestjs-ipc";

@Controller("admin")
export class AdminController {
  @Get("status")
  getStatus() {
    return IPCServerModule.getStatus();
  }

  @Get("services")
  getServices() {
    const server = IPCServerModule.getServer();

    if (!server) {
      return { services: [] };
    }

    const serviceNames = server.getConnectedServices();

    return {
      count: serviceNames.length,
      services: serviceNames.map((name) => {
        const service = server.getService(name);
        return {
          name: service.name,
          methods: service.methods,
          connectedAt: new Date(service.connectedAt).toISOString(),
          lastHeartbeat: new Date(service.lastHeartbeat).toISOString(),
        };
      }),
    };
  }
}
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# Required for all services
SERVICE_NAME=order-service

# Optional
IPC_GATEWAY_PATH=/tmp/bro-gateway.sock
DEBUG=true
IPC_TIMEOUT=30000
IPC_HEARTBEAT_INTERVAL=30000
IPC_RECONNECT_DELAY=5000
```

### Configuration Object

```typescript
interface IPCClientConfig {
  serviceName: string; // Required: Unique service name
  gatewayPath: string; // Gateway socket path
  autoReconnect?: boolean; // Auto-reconnect (default: true)
  reconnectDelay?: number; // Reconnect delay ms (default: 5000)
  timeout?: number; // Request timeout ms (default: 30000)
  heartbeatInterval?: number; // Heartbeat ms (default: 30000)
  debug?: boolean; // Debug logging (default: false)
  serializer?: string; // 'json' | 'msgpack' (default: 'json')
  poolSize?: number; // Connection pool (default: 1)
}
```

### Development Config

```typescript
IPCClientModule.register({
  serviceName: "order-service",
  gatewayPath: "/tmp/dev-gateway.sock",
  debug: true,
  timeout: 10000,
});
```

### Production Config

```typescript
IPCClientModule.register({
  serviceName: "order-service",
  gatewayPath: "/var/run/bro-gateway.sock",
  debug: false,
  serializer: "msgpack", // Faster!
  timeout: 60000,
  autoReconnect: true,
});
```

---

## ✅ Best Practices

### 1. Use Environment Variables

```typescript
// ✅ GOOD - Flexible
IPCClientModule.boot(); // Reads from .env

// ❌ BAD - Hardcoded
IPCClientModule.register({
  serviceName: "order-service", // Hard to change
});
```

### 2. One Module Import Per Service

```typescript
// ✅ GOOD
@Module({
  imports: [IPCClientModule.boot()],
  controllers: [OrderController],
})

// ❌ BAD - Don't import multiple times
@Module({
  imports: [
    IPCClientModule.boot(),
    IPCClientModule.boot(), // Duplicate!
  ],
})
```

### 3. Use @IPCMethod() on Public Methods

```typescript
// ✅ GOOD
@IPCMethod()
async getUser() { } // Available to other services

async privateHelper() { } // Private, not exposed

// ❌ BAD - Don't expose internal methods
@IPCMethod()
async _internalMethod() { } // Should be private!
```

### 4. Always Type Your Calls

```typescript
// ✅ GOOD
interface User {
  id: string;
  name: string;
}

const user = await this.ipc.call<User>("user-service", "getUser", {});

// ❌ BAD - No type safety
const user = await this.ipc.call("user-service", "getUser", {});
```

### 5. Handle Errors Gracefully

```typescript
// ✅ GOOD
try {
  const user = await this.ipc.call("user-service", "getUser", {});
  return { success: true, user };
} catch (error) {
  console.error("Failed to get user:", error);
  return { success: false, error: error.message };
}

// ❌ BAD - Unhandled errors
const user = await this.ipc.call("user-service", "getUser", {});
```

### 6. Use Caching for Read-Heavy Operations

```typescript
// ✅ GOOD - Cache user profile
const user = await this.ipc.call(
  "user-service",
  "getUser",
  { id: "123" },
  { cache: true, cacheTTL: 60000 }
);

// ❌ BAD - Don't cache frequently changing data
const cart = await this.ipc.call(
  "cart-service",
  "getCart",
  { userId: "123" },
  { cache: true } // Cart changes often!
);
```

### 7. Use Parallel Calls When Possible

```typescript
// ✅ GOOD - Parallel (fast)
const [user, orders] = await this.ipc.callAll([
  { service: "user-service", method: "getUser", params: {} },
  { service: "order-service", method: "getOrders", params: {} },
]);

// ❌ BAD - Sequential (slow)
const user = await this.ipc.call("user-service", "getUser", {});
const orders = await this.ipc.call("order-service", "getOrders", {});
```

### 8. Disable Debug in Production

```typescript
// Development
IPCClientModule.boot(); // DEBUG=true in .env

// Production
IPCClientModule.boot(); // DEBUG=false in .env
```

---

## 🐛 Troubleshooting

### Problem: "SERVICE_NAME environment variable is required"

**Solution:**

```bash
# Add to .env
SERVICE_NAME=order-service
```

### Problem: Methods not discovered

**Solution:**

```typescript
// Make sure @IPCMethod() is on the method
@IPCMethod() // ← Don't forget!
async getUser() { }

// And controller/service is in providers/controllers array
@Module({
  controllers: [OrderController], // ← Must be listed here
  providers: [OrderService], // ← Or here
})
```

### Problem: "Not connected to Gateway"

**Solution:**

```typescript
// Check connection status
const status = this.ipc.getStatus();
console.log("Connected:", status.connected);

// Check Gateway is running
// Terminal 1: Start Gateway
await IPCServerModule.boot();

// Terminal 2: Start Service
// Will auto-connect
```

### Problem: "Service not found"

**Solution:**

```typescript
// Check service name spelling
await this.ipc.call('user-service', ...); // ✅ Correct
await this.ipc.call('userservice', ...); // ❌ Wrong

// Check if service is running
const status = IPCServerModule.getStatus();
console.log('Connected services:', status.services);
```

### Problem: "Method not found"

**Solution:**

```typescript
// Check method is decorated
@IPCMethod() // ← Must have this
async getUserById() { }

// Check method name spelling
await this.ipc.call('user-service', 'getUserById', {}); // ✅
await this.ipc.call('user-service', 'getUser', {}); // ❌
```

### Problem: TypeScript errors with decorators

**Solution:**

```typescript
// Enable decorators in tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true, // ← Required
    "emitDecoratorMetadata": true,  // ← Required
  }
}
```

---

## 📊 Performance Tips

1. **Disable debug mode** in production (10-15% faster)
2. **Use MessagePack** serialization (40-60% faster)
3. **Enable caching** for frequently accessed data (30-50% fewer calls)
4. **Use parallel calls** with `callAll()` (2-5x faster)
5. **Set appropriate timeouts** (don't wait unnecessarily)
6. **Use connection pooling** for high throughput

---

## 📝 Quick Reference Card

```typescript
// ═══════════════════════════════════════════════════════
// GATEWAY SETUP
// ═══════════════════════════════════════════════════════
// main.ts
await IPCServerModule.boot({ socketPath: '...', debug: true });

// ═══════════════════════════════════════════════════════
// SERVICE SETUP
// ═══════════════════════════════════════════════════════
// .env
SERVICE_NAME=order-service

// app.module.ts
@Module({ imports: [IPCClientModule.boot()] })

// ═══════════════════════════════════════════════════════
// DECORATORS
// ═══════════════════════════════════════════════════════
@IPCMethod()                                    // Expose method
@IPCMethod('custom-name')                       // Custom name
@IPCMethod({ name: '...', timeout: 5000 })    // With options
@IPCValidate((p) => p.id)                      // Validation
@IPCTimeout(60000)                             // Custom timeout
@IPCDescription('...')                          // Documentation

// ═══════════════════════════════════════════════════════
// MAKING CALLS
// ═══════════════════════════════════════════════════════
await this.ipc.call('service', 'method', {})                    // Basic
await this.ipc.call<User>('service', 'method', {})              // Typed
await this.ipc.callAll([...])                                   // Parallel
await this.ipc.callAllSettled([...])                            // Error-tolerant
await this.ipc.callWithRetry('service', 'method', {})           // Auto-retry
await this.ipc.callWithTimeout('service', 'method', {}, 5000)   // Timeout


this.ipc.isConnected()                         // Check connection
this.ipc.getStatus()                           // Get status
IPCServerModule.getStatus()                    // Gateway status
```

---

For questions or issues, check the github repo
