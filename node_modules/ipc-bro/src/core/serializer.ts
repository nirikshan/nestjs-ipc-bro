/**
 * Pluggable Serializer with MessagePack support
 */

import { pack, unpack } from 'msgpackr';

export interface ISerializer {
  serialize(data: any): Buffer;
  deserialize(buffer: Buffer): any;
  name: string;
}

// ============================================================================
// JSON SERIALIZER (Default - slower)
// ============================================================================

export class JSONSerializer implements ISerializer {
  name = 'json';

  serialize(data: any): Buffer {
    const jsonString = JSON.stringify(data);
    return Buffer.from(jsonString, 'utf8');
  }

  deserialize(buffer: Buffer): any {
    const jsonString = buffer.toString('utf8');
    return JSON.parse(jsonString);
  }
}

// ============================================================================
// MESSAGEPACK SERIALIZER (Fast - RECOMMENDED)
// ============================================================================

export class MessagePackSerializer implements ISerializer {
  name = 'msgpack';

  serialize(data: any): Buffer {
    return pack(data) as Buffer;
  }

  deserialize(buffer: Buffer): any {
    return unpack(buffer);
  }
}

// ============================================================================
// SERIALIZER FACTORY
// ============================================================================

export type SerializerType = 'json' | 'msgpack';

export class SerializerFactory {
  static create(type: SerializerType = 'msgpack'): ISerializer {
    switch (type) {
      case 'msgpack':
        return new MessagePackSerializer();
      case 'json':
      default:
        return new JSONSerializer();
    }
  }
}
