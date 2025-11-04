"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCErrorCode = exports.IPCError = void 0;
class IPCError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'IPCError';
    }
}
exports.IPCError = IPCError;
/**
 * Error codes used in IPC system
 */
var IPCErrorCode;
(function (IPCErrorCode) {
    // Connection errors
    IPCErrorCode["CONNECTION_FAILED"] = "CONNECTION_FAILED";
    IPCErrorCode["CONNECTION_LOST"] = "CONNECTION_LOST";
    IPCErrorCode["NOT_CONNECTED"] = "NOT_CONNECTED";
    // Routing errors
    IPCErrorCode["SERVICE_NOT_FOUND"] = "SERVICE_NOT_FOUND";
    IPCErrorCode["METHOD_NOT_FOUND"] = "METHOD_NOT_FOUND";
    // Execution errors
    IPCErrorCode["EXECUTION_FAILED"] = "EXECUTION_FAILED";
    IPCErrorCode["TIMEOUT"] = "TIMEOUT";
    IPCErrorCode["DEADLINE_EXCEEDED"] = "DEADLINE_EXCEEDED";
    // Message errors
    IPCErrorCode["INVALID_MESSAGE"] = "INVALID_MESSAGE";
    IPCErrorCode["SERIALIZATION_FAILED"] = "SERIALIZATION_FAILED";
    IPCErrorCode["DESERIALIZATION_FAILED"] = "DESERIALIZATION_FAILED";
    // Context errors
    IPCErrorCode["INVALID_CONTEXT"] = "INVALID_CONTEXT";
    IPCErrorCode["MAX_DEPTH_EXCEEDED"] = "MAX_DEPTH_EXCEEDED";
    IPCErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
})(IPCErrorCode || (exports.IPCErrorCode = IPCErrorCode = {}));
// ============================================================================
// EXPORTS SUMMARY
// ============================================================================
