/**
 * Timeout Pattern Implementation for PEAC Protocol v0.9.6
 *
 * Provides comprehensive timeout management with:
 * - Configurable timeout policies
 * - Graceful cancellation support
 * - Timeout metrics and monitoring
 * - Resource cleanup on timeout
 * - Integration with other resilience patterns
 */

import { logger } from '../logging';
import { prometheus } from '../metrics/prom';

export interface TimeoutConfig {
  name: string;
  duration: number; // timeout in milliseconds
  abortOnTimeout: boolean; // whether to abort the operation
  cleanupFn?: () => void | Promise<void>; // cleanup function to call on timeout
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public timeoutDuration: number,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Execute a function with timeout protection
 */
export async function withTimeout<T>(fn: () => Promise<T>, config: TimeoutConfig): Promise<T> {
  const startTime = Date.now();

  return new Promise<T>((resolve, reject) => {
    let completed = false;

    // Set up timeout
    const timeoutId = setTimeout(async () => {
      if (completed) return;

      completed = true;
      const duration = Date.now() - startTime;

      // Record timeout metrics
      prometheus.incrementCounter('timeout_operations_total', {
        timeout_policy: config.name,
        result: 'timeout',
      });
      prometheus.setGauge(
        'timeout_duration_ms',
        {
          timeout_policy: config.name,
        },
        duration,
      );

      // Run cleanup if provided
      if (config.cleanupFn) {
        try {
          await config.cleanupFn();
        } catch (cleanupError) {
          logger.warn(
            {
              timeoutPolicy: config.name,
              duration,
              cleanupError: (cleanupError as Error).message,
            },
            'Timeout cleanup failed',
          );
        }
      }

      const error = new TimeoutError(
        `Operation timed out after ${config.duration}ms for policy: ${config.name}`,
        config.duration,
      );

      logger.warn(
        {
          timeoutPolicy: config.name,
          duration,
          timeoutDuration: config.duration,
          operation: 'timeout',
        },
        'Operation timed out',
      );

      reject(error);
    }, config.duration);

    // Execute the function
    fn()
      .then((result) => {
        if (completed) return;

        completed = true;
        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;

        // Record success metrics
        prometheus.incrementCounter('timeout_operations_total', {
          timeout_policy: config.name,
          result: 'success',
        });
        prometheus.setGauge(
          'timeout_duration_ms',
          {
            timeout_policy: config.name,
          },
          duration,
        );

        resolve(result);
      })
      .catch((error) => {
        if (completed) return;

        completed = true;
        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;

        // Record error metrics
        prometheus.incrementCounter('timeout_operations_total', {
          timeout_policy: config.name,
          result: 'error',
        });
        prometheus.setGauge(
          'timeout_duration_ms',
          {
            timeout_policy: config.name,
          },
          duration,
        );

        reject(error);
      });
  });
}

/**
 * Predefined timeout policies
 */
export const timeoutPolicies = {
  /**
   * Quick timeout for fast operations
   */
  quick: {
    name: 'quick',
    duration: 2000, // 2 seconds
    abortOnTimeout: true,
  },

  /**
   * Standard timeout for most operations
   */
  standard: {
    name: 'standard',
    duration: 10000, // 10 seconds
    abortOnTimeout: true,
  },

  /**
   * Long timeout for heavy operations
   */
  long: {
    name: 'long',
    duration: 30000, // 30 seconds
    abortOnTimeout: true,
  },

  /**
   * Network-specific timeout
   */
  network: {
    name: 'network',
    duration: 5000, // 5 seconds
    abortOnTimeout: true,
  },

  /**
   * Database timeout
   */
  database: {
    name: 'database',
    duration: 15000, // 15 seconds
    abortOnTimeout: true,
  },
};

/**
 * Timeout decorator function
 */
export function withTimeoutDecorator<T extends unknown[], R>(config: TimeoutConfig) {
  return function (
    _target: unknown,
    _propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>,
  ) {
    const method = descriptor.value!;

    descriptor.value = async function (...args: T): Promise<R> {
      return withTimeout(() => method.apply(this, args), config);
    };
  };
}

/**
 * Create a timeout-wrapped version of a function
 */
export function createTimeoutWrapper<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  config: TimeoutConfig,
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    return withTimeout(() => fn(...args), config);
  };
}
