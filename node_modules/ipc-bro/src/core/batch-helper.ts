/**
 * Batch Helper - Execute promises with controlled concurrency
 */

export class BatchHelper {
  /**
   * Execute promises in batches with controlled concurrency
   *
   * @param items - Array of items to process
   * @param processor - Function to process each item
   * @param batchSize - Number of concurrent operations (default: 1000)
   */
  static async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 1000,
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((item) => processor(item)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute with controlled concurrency using a pool
   *
   * @param items - Array of items to process
   * @param processor - Function to process each item
   * @param concurrency - Max concurrent operations (default: 100)
   */
  static async processWithConcurrency<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 100,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        results[index] = await processor(items[index]);
      }
    });

    await Promise.all(workers);
    return results;
  }
}
