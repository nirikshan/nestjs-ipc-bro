/**
 * Benchmarking Utilities
 */

export interface BenchmarkResult {
  name: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  duration: number; // ms
  avgLatency: number; // ms
  minLatency: number; // ms
  maxLatency: number; // ms
  p50Latency: number; // ms (median)
  p95Latency: number; // ms
  p99Latency: number; // ms
  throughput: number; // calls/second
  memoryUsed: number; // MB
}

export class Benchmark {
  private latencies: number[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private successCount: number = 0;
  private failureCount: number = 0;
  private memoryBefore: number = 0;

  constructor(private name: string) {}

  start(): void {
    this.startTime = Date.now();
    this.memoryBefore = process.memoryUsage().heapUsed;
  }

  recordCall(latency: number, success: boolean = true): void {
    this.latencies.push(latency);
    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }
  }

  end(): BenchmarkResult {
    this.endTime = Date.now();
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsed = (memoryAfter - this.memoryBefore) / 1024 / 1024; // MB

    const duration = this.endTime - this.startTime;
    const totalCalls = this.successCount + this.failureCount;

    // Calculate percentiles
    const sorted = [...this.latencies].sort((a, b) => a - b);

    const result: BenchmarkResult = {
      name: this.name,
      totalCalls,
      successfulCalls: this.successCount,
      failedCalls: this.failureCount,
      duration,
      avgLatency: this.average(this.latencies),
      minLatency: Math.min(...this.latencies),
      maxLatency: Math.max(...this.latencies),
      p50Latency: this.percentile(sorted, 50),
      p95Latency: this.percentile(sorted, 95),
      p99Latency: this.percentile(sorted, 99),
      throughput: (totalCalls / duration) * 1000, // calls/second
      memoryUsed,
    };

    return result;
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  static formatResult(result: BenchmarkResult): string {
    return `
╔════════════════════════════════════════════════════════════════
║ ${result.name}
╠════════════════════════════════════════════════════════════════
║ Total Calls:       ${result.totalCalls.toLocaleString()}
║ Successful:        ${result.successfulCalls.toLocaleString()} (${((result.successfulCalls / result.totalCalls) * 100).toFixed(2)}%)
║ Failed:            ${result.failedCalls.toLocaleString()}
║ Duration:          ${result.duration.toLocaleString()} ms
║ 
║ LATENCY (ms):
║   Average:         ${result.avgLatency.toFixed(2)} ms
║   Min:             ${result.minLatency.toFixed(2)} ms
║   Max:             ${result.maxLatency.toFixed(2)} ms
║   P50 (median):    ${result.p50Latency.toFixed(2)} ms
║   P95:             ${result.p95Latency.toFixed(2)} ms
║   P99:             ${result.p99Latency.toFixed(2)} ms
║ 
║ THROUGHPUT:        ${result.throughput.toFixed(0)} calls/second
║ MEMORY USED:       ${result.memoryUsed.toFixed(2)} MB
╚════════════════════════════════════════════════════════════════
`;
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
