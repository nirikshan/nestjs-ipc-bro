/**
 * Stress Test - Test system under heavy load
 */

import { Benchmark, sleep } from '../utils/benchmark';
import {
  startTestGateway,
  createTestClient,
  cleanupTest,
} from '../utils/test-helpers';
import { IPCServer } from '../../core/ipc-server';
import { IPCClient } from '../../core/ipc-client';

export async function runStressTest() {
  console.log('\n🔬 Starting Stress Test...\n');

  const server: IPCServer = await startTestGateway();

  // Create many clients
  const clients: IPCClient[] = [];
  const numClients = 50;

  console.log(`Creating ${numClients} concurrent clients...`);

  for (let i = 0; i < numClients; i++) {
    const client: IPCClient = await createTestClient(`client-${i}`);
    clients.push(client);
  }

  console.log('✓ All clients connected\n');

  // Register echo method on all clients
  for (const client of clients) {
    client.registerMethod('echo', async (params) => {
      return params;
    });
  }

  await sleep(500);

  // Test: Each client calls all other clients
  const bench = new Benchmark(
    `Stress Test: ${numClients} clients × 10 calls each`,
  );
  bench.start();

  const allPromises: Promise<void>[] = [];

  for (let i = 0; i < numClients; i++) {
    const caller = clients[i];

    for (let j = 0; j < 10; j++) {
      const targetIndex = (i + j + 1) % numClients;
      const targetName = `client-${targetIndex}`;

      const promise = (async () => {
        const start = Date.now();
        try {
          await caller.call(targetName, 'echo', { value: j });
          bench.recordCall(Date.now() - start, true);
        } catch (error) {
          bench.recordCall(Date.now() - start, false);
        }
      })();

      allPromises.push(promise);
    }
  }

  await Promise.all(allPromises);

  const result = bench.end();
  console.log(Benchmark.formatResult(result));

  await cleanupTest(server, ...clients);

  return result;
}

if (require.main === module) {
  runStressTest()
    .then(() => process.exit(0))
    .catch(console.error);
}
