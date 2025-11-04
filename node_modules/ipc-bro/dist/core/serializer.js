"use strict";
/**
 * Pluggable Serializer with MessagePack support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerializerFactory = exports.MessagePackSerializer = exports.JSONSerializer = void 0;
const msgpackr_1 = require("msgpackr");
// ============================================================================
// JSON SERIALIZER (Default - slower)
// ============================================================================
class JSONSerializer {
    constructor() {
        this.name = 'json';
    }
    serialize(data) {
        const jsonString = JSON.stringify(data);
        return Buffer.from(jsonString, 'utf8');
    }
    deserialize(buffer) {
        const jsonString = buffer.toString('utf8');
        return JSON.parse(jsonString);
    }
}
exports.JSONSerializer = JSONSerializer;
// ============================================================================
// MESSAGEPACK SERIALIZER (Fast - RECOMMENDED)
// ============================================================================
class MessagePackSerializer {
    constructor() {
        this.name = 'msgpack';
    }
    serialize(data) {
        return (0, msgpackr_1.pack)(data);
    }
    deserialize(buffer) {
        return (0, msgpackr_1.unpack)(buffer);
    }
}
exports.MessagePackSerializer = MessagePackSerializer;
class SerializerFactory {
    static create(type = 'msgpack') {
        switch (type) {
            case 'msgpack':
                return new MessagePackSerializer();
            case 'json':
            default:
                return new JSONSerializer();
        }
    }
}
exports.SerializerFactory = SerializerFactory;
