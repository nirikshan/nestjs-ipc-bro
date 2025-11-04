/**
 * Nested Call Test - Test deep call chains
 */

import { Benchmark, sleep } from '../utils/benchmark';
import {
  startTestGateway,
  createTestClient,
  cleanupTest,
} from '../utils/test-helpers';
import { IPCClient } from '../../core/ipc-client';

export async function runNestedCallTest() {
  console.log('\n🔬 Starting Nested Call Test...\n');

  const server = await startTestGateway();

  // Create chain: A → B → C → D
  const clientA = await createTestClient('service-a');
  const clientB = await createTestClient('service-b');
  const clientC = await createTestClient('service-c');
  const clientD = await createTestClient('service-d');

  // D: End of chain
  clientD.registerMethod('end', async (params) => {
    return { depth: params.depth, result: 'done' };
  });

  // C: Calls D
  clientC.registerMethod('middle', async (params) => {
    const result = await clientC.call('service-d', 'end', {
      depth: params.depth + 1,
    });
    return result;
  });

  // B: Calls C
  clientB.registerMethod('middle', async (params) => {
    const result = await clientB.call('service-c', 'middle', {
      depth: params.depth + 1,
    });
    return result;
  });

  await sleep(200);

  // Test 1: Depth 3 (A → B → C → D)
  const bench1 = new Benchmark('Nested Calls - Depth 3 (100000 calls)');
  bench1.start();

  for (let i = 0; i < 100000; i++) {
    const start = Date.now();
    try {
      await clientA.call('service-b', 'middle', { depth: 1 });
      bench1.recordCall(Date.now() - start, true);
    } catch (error) {
      bench1.recordCall(Date.now() - start, false);
    }
  }

  const result1 = bench1.end();
  console.log(Benchmark.formatResult(result1));

  // Test 2: Very deep chain (10 levels)
  const clients: IPCClient[] = [];

  for (let i = 0; i < 20; i++) {
    const client = await createTestClient(`level-${i}`);
    clients.push(client);

    if (i === 9) {
      // Last level
      client.registerMethod('call', async () => {
        return { level: i };
      });
    } else {
      // Intermediate level
      client.registerMethod('call', async () => {
        return await client.call(`level-${i + 1}`, 'call', {});
      });
    }
  }

  await sleep(500);

  const bench2 = new Benchmark('Nested Calls - Depth 20 (1000 calls)');
  bench2.start();

  for (let i = 0; i < 1000; i++) {
    const start = Date.now();
    try {
      await clients[0].call('level-1', 'call', {});
      bench2.recordCall(Date.now() - start, true);
    } catch (error) {
      bench2.recordCall(Date.now() - start, false);
    }
  }

  const result2 = bench2.end();
  console.log(Benchmark.formatResult(result2));

  await cleanupTest(server, clientA, clientB, clientC, clientD, ...clients);

  return { result1, result2 };
}

if (require.main === module) {
  runNestedCallTest()
    .then(() => process.exit(0))
    .catch(console.error);
}
