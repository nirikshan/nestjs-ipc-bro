export type MessageType = 'CALL' | 'RESPONSE' | 'REGISTER' | 'HEARTBEAT';
export type ResponseStatus = 'success' | 'error';

export interface IPCContext {
  root: string;
  chain: string[];
  depth: number;
  deadline: number;
}

export interface BaseMessage {
  type: MessageType;
  id: string;
  from: string;
  to: string;
}

export interface CallMessage extends BaseMessage {
  type: 'CALL';
  method: string;
  params: any;
  context: IPCContext;
}

export interface ResponseMessage extends BaseMessage {
  type: 'RESPONSE';
  status: ResponseStatus;
  data?: any;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  context: IPCContext;
}

export interface RegisterMessage {
  type: 'REGISTER';
  serviceName: string;
  methods: string[];
  version?: string;
  metadata?: Record<string, any>;
}

export interface HeartbeatMessage {
  type: 'HEARTBEAT';
  from: string;
  timestamp: number;
}

export type IPCMessage =
  | CallMessage
  | ResponseMessage
  | RegisterMessage
  | HeartbeatMessage;

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  createdAt: number;
  timeoutId?: NodeJS.Timeout;
  originalMessage: CallMessage;
}

/**
 * For  SERVICE REGISTRY
 * Information about a connected service
 * Stored in Gateway's connectedServices Map
 */
export interface ServiceEntry {
  name: string;
  socket: any;
  methods: string[];
  connectedAt: number;
  lastHeartbeat?: number;
  metadata?: Record<string, any>;
  version?: string;
}

export interface IPCServerConfig {
  socketPath: string;
  heartbeatInterval?: number;
  timeout?: number;
  debug?: boolean;
  serializer?: 'json' | 'msgpack';
}

export interface IPCClientConfig {
  serviceName: string;
  gatewayPath: string;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  timeout?: number;
  heartbeatInterval?: number;
  debug?: boolean;
  serializer?: 'json' | 'msgpack';
  poolSize?: number;
}

/**
 * Type for method handler functions
 * These are the actual functions that get executed when CALL arrives
 *
 * @param params - Parameters from the CALL message
 * @param context - IPC context for tracking
 * @returns Promise with result data
 */
export type MethodHandler = (params: any, context: IPCContext) => Promise<any>;

/**
 * Registry of methods that a service can handle
 * Key: method name
 * Value: handler function
 */
export type MethodRegistry = Map<string, MethodHandler>;

export class IPCError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'IPCError';
  }
}

/**
 * Error codes used in IPC system
 */
export enum IPCErrorCode {
  // Connection errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_LOST = 'CONNECTION_LOST',
  NOT_CONNECTED = 'NOT_CONNECTED',

  // Routing errors
  SERVICE_NOT_FOUND = 'SERVICE_NOT_FOUND',
  METHOD_NOT_FOUND = 'METHOD_NOT_FOUND',

  // Execution errors
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  TIMEOUT = 'TIMEOUT',
  DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',

  // Message errors
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
  DESERIALIZATION_FAILED = 'DESERIALIZATION_FAILED',

  // Context errors
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  MAX_DEPTH_EXCEEDED = 'MAX_DEPTH_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// ============================================================================
// EXPORTS SUMMARY
// ============================================================================
