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
/**
 * Metadata key for storing IPC method information
 * Used by IPCClientModule to discover decorated methods
 */
export declare const IPC_METHOD_METADATA_KEY = "ipc:method";
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
export declare function IPCMethod(nameOrOptions?: string | Partial<IPCMethodMetadata>): MethodDecorator;
/**
 * Get IPC method metadata from a method
 *
 * Used by IPCClientModule to discover decorated methods
 *
 * @param target - Target object (prototype)
 * @param propertyKey - Method name
 * @returns Metadata or undefined
 */
export declare function getIPCMethodMetadata(target: any, propertyKey: string | symbol): IPCMethodMetadata | undefined;
/**
 * Check if a method has @IPCMethod decorator
 *
 * @param target - Target object (prototype)
 * @param propertyKey - Method name
 * @returns true if decorated
 */
export declare function isIPCMethod(target: any, propertyKey: string | symbol): boolean;
/**
 * Get all IPC methods from a class
 *
 * @param target - Class or instance
 * @returns Array of method names
 */
export declare function getAllIPCMethods(target: any): string[];
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
export declare function IPCValidate(validator: (params: any) => boolean | Promise<boolean>): MethodDecorator;
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
export declare function IPCTimeout(timeoutMs: number): MethodDecorator;
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
export declare function IPCDescription(description: string): MethodDecorator;
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
export declare const IPCParam: (paramName: string) => ParameterDecorator;
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
export declare const IPCCallContext: () => ParameterDecorator;
export default IPCMethod;
