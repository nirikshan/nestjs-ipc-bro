/**
 * Pure Non-Blocking Test but yesma after 100k call memory pressure hunxa and slow down
 */

import { IPCServer } from "../../core/ipc-server";
import { IPCClient } from "../../core/ipc-client";
import { sleep } from "../utils/benchmark";

async function pureNonBlockingTest() {
  console.log("\n🚀 PURE NON-BLOCKING TEST (No Limits)\n");
  console.log("═".repeat(70));

  const server = new IPCServer({
    socketPath: "/tmp/brodox-pure.sock",
    serializer: "msgpack",
    debug: false,
  });
  await server.start();

  const responder = new IPCClient({
    serviceName: "responder",
    gatewayPath: "/tmp/brodox-pure.sock",
    serializer: "msgpack",
    poolSize: 1,
    debug: false,
  });

  responder.registerMethod("fast", async () => ({ ok: true }));
  await responder.connect();
  await sleep(500);

  // Test different pool sizes
  for (const poolSize of [1, 4, 8, 16]) {
    console.log(`\n📊 Testing poolSize: ${poolSize}\n`);

    const client = new IPCClient({
      serviceName: `client-${poolSize}`,
      gatewayPath: "/tmp/brodox-pure.sock",
      serializer: "msgpack",
      poolSize,
      debug: false,
    });

    await client.connect();
    await sleep(500);

    // ============================================================
    // TEST 1: 10K calls - PURE NON-BLOCKING
    // ============================================================
    let start = Date.now();
    let success = 0;
    let failed = 0;

    const promises10k: Promise<void>[] = [];

    for (let i = 0; i < 10000; i++) {
      const promise = client
        .call("responder", "fast", {})
        .then(() => {
          success++;
        })
        .catch(() => {
          failed++;
        });

      promises10k.push(promise);
    }

    await Promise.all(promises10k);

    let duration = Date.now() - start;
    let throughput = Math.round((10000 / duration) * 1000);

    console.log(
      `   10K calls:     ${duration}ms | ${throughput.toLocaleString()} calls/sec`
    );

    // ============================================================
    // TEST 2: 100K calls - PURE NON-BLOCKING
    // ============================================================
    start = Date.now();
    success = 0;
    failed = 0;

    const promises100k: Promise<void>[] = [];

    for (let i = 0; i < 100000; i++) {
      const promise = client
        .call("responder", "fast", {})
        .then(() => {
          success++;
        })
        .catch(() => {
          failed++;
        });

      promises100k.push(promise);
    }

    await Promise.all(promises100k);

    duration = Date.now() - start;
    throughput = Math.round((100000 / duration) * 1000);

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
  // MEGA TEST: 1M calls with optimal pool
  // ============================================================
  console.log("\n═".repeat(70));
  console.log("🔥 MEGA TEST: 1 MILLION CALLS (Pure Non-Blocking)\n");

  const megaClient = new IPCClient({
    serviceName: "mega-client",
    gatewayPath: "/tmp/brodox-pure.sock",
    serializer: "msgpack",
    poolSize: 8, // Optimal based on results
    debug: false,
  });

  await megaClient.connect();
  await sleep(500);

  const megaStart = Date.now();
  let megaSuccess = 0;
  let megaFailed = 0;

  const megaPromises: Promise<void>[] = [];

  for (let i = 0; i < 1000000; i++) {
    const promise = megaClient
      .call("responder", "fast", {})
      .then(() => {
        megaSuccess++;
      })
      .catch(() => {
        megaFailed++;
      });

    megaPromises.push(promise);

    // Progress updates
    if ((i + 1) % 100000 === 0) {
      const elapsed = Date.now() - megaStart;
      const currentThroughput = Math.round(((i + 1) / elapsed) * 1000);
      process.stdout.write(
        `\r   Progress: ${(((i + 1) / 1000000) * 100).toFixed(
          1
        )}% | ${currentThroughput.toLocaleString()} calls/sec`
      );
    }
  }

  await Promise.all(megaPromises);

  const megaDuration = Date.now() - megaStart;
  const megaThroughput = Math.round((1000000 / megaDuration) * 1000);

  console.log(`\n\n   Total calls:   1,000,000`);
  console.log(`   Duration:      ${(megaDuration / 1000).toFixed(2)}s`);
  console.log(`   Throughput:    ${megaThroughput.toLocaleString()} calls/sec`);
  console.log(`   Success:       ${megaSuccess.toLocaleString()}`);
  console.log(`   Failed:        ${megaFailed.toLocaleString()}`);

  if (megaThroughput >= 100000) {
    console.log(
      `\n   🏆 VERDICT: 100K+ ACHIEVED! ${megaThroughput.toLocaleString()}/sec 🎉\n`
    );
  } else {
    console.log(
      `\n     VERDICT: Excellent ${megaThroughput.toLocaleString()}/sec\n`
    );
  }

  console.log("═".repeat(70));

  await megaClient.disconnect();
  await responder.disconnect();
  await server.stop();

  console.log("\n  Test completed!\n");
}

if (require.main === module) {
  pureNonBlockingTest()
    .then(() => process.exit(0))
    .catch(console.error);
}
