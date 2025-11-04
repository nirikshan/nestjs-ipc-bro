/**
 * Throughput Test - Measure messages per second
 */

import { Benchmark, sleep } from '../utils/benchmark';
import {
  startTestGateway,
  createTestClient,
  cleanupTest,
} from '../utils/test-helpers';

export async function runThroughputTest() {
  console.log('\n🔬 Starting Throughput Test...\n');

  const server = await startTestGateway();
  const clientA = await createTestClient('service-a');
  const clientB = await createTestClient('service-b');

  // Register fast method
  clientB.registerMethod('noop', async () => {
    return { success: true };
  });

  await sleep(100);

  // Test: Maximum throughput (sequential)
  const bench = new Benchmark('Sequential Calls (100000 calls)');
  bench.start();

  for (let i = 0; i < 100000; i++) {
    const start = Date.now();
    try {
      await clientA.call('service-b', 'noop', {});
      bench.recordCall(Date.now() - start, true);
    } catch (error) {
      bench.recordCall(Date.now() - start, false);
    }
  }

  const result = bench.end();
  console.log(Benchmark.formatResult(result));

  await cleanupTest(server, clientA, clientB);

  return result;
}

if (require.main === module) {
  runThroughputTest()
    .then(() => process.exit(0))
    .catch(console.error);
}
