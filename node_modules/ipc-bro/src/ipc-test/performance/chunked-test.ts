/**
 * Chunked Non-Blocking Test
 * Process in optimal chunks to avoid memory pressure
 */

import { IPCServer } from "../../core/ipc-server";
import { IPCClient } from "../../core/ipc-client";
import { sleep } from "../utils/benchmark";

async function chunkedTest() {
  console.log("\n🚀 CHUNKED NON-BLOCKING TEST (Optimal)\n");
  console.log("Goal: 100K+/sec without memory pressure\n");
  console.log("═".repeat(70));

  const server = new IPCServer({
    socketPath: "/tmp/brodox-chunked.sock",
    serializer: "msgpack",
    debug: false,
  });
  await server.start();

  const responder = new IPCClient({
    serviceName: "responder",
    gatewayPath: "/tmp/brodox-chunked.sock",
    serializer: "msgpack",
    poolSize: 1,
    debug: false,
  });

  responder.registerMethod("fast", async () => ({ ok: true }));
  await responder.connect();
  await sleep(500);

  // Test different chunk sizes
  const chunkSizes = [1000, 5000, 10000, 25000, 50000];

  for (const chunkSize of chunkSizes) {
    console.log(`\n📊 Testing chunkSize: ${chunkSize.toLocaleString()}\n`);

    const client = new IPCClient({
      serviceName: `client-chunk-${chunkSize}`,
      gatewayPath: "/tmp/brodox-chunked.sock",
      serializer: "msgpack",
      poolSize: 4,
      debug: false,
    });

    await client.connect();
    await sleep(500);

    // Test with 100K calls
    const totalCalls = 100000;
    const start = Date.now();
    let success = 0;

    for (let i = 0; i < totalCalls; i += chunkSize) {
      const chunk = Math.min(chunkSize, totalCalls - i);
      const promises: Promise<void>[] = [];

      for (let j = 0; j < chunk; j++) {
        const promise = client
          .call("responder", "fast", {})
          .then(() => {
            success++;
          })
          .catch(() => {});

        promises.push(promise);
      }

      await Promise.all(promises);
    }

    const duration = Date.now() - start;
    const throughput = Math.round((totalCalls / duration) * 1000);

    console.log(
      `   100K calls:    ${duration}ms | ${throughput.toLocaleString()} calls/sec`
    );

    if (throughput >= 100000) {
      console.log(`   Status:        🏆 TARGET ACHIEVED!\n`);
    } else {
      console.log(`   Status:          ${throughput.toLocaleString()}/sec\n`);
    }

    await client.disconnect();
    await sleep(500);
  }

  // ============================================================
  // OPTIMAL TEST: 1M calls with best chunk size
  // ============================================================
  console.log("\n═".repeat(70));
  console.log("🔥 OPTIMAL TEST: 1 MILLION CALLS\n");

  const optimalClient = new IPCClient({
    serviceName: "optimal-client",
    gatewayPath: "/tmp/brodox-chunked.sock",
    serializer: "msgpack",
    poolSize: 8,
    debug: false,
  });

  await optimalClient.connect();
  await sleep(500);

  const totalCalls = 1000000;
  const optimalChunkSize = 25000; // Optimal based on tests
  const start = Date.now();
  let totalSuccess = 0;

  for (let i = 0; i < totalCalls; i += optimalChunkSize) {
    const chunk = Math.min(optimalChunkSize, totalCalls - i);
    const promises: Promise<void>[] = [];

    for (let j = 0; j < chunk; j++) {
      const promise = optimalClient
        .call("responder", "fast", {})
        .then(() => {
          totalSuccess++;
        })
        .catch(() => {});

      promises.push(promise);
    }

    await Promise.all(promises);

    // Progress
    const processed = i + chunk;
    const elapsed = Date.now() - start;
    const currentThroughput = Math.round((processed / elapsed) * 1000);
    process.stdout.write(
      `\r   Progress: ${((processed / totalCalls) * 100).toFixed(
        1
      )}% | ${currentThroughput.toLocaleString()} calls/sec`
    );
  }

  const duration = Date.now() - start;
  const throughput = Math.round((totalCalls / duration) * 1000);

  console.log(`\n\n   Total calls:   1,000,000`);
  console.log(`   Duration:      ${(duration / 1000).toFixed(2)}s`);
  console.log(`   Throughput:    ${throughput.toLocaleString()} calls/sec`);
  console.log(`   Success:       ${totalSuccess.toLocaleString()}`);

  if (throughput >= 100000) {
    console.log(
      `\n   🏆 VERDICT: 100K+ ACHIEVED! ${throughput.toLocaleString()}/sec 🎉\n`
    );
  } else {
    console.log(
      `\n     VERDICT: Excellent ${throughput.toLocaleString()}/sec\n`
    );
  }

  console.log("═".repeat(70));

  await optimalClient.disconnect();
  await responder.disconnect();
  await server.stop();

  console.log("\n  Test completed!\n");
}

if (require.main === module) {
  chunkedTest()
    .then(() => process.exit(0))
    .catch(console.error);
}
