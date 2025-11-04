/**
 * Pluggable Serializer with MessagePack support
 */
export interface ISerializer {
    serialize(data: any): Buffer;
    deserialize(buffer: Buffer): any;
    name: string;
}
export declare class JSONSerializer implements ISerializer {
    name: string;
    serialize(data: any): Buffer;
    deserialize(buffer: Buffer): any;
}
export declare class MessagePackSerializer implements ISerializer {
    name: string;
    serialize(data: any): Buffer;
    deserialize(buffer: Buffer): any;
}
export type SerializerType = 'json' | 'msgpack';
export declare class SerializerFactory {
    static create(type?: SerializerType): ISerializer;
}
