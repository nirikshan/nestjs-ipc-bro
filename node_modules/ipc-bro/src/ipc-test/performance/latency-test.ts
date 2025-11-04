/**
 * Latency Test - Measure round-trip time for IPC calls
 */

import { Benchmark, sleep } from '../utils/benchmark';
import {
  startTestGateway,
  createTestClient,
  cleanupTest,
} from '../utils/test-helpers';

export async function runLatencyTest() {
  console.log('\n🔬 Starting Latency Test...\n');

  const server = await startTestGateway();
  const clientA = await createTestClient('service-a');
  const clientB = await createTestClient('service-b');

  // Register method on service B
  clientB.registerMethod('echo', async (params) => {
    return { echo: params };
  });

  await sleep(100); // Let registration complete

  // Test 1: Simple echo (small payload)
  const bench1 = new Benchmark('Simple Echo 10000 calls (1KB payload)');
  bench1.start();

  for (let i = 0; i < 10000; i++) {
    const start = Date.now();
    await clientA.call('service-b', 'echo', { data: 'x'.repeat(1024) });
    const latency = Date.now() - start;
    bench1.recordCall(latency);
  }

  const result1 = bench1.end();
  console.log(Benchmark.formatResult(result1));

  // Test 2: Medium payload
  const bench2 = new Benchmark('Medium Payload 10000 calls  (10KB)');
  bench2.start();

  for (let i = 0; i < 10000; i++) {
    const start = Date.now();
    await clientA.call('service-b', 'echo', { data: 'x'.repeat(10 * 1024) });
    const latency = Date.now() - start;
    bench2.recordCall(latency);
  }

  const result2 = bench2.end();
  console.log(Benchmark.formatResult(result2));

  // Test 3: Large payload
  const bench3 = new Benchmark('Large Payload 1000 Calls (100KB)');
  bench3.start();

  for (let i = 0; i < 1000; i++) {
    const start = Date.now();
    await clientA.call('service-b', 'echo', { data: 'x'.repeat(100 * 1024) });
    const latency = Date.now() - start;
    bench3.recordCall(latency);
  }

  const result3 = bench3.end();
  console.log(Benchmark.formatResult(result3));

  await cleanupTest(server, clientA, clientB);

  return { result1, result2, result3 };
}

if (require.main === module) {
  runLatencyTest()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
