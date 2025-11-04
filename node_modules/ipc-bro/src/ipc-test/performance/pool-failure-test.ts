import { IPCServer } from "../../core/ipc-server";
import { IPCClient } from "../../core/ipc-client";
import { sleep } from "../utils/benchmark";

async function testPoolFailure() {
  console.log("\n🧪 POOL FAILURE TEST\n");
  console.log("Testing pool resilience under failure conditions\n");
  console.log("═".repeat(70));

  const server = new IPCServer({
    socketPath: "/tmp/brodox-failure-test.sock",
    serializer: "msgpack",
    debug: false,
  });
  await server.start();

  const responder = new IPCClient({
    serviceName: "responder",
    gatewayPath: "/tmp/brodox-failure-test.sock",
    serializer: "msgpack",
    poolSize: 1,
    debug: false,
  });

  responder.registerMethod("echo", async (params) => {
    return { value: params.value };
  });

  await responder.connect();
  await sleep(500);

  // ============================================================
  // TEST 1: Normal Operation
  // ============================================================
  console.log("\n📊 TEST 1: Normal Operation (Baseline)\n");

  const client = new IPCClient({
    serviceName: "test-client",
    gatewayPath: "/tmp/brodox-failure-test.sock",
    serializer: "msgpack",
    poolSize: 4,
    debug: false,
  });

  await client.connect();
  await sleep(500);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < 100; i++) {
    try {
      await client.call("responder", "echo", { value: i });
      success++;
    } catch (error) {
      failed++;
    }
  }

  console.log(`   Calls:       100`);
  console.log(`   Success:     ${success}`);
  console.log(`   Failed:      ${failed}`);
  console.log(`   Success Rate: ${((success / 100) * 100).toFixed(1)}%\n`);

  if (success === 100) {
    console.log("     Baseline test passed!\n");
  }

  // ============================================================
  // TEST 2: Gateway Restart with Proper Timing
  // ============================================================
  console.log("📊 TEST 2: Gateway Restart\n");

  console.log("   Phase 1: Sending 100 calls...");

  let phase1Success = 0;
  for (let i = 0; i < 100; i++) {
    try {
      await client.call("responder", "echo", { value: i });
      phase1Success++;
    } catch (error) {
      // Expected to fail
    }
  }
  console.log(`   Phase 1 complete: ${phase1Success}/100 successful\n`);

  console.log("   💥 Stopping gateway...");
  await responder.disconnect();
  await server.stop();
  await sleep(1000);

  console.log("   📉 Gateway down - calls should fail now...");

  let failurePhaseSuccess = 0;
  let failurePhaseFailed = 0;

  for (let i = 0; i < 50; i++) {
    try {
      await client.call("responder", "echo", { value: i });
      failurePhaseSuccess++;
    } catch (error) {
      failurePhaseFailed++;
    }
  }
  console.log(`   Expected failures: ${failurePhaseFailed}/50  \n`);

  console.log("   ♻️  Restarting gateway...");
  await server.start();

  // Restart responder
  const responder2 = new IPCClient({
    serviceName: "responder",
    gatewayPath: "/tmp/brodox-failure-test.sock",
    serializer: "msgpack",
    poolSize: 1,
    debug: false,
  });

  responder2.registerMethod("echo", async (params) => {
    return { value: params.value };
  });

  await responder2.connect();

  console.log("   ⏳ Waiting for pool to reconnect (15 seconds)...\n");
  await sleep(15000);

  console.log("   Phase 2: Sending 100 calls after reconnect...");

  let phase2Success = 0;
  for (let i = 0; i < 100; i++) {
    try {
      await client.call("responder", "echo", { value: i });
      phase2Success++;
    } catch (error) {
      // Should succeed after reconnect
    }
  }
  console.log(`   Phase 2 complete: ${phase2Success}/100 successful\n`);

  if (phase2Success > 80) {
    console.log("     Pool recovered successfully!\n");
  } else {
    console.log(
      `   ⚠️  Pool partially recovered (${phase2Success}% success)\n`
    );
  }

  // ============================================================
  // TEST 3: Pool Statistics
  // ============================================================
  console.log("📊 TEST 3: Pool Health Statistics\n");

  const stats = (client as any).connectionPool?.getStats();

  if (stats) {
    console.log(`   Total Sockets:      ${stats.total}`);
    console.log(`   Connected:          ${stats.connected}`);
    console.log(`   Healthy:            ${stats.healthy}`);
    console.log(`   Unhealthy:          ${stats.unhealthy}`);
    console.log(`   Disconnected:       ${stats.disconnected}`);
    console.log(`   Total Errors:       ${stats.totalErrors}\n`);

    if (stats.connected >= 3) {
      console.log(
        `     Pool is healthy (${stats.connected}/${stats.total} connected)!\n`
      );
    } else {
      console.log(
        `   ⚠️  Pool needs recovery (only ${stats.connected}/${stats.total} connected)\n`
      );
    }
  }

  // ============================================================
  // TEST 4: Single Socket Failure
  // ============================================================
  console.log("📊 TEST 4: Single Socket Failure Simulation\n");

  console.log("   Sending 200 calls with pool...");

  let test4Success = 0;
  let test4Failed = 0;

  for (let i = 0; i < 200; i++) {
    try {
      await client.call("responder", "echo", { value: i });
      test4Success++;
    } catch (error) {
      test4Failed++;
    }

    // Simulate a socket failure at call 100
    if (i === 100) {
      console.log("   💥 Simulating socket failure...");
      const pool = (client as any).connectionPool;
      if (pool && pool.sockets[0]) {
        pool.sockets[0].socket.destroy();
      }
    }
  }

  console.log(`   Calls:       200`);
  console.log(`   Success:     ${test4Success}`);
  console.log(`   Failed:      ${test4Failed}`);
  console.log(`   Success Rate: ${((test4Success / 200) * 100).toFixed(1)}%\n`);

  if (test4Success > 180) {
    console.log("     Pool handled socket failure gracefully!\n");
  } else {
    console.log("   ⚠️  Some calls failed during socket failure\n");
  }

  console.log("═".repeat(70));

  // Final stats
  const finalStats = (client as any).connectionPool?.getStats();

  console.log("\n📊 FINAL POOL STATUS:\n");
  if (finalStats) {
    console.log(`   Connected: ${finalStats.connected}/${finalStats.total}`);
    console.log(`   Healthy:   ${finalStats.healthy}/${finalStats.total}`);
    console.log(`   Errors:    ${finalStats.totalErrors} total\n`);
  }

  await client.disconnect();
  await responder2.disconnect();
  await server.stop();

  console.log("  All failure tests completed!\n");
}

if (require.main === module) {
  testPoolFailure()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Test failed:", error);
      process.exit(1);
    });
}
