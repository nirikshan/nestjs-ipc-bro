"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCCallContext = exports.IPCParam = exports.IPC_METHOD_METADATA_KEY = void 0;
exports.IPCMethod = IPCMethod;
exports.getIPCMethodMetadata = getIPCMethodMetadata;
exports.isIPCMethod = isIPCMethod;
exports.getAllIPCMethods = getAllIPCMethods;
exports.IPCValidate = IPCValidate;
exports.IPCTimeout = IPCTimeout;
exports.IPCDescription = IPCDescription;
// ============================================================================
// CONSTANTS
// ============================================================================
/**
 * Metadata key for storing IPC method information
 * Used by IPCClientModule to discover decorated methods
 */
exports.IPC_METHOD_METADATA_KEY = "ipc:method";
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
function IPCMethod(nameOrOptions) {
    return (target, propertyKey, descriptor) => {
        // Parse options
        const metadata = parseOptions(propertyKey, nameOrOptions);
        // Store metadata on the method
        Reflect.defineMetadata(exports.IPC_METHOD_METADATA_KEY, metadata, target, propertyKey);
        // Optional: Wrap the original method for validation/logging
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
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
function parseOptions(propertyKey, nameOrOptions) {
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
function getIPCMethodMetadata(target, propertyKey) {
    return Reflect.getMetadata(exports.IPC_METHOD_METADATA_KEY, target, propertyKey);
}
/**
 * Check if a method has @IPCMethod decorator
 *
 * @param target - Target object (prototype)
 * @param propertyKey - Method name
 * @returns true if decorated
 */
function isIPCMethod(target, propertyKey) {
    return Reflect.hasMetadata(exports.IPC_METHOD_METADATA_KEY, target, propertyKey);
}
/**
 * Get all IPC methods from a class
 *
 * @param target - Class or instance
 * @returns Array of method names
 */
function getAllIPCMethods(target) {
    const prototype = target.prototype || Object.getPrototypeOf(target);
    const methodNames = [];
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
function IPCValidate(validator) {
    return (target, propertyKey, descriptor) => {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
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
function IPCTimeout(timeoutMs) {
    return (target, propertyKey, descriptor) => {
        // Get existing metadata or create new
        const existingMetadata = getIPCMethodMetadata(target, propertyKey) || {
            name: String(propertyKey),
        };
        // Update timeout
        const updatedMetadata = {
            ...existingMetadata,
            timeout: timeoutMs,
        };
        // Store updated metadata
        Reflect.defineMetadata(exports.IPC_METHOD_METADATA_KEY, updatedMetadata, target, propertyKey);
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
function IPCDescription(description) {
    return (target, propertyKey, descriptor) => {
        const existingMetadata = getIPCMethodMetadata(target, propertyKey) || {
            name: String(propertyKey),
        };
        const updatedMetadata = {
            ...existingMetadata,
            description,
        };
        Reflect.defineMetadata(exports.IPC_METHOD_METADATA_KEY, updatedMetadata, target, propertyKey);
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
const IPCParam = (paramName) => {
    return (target, propertyKey, parameterIndex) => {
        // Store parameter metadata
        const existingParams = Reflect.getMetadata("ipc:params", target, propertyKey) || [];
        existingParams.push({ index: parameterIndex, name: paramName });
        Reflect.defineMetadata("ipc:params", existingParams, target, propertyKey);
    };
};
exports.IPCParam = IPCParam;
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
const IPCCallContext = () => {
    return (target, propertyKey, parameterIndex) => {
        Reflect.defineMetadata("ipc:context-index", parameterIndex, target, propertyKey);
    };
};
exports.IPCCallContext = IPCCallContext;
// ============================================================================
// DEFAULT EXPORT
// ============================================================================
exports.default = IPCMethod;
