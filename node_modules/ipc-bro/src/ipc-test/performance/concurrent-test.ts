/**
 * Concurrent Calls Test - Test parallel call handling
 */

import { Benchmark, sleep } from '../utils/benchmark';
import {
  startTestGateway,
  createTestClient,
  cleanupTest,
} from '../utils/test-helpers';

export async function runConcurrentTest() {
  console.log('\n🔬 Starting Concurrent Test...\n');

  const server = await startTestGateway();
  const clientA = await createTestClient('service-a');
  const clientB = await createTestClient('service-b');

  // Register method with small delay
  clientB.registerMethod('work', async (params) => {
    await sleep(10); // Simulate 10ms work
    return { result: params.value * 2 };
  });

  await sleep(100);

  // Test: 100000 concurrent calls
  const bench1 = new Benchmark('10000 Concurrent Calls');
  bench1.start();

  const promises: Promise<void>[] = [];

  for (let i = 0; i < 10000; i++) {
    const promise = (async () => {
      const start = Date.now();
      try {
        await clientA.call('service-b', 'work', { value: i });
        bench1.recordCall(Date.now() - start, true);
      } catch (error) {
        bench1.recordCall(Date.now() - start, false);
      }
    })();
    promises.push(promise);
  }

  await Promise.all(promises);

  const result1 = bench1.end();
  console.log(Benchmark.formatResult(result1));

  // Test: 1000 concurrent calls
  const bench2 = new Benchmark('100000 Concurrent Calls');
  bench2.start();

  const promises2: Promise<void>[] = [];

  for (let i = 0; i < 100000; i++) {
    const promise = (async () => {
      const start = Date.now();
      try {
        await clientA.call('service-b', 'work', { value: i });
        bench2.recordCall(Date.now() - start, true);
      } catch (error) {
        bench2.recordCall(Date.now() - start, false);
      }
    })();
    promises2.push(promise);
  }

  await Promise.all(promises2);

  const result2 = bench2.end();
  console.log(Benchmark.formatResult(result2));

  await cleanupTest(server, clientA, clientB);

  return { result1, result2 };
}

if (require.main === module) {
  runConcurrentTest()
    .then(() => process.exit(0))
    .catch(console.error);
}
