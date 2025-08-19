import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerError,
  circuitBreakerRegistry,
} from '../../src/resilience/circuit-breaker';
import { RetryPolicy, retryPolicies, withRetry, deadLetterQueue } from '../../src/resilience/retry';
import { withTimeout, TimeoutError, timeoutPolicies } from '../../src/resilience/timeout';
import { Bulkhead, BulkheadError, bulkheadRegistry } from '../../src/resilience/bulkhead';
import { withResilience, resilienceConfigs, getResilienceHealth } from '../../src/resilience';

describe('Resilience Patterns', () => {
  beforeEach(() => {
    circuitBreakerRegistry.clear();
    bulkheadRegistry.clear();
    deadLetterQueue.clear();
    jest.clearAllMocks();
  });

  describe('Circuit Breaker', () => {
    it('should start in CLOSED state', () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 50,
        successThreshold: 3,
        timeout: 1000,
        monitoringPeriod: 5000,
        volumeThreshold: 3,
      });

      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open after failure threshold is reached', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 50, // 50% failure rate
        successThreshold: 3,
        timeout: 1000,
        monitoringPeriod: 5000,
        volumeThreshold: 3,
      });

      const failingFn = jest.fn().mockRejectedValue(new Error('Test error'));

      // Execute enough failures to trigger opening
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject requests when OPEN', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 50,
        successThreshold: 3,
        timeout: 1000,
        monitoringPeriod: 5000,
        volumeThreshold: 1,
      });

      breaker.forceState(CircuitBreakerState.OPEN);

      const fn = jest.fn().mockResolvedValue('success');

      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 50,
        successThreshold: 3,
        timeout: 100, // Short timeout for testing
        monitoringPeriod: 5000,
        volumeThreshold: 1,
      });

      breaker.forceState(CircuitBreakerState.OPEN);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      const fn = jest.fn().mockResolvedValue('success');
      await breaker.execute(fn);

      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should track statistics correctly', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 50,
        successThreshold: 3,
        timeout: 1000,
        monitoringPeriod: 5000,
        volumeThreshold: 3,
      });

      const successFn = jest.fn().mockResolvedValue('success');
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      await breaker.execute(successFn);
      try {
        await breaker.execute(failFn);
      } catch (error) {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.requests).toBe(2);
      expect(stats.successes).toBe(1);
      expect(stats.failures).toBe(1);
      expect(stats.failureRate).toBe(0.5);
    });
  });

  describe('Retry Policy', () => {
    it('should retry on retryable errors', async () => {
      const policy = retryPolicies.quick;
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Retryable error'))
        .mockResolvedValue('success');

      const result = await policy.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const policy = retryPolicies.quick;
      const error = new Error('ValidationError');
      error.name = 'ValidationError';
      const fn = jest.fn().mockRejectedValue(error);

      await expect(policy.execute(fn)).rejects.toThrow('ValidationError');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw last error', async () => {
      const policy = retryPolicies.quick;
      const fn = jest.fn().mockRejectedValue(new Error('Persistent error'));

      await expect(policy.execute(fn)).rejects.toThrow('Persistent error');
      expect(fn).toHaveBeenCalledTimes(3); // quick policy has 3 max attempts
    });

    it('should apply exponential backoff with jitter', async () => {
      const policy = new RetryPolicy({
        name: 'test',
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        exponentialBase: 2,
        jitterType: 'random',
        jitterValue: 10,
      });

      const startTime = Date.now();
      const fn = jest.fn().mockRejectedValue(new Error('Test error'));

      try {
        await policy.execute(fn);
      } catch (error) {
        // Expected
      }

      const duration = Date.now() - startTime;
      // Should take at least the base delays (100 + 200 = 300ms minimum)
      expect(duration).toBeGreaterThan(200);
    });

    it('should work with withRetry decorator', async () => {
      const originalFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Retry me'))
        .mockResolvedValue('success');

      const wrappedFn = withRetry(retryPolicies.quick, originalFn);
      const result = await wrappedFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('Timeout', () => {
    it('should resolve if operation completes in time', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const config = { name: 'test', duration: 1000, abortOnTimeout: true };

      const result = await withTimeout(fn, config);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should timeout and reject if operation takes too long', async () => {
      const fn = jest
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('late'), 200)));
      const config = { name: 'test', duration: 100, abortOnTimeout: true };

      await expect(withTimeout(fn, config)).rejects.toThrow(TimeoutError);
    });

    it('should call cleanup function on timeout', async () => {
      const cleanupFn = jest.fn();
      const fn = jest
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('late'), 200)));
      const config = {
        name: 'test',
        duration: 100,
        abortOnTimeout: true,
        cleanupFn,
      };

      await expect(withTimeout(fn, config)).rejects.toThrow(TimeoutError);

      // Give cleanup time to execute
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(cleanupFn).toHaveBeenCalled();
    });
  });

  describe('Bulkhead', () => {
    it('should execute immediately when under capacity', async () => {
      const bulkhead = new Bulkhead({
        name: 'test',
        maxConcurrency: 5,
        queueSize: 10,
        timeout: 1000,
        rejectionPolicy: 'abort',
      });

      const fn = jest.fn().mockResolvedValue('success');
      const result = await bulkhead.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should queue operations when at capacity', async () => {
      const bulkhead = new Bulkhead({
        name: 'test',
        maxConcurrency: 1,
        queueSize: 5,
        timeout: 1000,
        rejectionPolicy: 'abort',
      });

      let resolve1: (value: string) => void;
      const promise1 = new Promise<string>((resolve) => {
        resolve1 = resolve;
      });
      const fn1 = jest.fn().mockReturnValue(promise1);

      const fn2 = jest.fn().mockResolvedValue('second');

      // Start first operation (will occupy the single slot)
      const execution1 = bulkhead.execute(fn1);

      // Start second operation (should be queued)
      const execution2 = bulkhead.execute(fn2);

      // Check that second operation is queued
      expect(bulkhead.getStats().queueSize).toBe(1);

      // Complete first operation
      resolve1!('first');
      await execution1;

      // Second operation should now execute
      const result2 = await execution2;
      expect(result2).toBe('second');
    });

    it('should reject when queue is full', async () => {
      const bulkhead = new Bulkhead({
        name: 'test',
        maxConcurrency: 1,
        queueSize: 1,
        timeout: 1000,
        rejectionPolicy: 'abort',
      });

      // Fill capacity and queue
      const longRunningFn = jest
        .fn()
        .mockReturnValue(new Promise((resolve) => setTimeout(() => resolve('done'), 500)));
      const quickFn = jest.fn().mockResolvedValue('quick');

      // Start operations
      const execution1 = bulkhead.execute(longRunningFn); // Takes the slot
      const execution2 = bulkhead.execute(quickFn); // Goes to queue

      // This should be rejected
      await expect(bulkhead.execute(quickFn)).rejects.toThrow(BulkheadError);

      // Clean up
      await execution1;
      await execution2;
    });

    it('should timeout queued operations', async () => {
      const bulkhead = new Bulkhead({
        name: 'test',
        maxConcurrency: 1,
        queueSize: 5,
        timeout: 100, // Short timeout
        rejectionPolicy: 'abort',
      });

      // Block the bulkhead with a long-running operation
      const blockingFn = jest
        .fn()
        .mockReturnValue(new Promise((resolve) => setTimeout(() => resolve('blocking'), 500)));
      const quickFn = jest.fn().mockResolvedValue('quick');

      // Start blocking operation
      const blockingExecution = bulkhead.execute(blockingFn);

      // Queue operation that should timeout
      await expect(bulkhead.execute(quickFn)).rejects.toThrow(BulkheadError);

      // Clean up
      await blockingExecution;
    });

    it('should track statistics correctly', async () => {
      const bulkhead = new Bulkhead({
        name: 'test',
        maxConcurrency: 2,
        queueSize: 5,
        timeout: 1000,
        rejectionPolicy: 'abort',
      });

      const fn = jest.fn().mockResolvedValue('success');
      await bulkhead.execute(fn);

      const stats = bulkhead.getStats();
      expect(stats.totalExecuted).toBe(1);
      expect(stats.activeTasks).toBe(0);
      expect(stats.utilization).toBe(0);
    });
  });

  describe('Combined Resilience', () => {
    it('should apply multiple patterns together', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');

      const config = {
        retry: 'quick',
        timeout: 'standard',
        bulkhead: 'test',
      };

      const result = await withResilience(fn, config, 'test.operation');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2); // Once failed, once succeeded
    });

    it('should handle circuit breaker integration', async () => {
      // Pre-create a circuit breaker
      const breaker = circuitBreakerRegistry.getOrCreate('test-breaker');
      breaker.forceState(CircuitBreakerState.OPEN);

      const fn = jest.fn().mockResolvedValue('success');
      const config = {
        circuitBreaker: 'test-breaker',
      };

      await expect(withResilience(fn, config, 'test.operation')).rejects.toThrow(
        CircuitBreakerError,
      );

      expect(fn).not.toHaveBeenCalled();
    });

    it('should provide health status for all components', () => {
      // Create some components to check
      circuitBreakerRegistry.getOrCreate('test-cb');
      bulkheadRegistry.getOrCreate('test-bulkhead');

      const health = getResilienceHealth();

      expect(health).toHaveProperty('circuitBreakers');
      expect(health).toHaveProperty('bulkheads');
      expect(health).toHaveProperty('deadLetterQueue');
      expect(health).toHaveProperty('timestamp');
      expect(health.circuitBreakers).toHaveProperty('test-cb');
      expect(health.bulkheads).toHaveProperty('test-bulkhead');
    });
  });

  describe('Dead Letter Queue', () => {
    it('should add failed operations', () => {
      const error = new Error('Test failure');
      const id = deadLetterQueue.add('test.operation', { data: 'test' }, error, 3);

      expect(id).toMatch(/^dlq_/);

      const item = deadLetterQueue.get(id);
      expect(item).toBeDefined();
      expect(item!.operation).toBe('test.operation');
      expect(item!.error).toBe('Test failure');
      expect(item!.attempts).toBe(3);
    });

    it('should limit queue size', () => {
      // Add more than max items
      for (let i = 0; i < 1200; i++) {
        deadLetterQueue.add(`operation.${i}`, { index: i }, new Error(`Error ${i}`), 1);
      }

      const stats = deadLetterQueue.getStats();
      expect(stats.size).toBe(1000); // Should be capped at max
    });

    it('should provide queue statistics', () => {
      deadLetterQueue.add('test.op', {}, new Error('Test'), 1);

      const stats = deadLetterQueue.getStats();
      expect(stats.size).toBe(1);
      expect(stats.maxItems).toBe(1000);
      expect(stats.oldestItem).toBeDefined();
    });
  });

  describe('Predefined Configurations', () => {
    it('should have valid resilience configurations', () => {
      expect(resilienceConfigs.criticalDb).toBeDefined();
      expect(resilienceConfigs.externalApi).toBeDefined();
      expect(resilienceConfigs.payments).toBeDefined();
      expect(resilienceConfigs.quick).toBeDefined();
    });

    it('should have predefined retry policies', () => {
      expect(retryPolicies.quick).toBeDefined();
      expect(retryPolicies.standard).toBeDefined();
      expect(retryPolicies.aggressive).toBeDefined();
      expect(retryPolicies.network).toBeDefined();
      expect(retryPolicies.database).toBeDefined();
    });

    it('should have predefined timeout policies', () => {
      expect(timeoutPolicies.quick).toBeDefined();
      expect(timeoutPolicies.standard).toBeDefined();
      expect(timeoutPolicies.long).toBeDefined();
      expect(timeoutPolicies.network).toBeDefined();
      expect(timeoutPolicies.database).toBeDefined();
    });
  });
});
