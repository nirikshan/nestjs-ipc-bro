/**
 * IPC Method Decorator
 *
 * This decorator marks a method as callable via IPC from other services.
 * The IPCClientModule automatically discovers these methods on startup
 * and registers them with the Gateway.
 *
 * Usage:
 *
 * @Controller('orders')
 * export class OrderController {
 *
 *   @IPCMethod()
 *   async getOrderList(params: { userId: string }, context: IPCContext) {
 *     return [...];
 *   }
 *
 *   @IPCMethod('custom-name')
 *   async someMethod(params, context) {
 *     return { ... };
 *   }
 * }
 */

import { SetMetadata } from "@nestjs/common";
import { IPCContext } from "ipc-bro";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Metadata key for storing IPC method information
 * Used by IPCClientModule to discover decorated methods
 */
export const IPC_METHOD_METADATA_KEY = "ipc:method";

// ============================================================================
// METADATA INTERFACE
// ============================================================================

/**
 * Metadata stored by @IPCMethod decorator
 */
export interface IPCMethodMetadata {
  /**
   * Name of the method as it will be registered
   * If not provided, uses the actual method name
   */
  name: string;

  /**
   * Optional description for documentation
   */
  description?: string;

  /**
   * Optional: Specify timeout for this method
   */
  timeout?: number;

  /**
   * Optional: Custom validation function
   */
  validator?: (params: any) => boolean | Promise<boolean>;

  /**
   * Optional: Additional custom metadata
   */
  metadata?: Record<string, any>;
}

// ============================================================================
// DECORATOR FACTORY
// ============================================================================

/**
 * @IPCMethod() Decorator
 *
 * Marks a method as callable via IPC
 *
 * Basic usage:
 * @IPCMethod()
 * async getUser(params: { userId: string }, context: IPCContext) {
 *   return { id: params.userId, name: 'John' };
 * }
 *
 * With custom name:
 * @IPCMethod('get-user-by-id')
 * async getUserById(params, context) {
 *   return { ... };
 * }
 *
 * With options:
 * @IPCMethod({
 *   name: 'getUserById',
 *   description: 'Get user by ID',
 *   timeout: 5000,
 * })
 * async getUser(params, context) {
 *   return { ... };
 * }
 *
 * @param nameOrOptions - Method name or full options object
 * @returns MethodDecorator
 */
export function IPCMethod(
  nameOrOptions?: string | Partial<IPCMethodMetadata>
): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    // Parse options
    const metadata = parseOptions(propertyKey, nameOrOptions);

    // Store metadata on the method
    Reflect.defineMetadata(
      IPC_METHOD_METADATA_KEY,
      metadata,
      target,
      propertyKey
    );

    // Optional: Wrap the original method for validation/logging
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // args[0] = params
      // args[1] = context

      // Optional: Run validator if provided
      if (metadata.validator && args[0]) {
        const isValid = await metadata.validator(args[0]);
        if (!isValid) {
          throw new Error(`Validation failed for method: ${metadata.name}`);
        }
      }

      // Call original method
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Parse decorator options
 *
 * @param propertyKey - Actual method name
 * @param nameOrOptions - Name string or options object
 * @returns Complete metadata object
 */
function parseOptions(
  propertyKey: string | symbol,
  nameOrOptions?: string | Partial<IPCMethodMetadata>
): IPCMethodMetadata {
  const methodName = String(propertyKey);

  // Case 1: No options provided
  if (!nameOrOptions) {
    return {
      name: methodName,
    };
  }

  // Case 2: String name provided
  if (typeof nameOrOptions === "string") {
    return {
      name: nameOrOptions,
    };
  }

  // Case 3: Options object provided
  return {
    name: nameOrOptions.name || methodName,
    description: nameOrOptions.description,
    timeout: nameOrOptions.timeout,
    validator: nameOrOptions.validator,
    metadata: nameOrOptions.metadata,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get IPC method metadata from a method
 *
 * Used by IPCClientModule to discover decorated methods
 *
 * @param target - Target object (prototype)
 * @param propertyKey - Method name
 * @returns Metadata or undefined
 */
export function getIPCMethodMetadata(
  target: any,
  propertyKey: string | symbol
): IPCMethodMetadata | undefined {
  return Reflect.getMetadata(IPC_METHOD_METADATA_KEY, target, propertyKey);
}

/**
 * Check if a method has @IPCMethod decorator
 *
 * @param target - Target object (prototype)
 * @param propertyKey - Method name
 * @returns true if decorated
 */
export function isIPCMethod(
  target: any,
  propertyKey: string | symbol
): boolean {
  return Reflect.hasMetadata(IPC_METHOD_METADATA_KEY, target, propertyKey);
}

/**
 * Get all IPC methods from a class
 *
 * @param target - Class or instance
 * @returns Array of method names
 */
export function getAllIPCMethods(target: any): string[] {
  const prototype = target.prototype || Object.getPrototypeOf(target);
  const methodNames: string[] = [];

  // Get all property names
  const properties = Object.getOwnPropertyNames(prototype);

  for (const propertyName of properties) {
    if (propertyName === "constructor") {
      continue;
    }

    if (isIPCMethod(prototype, propertyName)) {
      const metadata = getIPCMethodMetadata(prototype, propertyName);
      if (metadata) {
        methodNames.push(metadata.name);
      }
    }
  }

  return methodNames;
}

// ============================================================================
// ADDITIONAL DECORATORS
// ============================================================================

/**
 * @IPCValidate() Decorator
 *
 * Add validation to IPC method parameters
 *
 * Usage:
 * @IPCMethod()
 * @IPCValidate((params) => {
 *   return params.userId && typeof params.userId === 'string';
 * })
 * async getUser(params: { userId: string }, context) {
 *   return { ... };
 * }
 */
export function IPCValidate(
  validator: (params: any) => boolean | Promise<boolean>
): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const params = args[0];

      // Run validation
      const isValid = await validator(params);

      if (!isValid) {
        throw new Error(`Validation failed for method: ${String(propertyKey)}`);
      }

      // Call original method
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * @IPCTimeout() Decorator
 *
 * Set custom timeout for IPC method
 *
 * Usage:
 * @IPCMethod()
 * @IPCTimeout(5000)  // 5 second timeout
 * async slowMethod(params, context) {
 *   return { ... };
 * }
 */
export function IPCTimeout(timeoutMs: number): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    // Get existing metadata or create new
    const existingMetadata = getIPCMethodMetadata(target, propertyKey) || {
      name: String(propertyKey),
    };

    // Update timeout
    const updatedMetadata: IPCMethodMetadata = {
      ...existingMetadata,
      timeout: timeoutMs,
    };

    // Store updated metadata
    Reflect.defineMetadata(
      IPC_METHOD_METADATA_KEY,
      updatedMetadata,
      target,
      propertyKey
    );

    return descriptor;
  };
}

/**
 * @IPCDescription() Decorator
 *
 * Add description to IPC method (for documentation)
 *
 * Usage:
 * @IPCMethod()
 * @IPCDescription('Retrieve user information by user ID')
 * async getUser(params, context) {
 *   return { ... };
 * }
 */
export function IPCDescription(description: string): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    const existingMetadata = getIPCMethodMetadata(target, propertyKey) || {
      name: String(propertyKey),
    };

    const updatedMetadata: IPCMethodMetadata = {
      ...existingMetadata,
      description,
    };

    Reflect.defineMetadata(
      IPC_METHOD_METADATA_KEY,
      updatedMetadata,
      target,
      propertyKey
    );

    return descriptor;
  };
}

// ============================================================================
// PARAMETER DECORATORS
// ============================================================================

/**
 * @IPCParam() Decorator
 *
 * Extract specific parameter from params object
 *
 * Usage:
 * @IPCMethod()
 * async getUser(
 *   @IPCParam('userId') userId: string,
 *   @IPCParam('includeOrders') includeOrders: boolean,
 *   @IPCCallContext() context: IPCContext
 * ) {
 *   return { ... };
 * }
 */
export const IPCParam = (paramName: string): ParameterDecorator => {
  return (
    target: any,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) => {
    // Store parameter metadata
    const existingParams =
      Reflect.getMetadata("ipc:params", target, propertyKey!) || [];
    existingParams.push({ index: parameterIndex, name: paramName });
    Reflect.defineMetadata("ipc:params", existingParams, target, propertyKey!);
  };
};

/**
 * @IPCCallContext() Decorator
 *
 * Extract IPC context
 *
 * Usage:
 * @IPCMethod()
 * async getUser(
 *   params: any,
 *   @IPCCallContext() context: IPCContext
 * ) {
 *   console.log('Call chain:', context.chain);
 *   return { ... };
 * }
 */
export const IPCCallContext = (): ParameterDecorator => {
  return (
    target: any,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) => {
    Reflect.defineMetadata(
      "ipc:context-index",
      parameterIndex,
      target,
      propertyKey!
    );
  };
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default IPCMethod;
