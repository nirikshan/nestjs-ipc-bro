/**
 * Batch Helper - Execute promises with controlled concurrency
 */
export declare class BatchHelper {
    /**
     * Execute promises in batches with controlled concurrency
     *
     * @param items - Array of items to process
     * @param processor - Function to process each item
     * @param batchSize - Number of concurrent operations (default: 1000)
     */
    static processBatch<T, R>(items: T[], processor: (item: T) => Promise<R>, batchSize?: number): Promise<R[]>;
    /**
     * Execute with controlled concurrency using a pool
     *
     * @param items - Array of items to process
     * @param processor - Function to process each item
     * @param concurrency - Max concurrent operations (default: 100)
     */
    static processWithConcurrency<T, R>(items: T[], processor: (item: T) => Promise<R>, concurrency?: number): Promise<R[]>;
}
