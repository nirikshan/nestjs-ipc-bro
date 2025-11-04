/**
 * Run All Performance Tests and Generate Report
 */

import * as fs from "fs";
import * as path from "path";
import { runLatencyTest } from "./performance/latency-test";
import { runThroughputTest } from "./performance/throughput-test";
import { runConcurrentTest } from "./performance/concurrent-test";
import { runNestedCallTest } from "./performance/nested-call-test";
import { runStressTest } from "./performance/stress-test";

async function runAllTests() {
  console.log("\n");
  console.log(
    "╔══════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║                                                                  ║"
  );
  console.log(
    "║         BRODOX IPC SYSTEM - PERFORMANCE TEST SUITE              ║"
  );
  console.log(
    "║                                                                  ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════╝"
  );
  console.log("\n");

  const results: any = {
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: require("os").cpus().length,
      memory: `${(require("os").totalmem() / 1024 / 1024 / 1024).toFixed(
        2
      )} GB`,
    },
    tests: {},
  };

  try {
    // Test 1: Latency
    console.log("\n📊 Test 1/5: Latency Test");
    console.log("─".repeat(70));
    results.tests.latency = await runLatencyTest();

    // Test 2: Throughput
    console.log("\n📊 Test 2/5: Throughput Test");
    console.log("─".repeat(70));
    results.tests.throughput = await runThroughputTest();

    // Test 3: Concurrent
    console.log("\n📊 Test 3/5: Concurrent Test");
    console.log("─".repeat(70));
    results.tests.concurrent = await runConcurrentTest();

    // Test 4: Nested Calls
    console.log("\n📊 Test 4/5: Nested Call Test");
    console.log("─".repeat(70));
    results.tests.nested = await runNestedCallTest();

    // Test 5: Stress
    console.log("\n📊 Test 5/5: Stress Test");
    console.log("─".repeat(70));
    results.tests.stress = await runStressTest();

    // Generate summary
    generateSummary(results);

    // Save results
    const filename = `test-results-${Date.now()}.json`;
    const resultsDir = path.join(__dirname, "results");

    // Create results directory if it doesn't exist
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const filepath = path.join(resultsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\n  Results saved to: ${filepath}\n`);
  } catch (error) {
    console.error("\n❌ Test suite failed:", error);
    process.exit(1);
  }
}

function generateSummary(results: any) {
  console.log("\n");
  console.log(
    "╔══════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║                      PERFORMANCE SUMMARY                         ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════╝"
  );
  console.log("");

  // System info
  console.log("💻 SYSTEM:");
  console.log(`   Platform:         ${results.system.platform}`);
  console.log(`   CPUs:             ${results.system.cpus}`);
  console.log(`   Memory:           ${results.system.memory}`);
  console.log(`   Node:             ${results.system.nodeVersion}`);
  console.log("");

  // Latency summary
  const latency1KB = results.tests.latency.result1;
  const latency100KB = results.tests.latency.result3;

  console.log("📈 LATENCY:");
  console.log(
    `   1KB payload:      ${latency1KB.avgLatency.toFixed(
      2
    )} ms avg, P95: ${latency1KB.p95Latency.toFixed(2)} ms`
  );
  console.log(
    `   100KB payload:    ${latency100KB.avgLatency.toFixed(
      2
    )} ms avg, P95: ${latency100KB.p95Latency.toFixed(2)} ms`
  );
  console.log("");

  // Throughput
  const throughput = results.tests.throughput;
  console.log("🚀 THROUGHPUT:");
  console.log(
    `   Sequential:       ${throughput.throughput.toFixed(0)} calls/second`
  );
  console.log("");

  // Concurrent
  const concurrent100 = results.tests.concurrent.result1;
  const concurrent1000 = results.tests.concurrent.result2;
  console.log("⚡ CONCURRENT:");
  console.log(
    `   100 concurrent:   ${concurrent100.avgLatency.toFixed(2)} ms avg latency`
  );
  console.log(
    `   1000 concurrent:  ${concurrent1000.avgLatency.toFixed(
      2
    )} ms avg latency`
  );
  console.log("");

  // Nested
  const nested3 = results.tests.nested.result1;
  const nested10 = results.tests.nested.result2;
  console.log("🔗 NESTED CALLS:");
  console.log(`   Depth 3:          ${nested3.avgLatency.toFixed(2)} ms avg`);
  console.log(`   Depth 10:         ${nested10.avgLatency.toFixed(2)} ms avg`);
  console.log("");

  // Stress
  const stress = results.tests.stress;
  console.log("💪 STRESS TEST:");
  console.log(
    `   50 clients:       ${stress.successfulCalls}/${
      stress.totalCalls
    } successful (${(
      (stress.successfulCalls / stress.totalCalls) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `   Throughput:       ${stress.throughput.toFixed(0)} calls/second`
  );
  console.log("");

  // Performance rating
  const rating = getPerformanceRating(
    latency1KB.avgLatency,
    throughput.throughput
  );
  console.log("⭐ OVERALL RATING:");
  console.log(`   ${rating.emoji} ${rating.label}`);
  console.log(`   ${rating.description}`);
  console.log("");

  // Recommendations
  console.log("💡 RECOMMENDATIONS:");
  const recommendations = getRecommendations(results);
  recommendations.forEach((rec) => {
    console.log(`   ${rec}`);
  });
  console.log("");
}

function getPerformanceRating(avgLatency: number, throughput: number) {
  if (avgLatency < 1 && throughput > 10000) {
    return {
      emoji: "🏆",
      label: "EXCELLENT",
      description: "Sub-millisecond latency with very high throughput",
    };
  } else if (avgLatency < 2 && throughput > 5000) {
    return {
      emoji: "✨",
      label: "GREAT",
      description: "Low latency with high throughput",
    };
  } else if (avgLatency < 5 && throughput > 2000) {
    return {
      emoji: "👍",
      label: "GOOD",
      description: "Acceptable latency and throughput for most use cases",
    };
  } else {
    return {
      emoji: "⚠️",
      label: "NEEDS IMPROVEMENT",
      description: "Consider optimizations (see recommendations)",
    };
  }
}

function getRecommendations(results: any): string[] {
  const recommendations: string[] = [];
  const latency = results.tests.latency.result1.avgLatency;
  const throughput = results.tests.throughput.throughput;
  const stressSuccess =
    results.tests.stress.successfulCalls / results.tests.stress.totalCalls;

  if (latency > 5) {
    recommendations.push(
      "⚡ High latency detected - Consider using MessagePack serialization"
    );
    recommendations.push("⚡ Disable debug mode in production");
  }

  if (throughput < 5000) {
    recommendations.push(
      "🚀 Low throughput - Consider enabling connection pooling"
    );
    recommendations.push(
      "🚀 Implement request batching for high-frequency calls"
    );
  }

  if (stressSuccess < 0.95) {
    recommendations.push(
      "⚠️  High failure rate under stress - Increase timeout values"
    );
    recommendations.push(
      "⚠️  Consider scaling horizontally with multiple Gateway instances"
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("  System is performing well!");
    recommendations.push("  Consider MessagePack for even better performance");
  }

  return recommendations;
}

if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log("  All tests completed successfully!\n");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Test suite failed:", error);
      process.exit(1);
    });
}
