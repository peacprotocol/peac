/**
 * Bulkhead Pattern Implementation for PEAC Protocol v0.9.6
 *
 * Provides resource isolation and protection with:
 * - Thread pool isolation for different operation types
 * - Semaphore-based resource limiting
 * - Queue management with backpressure
 * - Resource pool monitoring
 * - Graceful degradation under load
 */

import { EventEmitter } from 'events';
import { logger } from '../logging';
import { prometheus } from '../metrics/prom';

export interface BulkheadConfig {
  name: string;
  maxConcurrency: number; // Maximum concurrent operations
  queueSize: number; // Maximum queue size for waiting operations
  timeout: number; // Maximum time to wait in queue (ms)
  rejectionPolicy: 'abort' | 'oldest' | 'caller'; // What to do when full
}

interface QueuedOperation<T> {
  id: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  timeout?: NodeJS.Timeout;
}

export class BulkheadError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'BulkheadError';
  }
}

export class Bulkhead extends EventEmitter {
  private activeTasks: number = 0;
  private queue: QueuedOperation<unknown>[] = [];
  private stats = {
    totalExecuted: 0,
    totalRejected: 0,
    totalTimeouts: 0,
    averageWaitTime: 0,
    peakConcurrency: 0,
  };

  constructor(private config: BulkheadConfig) {
    super();
    this.setupMetrics();
  }

  /**
   * Execute a function with bulkhead protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const operationId = this.generateOperationId();

      // Check if we can execute immediately
      if (this.activeTasks < this.config.maxConcurrency) {
        this.executeImmediately(operationId, fn, resolve, reject);
        return;
      }

      // Check if queue is full
      if (this.queue.length >= this.config.queueSize) {
        this.handleQueueFull(operationId, fn, resolve, reject);
        return;
      }

      // Add to queue
      this.enqueue(operationId, fn, resolve, reject);
    });
  }

  /**
   * Execute operation immediately
   */
  private async executeImmediately<T>(
    operationId: string,
    fn: () => Promise<T>,
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ): Promise<void> {
    this.activeTasks++;
    this.updatePeakConcurrency();

    const startTime = Date.now();

    try {
      this.recordMetrics('started');

      const result = await fn();

      resolve(result);
      this.stats.totalExecuted++;
      this.recordMetrics('completed', Date.now() - startTime);

      logger.debug(
        {
          bulkhead: this.config.name,
          operationId,
          duration: Date.now() - startTime,
          activeTasks: this.activeTasks,
          queueSize: this.queue.length,
        },
        'Bulkhead operation completed',
      );
    } catch (error) {
      reject(error as Error);
      this.recordMetrics('error', Date.now() - startTime);

      logger.warn(
        {
          bulkhead: this.config.name,
          operationId,
          error: (error as Error).message,
          duration: Date.now() - startTime,
        },
        'Bulkhead operation failed',
      );
    } finally {
      this.activeTasks--;
      this.processQueue();
    }
  }

  /**
   * Add operation to queue
   */
  private enqueue<T>(
    operationId: string,
    fn: () => Promise<T>,
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ): void {
    const enqueuedAt = Date.now();
    let timeout: NodeJS.Timeout | undefined;

    // Set up timeout for queued operation
    if (this.config.timeout > 0) {
      timeout = setTimeout(() => {
        this.removeFromQueue(operationId);
        this.stats.totalTimeouts++;
        this.recordMetrics('timeout');

        const error = new BulkheadError(
          `Operation timed out in queue after ${this.config.timeout}ms`,
          'QUEUE_TIMEOUT',
        );
        reject(error);
      }, this.config.timeout);
    }

    const queuedOp: QueuedOperation<T> = {
      id: operationId,
      fn,
      resolve,
      reject,
      enqueuedAt,
      timeout,
    };

    this.queue.push(queuedOp as QueuedOperation<unknown>);
    this.recordMetrics('queued');

    logger.debug(
      {
        bulkhead: this.config.name,
        operationId,
        queueSize: this.queue.length,
        activeTasks: this.activeTasks,
      },
      'Operation queued',
    );
  }

  /**
   * Handle queue full scenario
   */
  private handleQueueFull<T>(
    operationId: string,
    fn: () => Promise<T>,
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ): void {
    switch (this.config.rejectionPolicy) {
      case 'abort': {
        this.stats.totalRejected++;
        this.recordMetrics('rejected');
        reject(new BulkheadError('Bulkhead queue is full', 'QUEUE_FULL'));
        break;
      }

      case 'oldest': {
        // Remove oldest item from queue
        const oldest = this.queue.shift();
        if (oldest) {
          if (oldest.timeout) clearTimeout(oldest.timeout);
          oldest.reject(new BulkheadError('Evicted from queue', 'QUEUE_EVICTED'));
        }
        this.enqueue(operationId, fn, resolve, reject);
        break;
      }

      case 'caller': {
        // Let caller handle rejection
        this.stats.totalRejected++;
        this.recordMetrics('rejected');
        reject(new BulkheadError('Caller runs policy - queue full', 'CALLER_RUNS'));
        break;
      }
    }
  }

  /**
   * Process next item in queue
   */
  private processQueue(): void {
    if (this.queue.length === 0 || this.activeTasks >= this.config.maxConcurrency) {
      return;
    }

    const next = this.queue.shift();
    if (next) {
      if (next.timeout) {
        clearTimeout(next.timeout);
      }

      const waitTime = Date.now() - next.enqueuedAt;
      this.updateAverageWaitTime(waitTime);

      this.executeImmediately(next.id, next.fn, next.resolve, next.reject);
    }
  }

  /**
   * Remove operation from queue by ID
   */
  private removeFromQueue(operationId: string): boolean {
    const index = this.queue.findIndex((op) => op.id === operationId);
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
      if (removed.timeout) {
        clearTimeout(removed.timeout);
      }
      return true;
    }
    return false;
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update peak concurrency tracking
   */
  private updatePeakConcurrency(): void {
    if (this.activeTasks > this.stats.peakConcurrency) {
      this.stats.peakConcurrency = this.activeTasks;
    }
  }

  /**
   * Update average wait time
   */
  private updateAverageWaitTime(waitTime: number): void {
    // Simple moving average
    this.stats.averageWaitTime = (this.stats.averageWaitTime + waitTime) / 2;
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeTasks: this.activeTasks,
      queueSize: this.queue.length,
      utilization: (this.activeTasks / this.config.maxConcurrency) * 100,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): BulkheadConfig {
    return { ...this.config };
  }

  /**
   * Setup Prometheus metrics
   */
  private setupMetrics(): void {
    // Initialize bulkhead metrics
    prometheus.setGauge(
      'bulkhead_max_concurrency',
      { bulkhead: this.config.name },
      this.config.maxConcurrency,
    );
    prometheus.setGauge(
      'bulkhead_max_queue_size',
      { bulkhead: this.config.name },
      this.config.queueSize,
    );
  }

  /**
   * Record operation metrics
   */
  private recordMetrics(event: string, duration?: number): void {
    const labels = { bulkhead: this.config.name };

    switch (event) {
      case 'started': {
        prometheus.incrementCounter('bulkhead_operations_total', { ...labels, status: 'started' });
        break;
      }
      case 'completed': {
        prometheus.incrementCounter('bulkhead_operations_total', {
          ...labels,
          status: 'completed',
        });
        if (duration) {
          prometheus.setGauge('bulkhead_operation_duration_ms', labels, duration);
        }
        break;
      }
      case 'error': {
        prometheus.incrementCounter('bulkhead_operations_total', { ...labels, status: 'error' });
        if (duration) {
          prometheus.setGauge('bulkhead_operation_duration_ms', labels, duration);
        }
        break;
      }
      case 'queued': {
        prometheus.incrementCounter('bulkhead_operations_total', { ...labels, status: 'queued' });
        break;
      }
      case 'rejected': {
        prometheus.incrementCounter('bulkhead_operations_total', { ...labels, status: 'rejected' });
        break;
      }
      case 'timeout': {
        prometheus.incrementCounter('bulkhead_operations_total', { ...labels, status: 'timeout' });
        break;
      }
    }

    // Update current state metrics
    prometheus.setGauge('bulkhead_active_tasks', labels, this.activeTasks);
    prometheus.setGauge('bulkhead_queue_size', labels, this.queue.length);
    prometheus.setGauge(
      'bulkhead_utilization_percent',
      labels,
      (this.activeTasks / this.config.maxConcurrency) * 100,
    );
  }

  /**
   * Clear all queued operations (for shutdown)
   */
  clear(): void {
    this.queue.forEach((op) => {
      if (op.timeout) clearTimeout(op.timeout);
      op.reject(new BulkheadError('Bulkhead cleared', 'CLEARED'));
    });
    this.queue = [];
  }
}

/**
 * Bulkhead registry for managing multiple bulkheads
 */
export class BulkheadRegistry {
  private bulkheads: Map<string, Bulkhead> = new Map();

  /**
   * Create or get a bulkhead
   */
  getOrCreate(name: string, config?: Partial<BulkheadConfig>): Bulkhead {
    if (this.bulkheads.has(name)) {
      return this.bulkheads.get(name)!;
    }

    const defaultConfig: BulkheadConfig = {
      name,
      maxConcurrency: 10,
      queueSize: 50,
      timeout: 5000, // 5 seconds
      rejectionPolicy: 'abort',
    };

    const finalConfig = { ...defaultConfig, ...config };
    const bulkhead = new Bulkhead(finalConfig);

    this.bulkheads.set(name, bulkhead);
    return bulkhead;
  }

  /**
   * Get all registered bulkheads
   */
  getAll(): Map<string, Bulkhead> {
    return new Map(this.bulkheads);
  }

  /**
   * Get health status of all bulkheads
   */
  getHealthStatus(): Record<string, unknown> {
    const status: Record<string, unknown> = {};

    for (const [name, bulkhead] of this.bulkheads) {
      status[name] = bulkhead.getStats();
    }

    return status;
  }

  /**
   * Clear all bulkheads (for shutdown)
   */
  clear(): void {
    for (const bulkhead of this.bulkheads.values()) {
      bulkhead.clear();
    }
    this.bulkheads.clear();
  }
}

// Global bulkhead registry
export const bulkheadRegistry = new BulkheadRegistry();

/**
 * Predefined bulkheads for common operations
 */
export const bulkheads = {
  // Database operations
  database: bulkheadRegistry.getOrCreate('database', {
    maxConcurrency: 15,
    queueSize: 100,
    timeout: 10000,
    rejectionPolicy: 'oldest',
  }),

  // External API calls
  external: bulkheadRegistry.getOrCreate('external', {
    maxConcurrency: 5,
    queueSize: 25,
    timeout: 8000,
    rejectionPolicy: 'abort',
  }),

  // Payment processing
  payments: bulkheadRegistry.getOrCreate('payments', {
    maxConcurrency: 8,
    queueSize: 50,
    timeout: 15000,
    rejectionPolicy: 'oldest',
  }),

  // Webhook processing
  webhooks: bulkheadRegistry.getOrCreate('webhooks', {
    maxConcurrency: 20,
    queueSize: 200,
    timeout: 5000,
    rejectionPolicy: 'oldest',
  }),
};
