/**
 * Test Helper Functions
 */

import { IPCServer } from '../../core/ipc-server';
import { IPCClient } from '../../core/ipc-client';

export async function startTestGateway(
  socketPath: string = '/tmp/test-gateway.sock',
): Promise<IPCServer> {
  const server = new IPCServer({
    socketPath,
    debug: false,
    timeout: 30000,
  });

  await server.start();
  return server;
}

export async function createTestClient(
  serviceName: string,
  gatewayPath: string = '/tmp/test-gateway.sock',
): Promise<IPCClient> {
  const client = new IPCClient({
    serviceName,
    gatewayPath,
    debug: false,
    autoReconnect: false,
  });
  await client.connect();
  return client;
}

export async function cleanupTest(
  server: IPCServer,
  ...clients: IPCClient[]
): Promise<void> {
  for (const client of clients) {
    await client.disconnect().catch(() => {});
  }

  await server.stop().catch(() => {});
}

export function generatePayload(sizeKB: number): any {
  const str = 'x'.repeat(sizeKB * 1024);
  return { data: str };
}
