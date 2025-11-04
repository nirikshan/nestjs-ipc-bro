/**
 * Diagnostic: Check if connection pool is actually being used
 */

import { IPCServer } from "../../core/ipc-server";
import { IPCClient } from "../../core/ipc-client";
import { sleep } from "../utils/benchmark";

async function diagnosticTest() {
  console.log("\n🔍 Connection Pool Diagnostic Test\n");
  console.log("═".repeat(70));

  const server = new IPCServer({
    socketPath: "/tmp/brodox-diagnostic.sock",
    serializer: "msgpack",
    debug: true, // ← Enable debug to see connections
  });

  await server.start();
  console.log("\n✓ Gateway started\n");

  // Create client with pool
  console.log("Creating client with poolSize: 4...\n");

  const client = new IPCClient({
    serviceName: "test-service",
    gatewayPath: "/tmp/brodox-diagnostic.sock",
    serializer: "msgpack",
    poolSize: 4, // ← Pool of 4
    debug: true, // ← Enable debug
  });

  await client.connect();
  console.log("\n✓ Client connected\n");

  await sleep(1000);

  // Check Gateway status
  console.log("═".repeat(70));
  console.log("GATEWAY STATUS:");
  console.log("═".repeat(70));

  const services = server.getConnectedServices();
  console.log(`\nConnected Services: ${services.length}`);

  services.forEach((serviceName) => {
    const service = server.getService(serviceName);
    console.log(`\n📍 Service: ${serviceName}`);
    console.log(`   Methods: [${service?.methods.join(", ")}]`);
    console.log(
      `   Connected at: ${new Date(service!.connectedAt).toISOString()}`
    );
  });

  console.log("\n═".repeat(70));
  console.log("EXPECTED BEHAVIOR:");
  console.log("═".repeat(70));
  console.log("\n  If pool is working:");
  console.log('   - Should see 1 service: "test-service"');
  console.log("   - Gateway logs should show 4 connections");
  console.log("\n❌ If pool is NOT working:");
  console.log('   - Should see 1 service: "test-service"');
  console.log("   - Gateway logs should show 1 connection");
  console.log("\n═".repeat(70));

  // Cleanup
  await client.disconnect();
  await server.stop();

  console.log("\n  Diagnostic complete!\n");
}

if (require.main === module) {
  diagnosticTest()
    .then(() => process.exit(0))
    .catch(console.error);
}
