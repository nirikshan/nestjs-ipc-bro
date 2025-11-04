/**
 * Connection Pool Performance Test
 * Compares single connection vs connection pool
 */

import { IPCServer } from "../../core/ipc-server";
import { IPCClient } from "../../core/ipc-client";
import { Benchmark, sleep } from "../utils/benchmark";

async function testConnectionPool() {
  console.log("\n🔬 Connection Pool Performance Test\n");
  console.log("═".repeat(70));

  // Start Gateway
  console.log("\n1️⃣  Starting Gateway...");
  const server = new IPCServer({
    socketPath: "/tmp/brodox-pool-test.sock",
    serializer: "msgpack",
    debug: false,
  });
  await server.start();
  console.log("✓ Gateway started\n");

  // ============================================================
  // TEST 1: Single Connection (poolSize: 1)
  // ============================================================
  console.log("═".repeat(70));
  console.log("TEST 1: SINGLE CONNECTION (poolSize: 1)");
  console.log("═".repeat(70));

  const singleClient = new IPCClient({
    serviceName: "single-service",
    gatewayPath: "/tmp/brodox-pool-test.sock",
    serializer: "msgpack",
    poolSize: 1, // ← Single connection
    debug: false,
  });

  const responder1 = new IPCClient({
    serviceName: "responder-1",
    gatewayPath: "/tmp/brodox-pool-test.sock",
    serializer: "msgpack",
    poolSize: 1,
    debug: false,
  });

  // Register echo method
  responder1.registerMethod("echo", async (params) => {
    return { echo: params };
  });

  await singleClient.connect();
  await responder1.connect();
  await sleep(500);

  console.log("\n📊 Running 10,000 sequential calls...\n");

  const bench1 = new Benchmark("Single Connection Test");
  bench1.start();

  for (let i = 0; i < 10000; i++) {
    const start = Date.now();
    try {
      await singleClient.call("responder-1", "echo", { value: i });
      bench1.recordCall(Date.now() - start, true);
    } catch (error) {
      bench1.recordCall(Date.now() - start, false);
    }
  }

  const result1 = bench1.end();
  console.log(Benchmark.formatResult(result1));

  await singleClient.disconnect();
  await responder1.disconnect();
  await sleep(500);

  // ============================================================
  // TEST 2: Connection Pool (poolSize: 4)
  // ============================================================
  console.log("\n═".repeat(70));
  console.log("TEST 2: CONNECTION POOL (poolSize: 4)");
  console.log("═".repeat(70));

  const poolClient = new IPCClient({
    serviceName: "pool-service",
    gatewayPath: "/tmp/brodox-pool-test.sock",
    serializer: "msgpack",
    poolSize: 4, // ← 4 connections
    debug: false,
  });

  const responder2 = new IPCClient({
    serviceName: "responder-2",
    gatewayPath: "/tmp/brodox-pool-test.sock",
    serializer: "msgpack",
    poolSize: 1,
    debug: false,
  });

  // Register echo method
  responder2.registerMethod("echo", async (params) => {
    return { echo: params };
  });

  await poolClient.connect();
  await responder2.connect();
  await sleep(500);

  console.log("\n📊 Running 10,000 sequential calls...\n");

  const bench2 = new Benchmark("Connection Pool Test");
  bench2.start();

  for (let i = 0; i < 10000; i++) {
    const start = Date.now();
    try {
      await poolClient.call("responder-2", "echo", { value: i });
      bench2.recordCall(Date.now() - start, true);
    } catch (error) {
      bench2.recordCall(Date.now() - start, false);
    }
  }

  const result2 = bench2.end();
  console.log(Benchmark.formatResult(result2));

  await poolClient.disconnect();
  await responder2.disconnect();

  // ============================================================
  // TEST 3: High Concurrency with Pool
  // ============================================================
  console.log("\n═".repeat(70));
  console.log("TEST 3: HIGH CONCURRENCY (10,000 parallel calls)");
  console.log("═".repeat(70));

  const concurrentPoolClient = new IPCClient({
    serviceName: "concurrent-pool",
    gatewayPath: "/tmp/brodox-pool-test.sock",
    serializer: "msgpack",
    poolSize: 8, // ← 8 connections for high concurrency
    debug: false,
  });

  const responder3 = new IPCClient({
    serviceName: "responder-3",
    gatewayPath: "/tmp/brodox-pool-test.sock",
    serializer: "msgpack",
    poolSize: 1,
    debug: false,
  });

  responder3.registerMethod("work", async (params) => {
    // Simulate 10ms work
    await sleep(10);
    return { result: params.value * 2 };
  });

  await concurrentPoolClient.connect();
  await responder3.connect();
  await sleep(500);

  console.log("\n📊 Running 10,000 concurrent calls...\n");

  const bench3 = new Benchmark("Concurrent Pool Test");
  bench3.start();

  const promises: Promise<void>[] = [];

  for (let i = 0; i < 10000; i++) {
    const promise = (async () => {
      const start = Date.now();
      try {
        await concurrentPoolClient.call("responder-3", "work", { value: i });
        bench3.recordCall(Date.now() - start, true);
      } catch (error) {
        bench3.recordCall(Date.now() - start, false);
      }
    })();
    promises.push(promise);
  }

  await Promise.all(promises);

  const result3 = bench3.end();
  console.log(Benchmark.formatResult(result3));

  await concurrentPoolClient.disconnect();
  await responder3.disconnect();

  // ============================================================
  // COMPARISON SUMMARY
  // ============================================================
  console.log(
    "\n\n╔══════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║                    PERFORMANCE COMPARISON                        ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════╝\n"
  );

  const singleThroughput = result1.throughput;
  const poolThroughput = result2.throughput;
  const improvement =
    ((poolThroughput - singleThroughput) / singleThroughput) * 100;

  console.log("📊 SEQUENTIAL THROUGHPUT:");
  console.log(
    `   Single Connection (poolSize: 1):  ${singleThroughput.toFixed(
      0
    )} calls/sec`
  );
  console.log(
    `   Connection Pool (poolSize: 4):    ${poolThroughput.toFixed(
      0
    )} calls/sec`
  );
  console.log(
    `   Improvement:                      ${
      improvement >= 0 ? "+" : ""
    }${improvement.toFixed(1)}%`
  );
  console.log("");

  console.log("⚡ CONCURRENT THROUGHPUT:");
  console.log(
    `   Connection Pool (poolSize: 8):    ${result3.throughput.toFixed(
      0
    )} calls/sec`
  );
  console.log("");

  console.log("📈 LATENCY COMPARISON:");
  console.log(
    `   Single Connection:                ${result1.avgLatency.toFixed(
      2
    )}ms avg`
  );
  console.log(
    `   Connection Pool:                  ${result2.avgLatency.toFixed(
      2
    )}ms avg`
  );
  console.log(
    `   Concurrent Pool:                  ${result3.avgLatency.toFixed(
      2
    )}ms avg`
  );
  console.log("");

  // Performance verdict
  if (improvement > 100) {
    console.log("🏆 VERDICT: Connection Pool is 2x+ FASTER! 🚀🚀🚀");
  } else if (improvement > 50) {
    console.log("✨ VERDICT: Connection Pool is significantly FASTER! 🚀🚀");
  } else if (improvement > 20) {
    console.log("👍 VERDICT: Connection Pool provides good improvement! 🚀");
  } else if (improvement > 0) {
    console.log("  VERDICT: Connection Pool provides minor improvement");
  } else {
    console.log(
      "⚠️  VERDICT: Connection Pool shows no improvement (may not be working)"
    );
  }

  console.log("\n═".repeat(70));

  // Cleanup
  await server.stop();
  console.log("\n  Test completed!\n");

  return {
    single: result1,
    pool: result2,
    concurrent: result3,
    improvement: improvement,
  };
}

if (require.main === module) {
  testConnectionPool()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Test failed:", error);
      process.exit(1);
    });
}

export { testConnectionPool };
