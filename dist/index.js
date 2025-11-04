"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCServer = exports.IPCClient = void 0;
__exportStar(require("./ipc-server.module"), exports);
__exportStar(require("./ipc-client.module"), exports);
// export * from "./ipc-client.service";
__exportStar(require("./ipc-method.decorator"), exports);
var ipc_bro_1 = require("ipc-bro");
Object.defineProperty(exports, "IPCClient", { enumerable: true, get: function () { return ipc_bro_1.IPCClient; } });
Object.defineProperty(exports, "IPCServer", { enumerable: true, get: function () { return ipc_bro_1.IPCServer; } });
