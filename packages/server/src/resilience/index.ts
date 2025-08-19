/**
 * PEAC Protocol v0.9.6 Resilience Module
 *
 * Comprehensive resilience patterns for enterprise-grade reliability:
 * - Circuit Breaker: Prevents cascading failures
 * - Retry: Intelligent retry with exponential backoff
 * - Timeout: Operation timeout management
 * - Bulkhead: Resource isolation and protection
 * - Dead Letter Queue: Failed operation tracking
 *
 * All patterns integrate with monitoring and observability.
 */

export * from './circuit-breaker';
export * from './retry';
export * from './timeout';
export * from './bulkhead';

import { circuitBreakerRegistry } from './circuit-breaker';
import { RetryPolicy, retryPolicies, deadLetterQueue } from './retry';
import { timeoutPolicies, withTimeout } from './timeout';
import { bulkheadRegistry } from './bulkhead';
import { logger } from '../logging';

/**
 * Combined resilience wrapper that applies multiple patterns
 */
export interface ResilienceConfig {
  circuitBreaker?: string; // Circuit breaker name
  retry?: RetryPolicy | string; // Retry policy or name
  timeout?: number | string; // Timeout duration or policy name
  bulkhead?: string; // Bulkhead name
}

/**
 * Execute function with combined resilience patterns
 */
export async function withResilience<T>(
  fn: () => Promise<T>,
  config: ResilienceConfig,
  operationName?: string,
): Promise<T> {
  let wrappedFn = fn;

  // Apply bulkhead isolation first (outermost)
  if (config.bulkhead) {
    const bulkhead = bulkheadRegistry.getOrCreate(config.bulkhead);
    const originalFn = wrappedFn;
    wrappedFn = () => bulkhead.execute(originalFn);
  }

  // Apply timeout protection
  if (config.timeout) {
    const originalFn = wrappedFn;
    const timeoutConfig =
      typeof config.timeout === 'number'
        ? { name: operationName || 'resilience', duration: config.timeout, abortOnTimeout: true }
        : timeoutPolicies[config.timeout as keyof typeof timeoutPolicies];

    if (timeoutConfig) {
      wrappedFn = () => withTimeout(originalFn, timeoutConfig);
    }
  }

  // Apply circuit breaker protection
  if (config.circuitBreaker) {
    const circuitBreaker = circuitBreakerRegistry.getOrCreate(config.circuitBreaker);
    const originalFn = wrappedFn;
    wrappedFn = () => circuitBreaker.execute(originalFn);
  }

  // Apply retry logic (innermost)
  if (config.retry) {
    const retryPolicy =
      typeof config.retry === 'string'
        ? retryPolicies[config.retry as keyof typeof retryPolicies]
        : config.retry;

    if (retryPolicy) {
      const originalFn = wrappedFn;
      wrappedFn = () => retryPolicy.execute(originalFn);
    }
  }

  try {
    return await wrappedFn();
  } catch (error) {
    // Add to dead letter queue for critical operations
    if (operationName) {
      deadLetterQueue.add(
        operationName,
        { config },
        error as Error,
        1, // Will be updated by retry policy if used
      );
    }
    throw error;
  }
}

/**
 * Predefined resilience configurations for common scenarios
 */
export const resilienceConfigs = {
  /**
   * Critical database operations
   */
  criticalDb: {
    circuitBreaker: 'database',
    retry: 'database',
    timeout: 'database',
    bulkhead: 'database',
  },

  /**
   * External API calls
   */
  externalApi: {
    circuitBreaker: 'external-api',
    retry: 'network',
    timeout: 'network',
    bulkhead: 'external',
  },

  /**
   * Payment processing
   */
  payments: {
    circuitBreaker: 'payments',
    retry: 'standard',
    timeout: 'long',
    bulkhead: 'payments',
  },

  /**
   * Quick operations with minimal resilience
   */
  quick: {
    retry: 'quick',
    timeout: 'quick',
  },

  /**
   * Background job processing
   */
  backgroundJob: {
    retry: 'aggressive',
    timeout: 'long',
    bulkhead: 'background',
  },
};

/**
 * Health check for all resilience components
 */
export function getResilienceHealth() {
  return {
    circuitBreakers: circuitBreakerRegistry.getHealthStatus(),
    bulkheads: bulkheadRegistry.getHealthStatus(),
    deadLetterQueue: deadLetterQueue.getStats(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Graceful shutdown for all resilience components
 */
export function shutdownResilience(): Promise<void> {
  return new Promise((resolve) => {
    logger.info('Shutting down resilience components...');

    // Clear all bulkheads
    bulkheadRegistry.clear();

    // Circuit breakers will naturally close over time
    // Dead letter queue items remain for manual processing

    logger.info('Resilience components shutdown complete');
    resolve();
  });
}

/**
 * Initialize resilience monitoring
 */
export function initializeResilience(): void {
  logger.info('Initializing resilience patterns...');

  // Set up default circuit breakers
  circuitBreakerRegistry.getOrCreate('database', {
    failureThreshold: 60, // 60% failure rate
    successThreshold: 3,
    timeout: 30000, // 30 seconds
    monitoringPeriod: 60000,
    volumeThreshold: 5,
  });

  circuitBreakerRegistry.getOrCreate('external-api', {
    failureThreshold: 50, // 50% failure rate
    successThreshold: 2,
    timeout: 20000, // 20 seconds
    monitoringPeriod: 60000,
    volumeThreshold: 3,
  });

  circuitBreakerRegistry.getOrCreate('payments', {
    failureThreshold: 40, // 40% failure rate
    successThreshold: 5,
    timeout: 60000, // 1 minute
    monitoringPeriod: 120000, // 2 minute window
    volumeThreshold: 3,
  });

  logger.info('Resilience patterns initialized');
}

/**
 * Decorator for applying resilience patterns to class methods
 */
export function Resilient(config: ResilienceConfig) {
  return function <T extends unknown[], R>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>,
  ) {
    const method = descriptor.value!;

    descriptor.value = async function (...args: T): Promise<R> {
      return withResilience(
        () => method.apply(this, args),
        config,
        `${target.constructor.name}.${propertyName}`,
      );
    };
  };
}

// Initialize on module load
initializeResilience();
