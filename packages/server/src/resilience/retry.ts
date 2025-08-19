/**
 * Retry Pattern Implementation for PEAC Protocol v0.9.6
 *
 * Provides intelligent retry mechanisms with:
 * - Exponential backoff with jitter
 * - Configurable retry policies
 * - Dead letter queue support
 * - Retry metrics and monitoring
 * - Circuit breaker integration
 */

import { logger } from '../logging';
import { prometheus } from '../metrics/prom';
import { CircuitBreaker, CircuitBreakerError } from './circuit-breaker';

export interface RetryConfig {
  name: string;
  maxAttempts: number;
  initialDelay: number; // ms
  maxDelay: number; // ms
  exponentialBase: number; // multiplier for exponential backoff
  jitterType: 'none' | 'fixed' | 'random';
  jitterValue: number; // percentage or fixed ms
  retryableErrors?: string[]; // Error codes/types that should be retried
  nonRetryableErrors?: string[]; // Error codes/types that should NOT be retried
  circuitBreaker?: CircuitBreaker;
}

export interface RetryAttempt {
  attempt: number;
  delay: number;
  error?: Error;
  startTime: number;
  endTime?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: RetryAttempt[];
  totalDuration: number;
}

export class RetryPolicy {
  constructor(private config: RetryConfig) {}

  /**
   * Execute a function with retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const attempts: RetryAttempt[] = [];
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const attemptStart = Date.now();
      const attemptInfo: RetryAttempt = {
        attempt,
        delay: 0,
        startTime: attemptStart,
      };

      try {
        // If circuit breaker is configured, use it
        let result: T;
        if (this.config.circuitBreaker) {
          result = await this.config.circuitBreaker.execute(fn);
        } else {
          result = await fn();
        }

        attemptInfo.endTime = Date.now();
        attempts.push(attemptInfo);

        this.recordMetrics('success', attempt, Date.now() - startTime);

        if (attempt > 1) {
          logger.info(
            {
              retryPolicy: this.config.name,
              attempt,
              totalAttempts: this.config.maxAttempts,
              duration: Date.now() - startTime,
              success: true,
            },
            'Retry succeeded',
          );
        }

        return result;
      } catch (error) {
        attemptInfo.error = error as Error;
        attemptInfo.endTime = Date.now();
        attempts.push(attemptInfo);
        lastError = error as Error;

        // Check if error should be retried
        if (!this.shouldRetry(error as Error, attempt)) {
          this.recordMetrics('failed_non_retryable', attempt, Date.now() - startTime);

          logger.warn(
            {
              retryPolicy: this.config.name,
              attempt,
              error: (error as Error).message,
              retryable: false,
            },
            'Non-retryable error encountered',
          );

          throw error;
        }

        // Don't delay after the last attempt
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          attemptInfo.delay = delay;

          logger.warn(
            {
              retryPolicy: this.config.name,
              attempt,
              totalAttempts: this.config.maxAttempts,
              error: (error as Error).message,
              nextDelay: delay,
            },
            'Retrying after error',
          );

          await this.sleep(delay);
        }
      }
    }

    this.recordMetrics('failed_exhausted', this.config.maxAttempts, Date.now() - startTime);

    logger.error(
      {
        retryPolicy: this.config.name,
        totalAttempts: this.config.maxAttempts,
        duration: Date.now() - startTime,
        finalError: lastError?.message || 'Unknown error',
      },
      'Retry attempts exhausted',
    );

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Determine if an error should be retried
   */
  private shouldRetry(error: Error, attempt: number): boolean {
    // Circuit breaker errors should not be retried
    if (error instanceof CircuitBreakerError) {
      return false;
    }

    // Check attempt limit
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    // Check non-retryable errors first
    if (this.config.nonRetryableErrors?.length) {
      const isNonRetryable = this.config.nonRetryableErrors.some(
        (code) => error.message.includes(code) || error.name.includes(code),
      );
      if (isNonRetryable) {
        return false;
      }
    }

    // Check retryable errors
    if (this.config.retryableErrors?.length) {
      return this.config.retryableErrors.some(
        (code) => error.message.includes(code) || error.name.includes(code),
      );
    }

    // Default: retry most errors except for specific types
    const nonRetryableByDefault = [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'NotFoundError',
      'BadRequestError',
    ];

    return !nonRetryableByDefault.some(
      (type) => error.name.includes(type) || error.constructor.name.includes(type),
    );
  }

  /**
   * Calculate delay for next retry with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    // Base exponential backoff
    const exponentialDelay =
      this.config.initialDelay * Math.pow(this.config.exponentialBase, attempt - 1);

    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);

    // Apply jitter
    let finalDelay = cappedDelay;

    switch (this.config.jitterType) {
      case 'fixed': {
        finalDelay += this.config.jitterValue;
        break;
      }
      case 'random': {
        const jitterAmount = (this.config.jitterValue / 100) * cappedDelay;
        finalDelay += Math.random() * jitterAmount;
        break;
      }
      case 'none':
      default: {
        // No jitter
        break;
      }
    }

    return Math.round(finalDelay);
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Record retry metrics
   */
  private recordMetrics(outcome: string, attempts: number, duration: number): void {
    const labels = {
      retry_policy: this.config.name,
      outcome,
    };

    prometheus.incrementCounter('retry_attempts_total', { ...labels, result: outcome });
    prometheus.setGauge('retry_attempts_count', labels, attempts);
    prometheus.setGauge('retry_duration_ms', labels, duration);
  }

  /**
   * Get configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

/**
 * Predefined retry policies for common scenarios
 */
export const retryPolicies = {
  /**
   * Quick retry for fast-failing operations
   */
  quick: new RetryPolicy({
    name: 'quick',
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    exponentialBase: 2,
    jitterType: 'random',
    jitterValue: 10,
  }),

  /**
   * Standard retry for most operations
   */
  standard: new RetryPolicy({
    name: 'standard',
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 5000,
    exponentialBase: 2,
    jitterType: 'random',
    jitterValue: 20,
  }),

  /**
   * Aggressive retry for critical operations
   */
  aggressive: new RetryPolicy({
    name: 'aggressive',
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    exponentialBase: 1.5,
    jitterType: 'random',
    jitterValue: 25,
  }),

  /**
   * Network-specific retry policy
   */
  network: new RetryPolicy({
    name: 'network',
    maxAttempts: 3,
    initialDelay: 250,
    maxDelay: 2000,
    exponentialBase: 2,
    jitterType: 'random',
    jitterValue: 15,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'],
    nonRetryableErrors: ['ENOTFOUND', '404', '401', '403'],
  }),

  /**
   * Database-specific retry policy
   */
  database: new RetryPolicy({
    name: 'database',
    maxAttempts: 4,
    initialDelay: 500,
    maxDelay: 8000,
    exponentialBase: 2,
    jitterType: 'random',
    jitterValue: 20,
    retryableErrors: ['ECONNRESET', 'CONNECTION_LOST', 'LOCK_TIMEOUT', 'DEADLOCK'],
    nonRetryableErrors: ['CONSTRAINT_VIOLATION', 'DUPLICATE_KEY', 'SYNTAX_ERROR'],
  }),
};

/**
 * Retry decorator function for easy application
 */
export function withRetry<T extends unknown[], R>(
  retryPolicy: RetryPolicy,
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    return retryPolicy.execute(() => fn(...args));
  };
}

/**
 * Utility function to create a custom retry policy
 */
export function createRetryPolicy(config: Partial<RetryConfig> & { name: string }): RetryPolicy {
  const defaultConfig: RetryConfig = {
    name: config.name,
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    exponentialBase: 2,
    jitterType: 'random',
    jitterValue: 20,
  };

  return new RetryPolicy({ ...defaultConfig, ...config });
}

/**
 * Dead letter queue for failed operations
 */
export interface DeadLetterItem {
  id: string;
  operation: string;
  payload: unknown;
  error: string;
  attempts: number;
  createdAt: Date;
  lastAttemptAt: Date;
}

export class DeadLetterQueue {
  private items: Map<string, DeadLetterItem> = new Map();
  private maxItems: number = 1000;

  /**
   * Add failed operation to dead letter queue
   */
  add(operation: string, payload: unknown, error: Error, attempts: number): string {
    const id = `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const item: DeadLetterItem = {
      id,
      operation,
      payload,
      error: error.message,
      attempts,
      createdAt: new Date(),
      lastAttemptAt: new Date(),
    };

    this.items.set(id, item);

    // Clean up old items if we exceed the limit
    if (this.items.size > this.maxItems) {
      const oldestKey = this.items.keys().next().value;
      if (oldestKey !== undefined) {
        this.items.delete(oldestKey);
      }
    }

    prometheus.incrementCounter('dead_letter_queue_items_total', { operation });
    prometheus.setGauge('dead_letter_queue_size', {}, this.items.size);

    logger.warn(
      {
        deadLetterQueue: true,
        itemId: id,
        operation,
        error: error.message,
        attempts,
        queueSize: this.items.size,
      },
      'Item added to dead letter queue',
    );

    return id;
  }

  /**
   * Get all items in the queue
   */
  getAll(): DeadLetterItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Get item by ID
   */
  get(id: string): DeadLetterItem | undefined {
    return this.items.get(id);
  }

  /**
   * Remove item from queue
   */
  remove(id: string): boolean {
    const removed = this.items.delete(id);
    if (removed) {
      prometheus.setGauge('dead_letter_queue_size', {}, this.items.size);
    }
    return removed;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items.clear();
    prometheus.setGauge('dead_letter_queue_size', {}, 0);
  }

  /**
   * Get queue statistics
   */
  getStats(): { size: number; maxItems: number; oldestItem?: Date } {
    const items = Array.from(this.items.values());
    const oldestItem =
      items.length > 0
        ? items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0].createdAt
        : undefined;

    return {
      size: this.items.size,
      maxItems: this.maxItems,
      oldestItem,
    };
  }
}

// Global dead letter queue instance
export const deadLetterQueue = new DeadLetterQueue();
