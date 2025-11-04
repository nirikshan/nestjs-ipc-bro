"use strict";
/**
 * Batch Helper - Execute promises with controlled concurrency
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchHelper = void 0;
class BatchHelper {
    /**
     * Execute promises in batches with controlled concurrency
     *
     * @param items - Array of items to process
     * @param processor - Function to process each item
     * @param batchSize - Number of concurrent operations (default: 1000)
     */
    static async processBatch(items, processor, batchSize = 1000) {
        const results = [];
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map((item) => processor(item)));
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
    static async processWithConcurrency(items, processor, concurrency = 100) {
        const results = new Array(items.length);
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
exports.BatchHelper = BatchHelper;
