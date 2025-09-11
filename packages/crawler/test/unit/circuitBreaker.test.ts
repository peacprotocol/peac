/**
 * @peac/crawler v0.9.12.1 - Circuit breaker unit tests
 * Tests for closed/open/half-open states with thresholds
 */

import { CircuitBreaker, BreakerState } from '../../src/circuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
  });
  let stateChanges: BreakerState[] = [];

  beforeEach(() => {
    stateChanges = [];
    breaker = new CircuitBreaker(
      {
        timeout: 100,
        errorThreshold: 3,
        resetMs: 200,
        successThreshold: 2,
      },
      (state) => stateChanges.push(state)
    );
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
      expect(breaker.isOpen()).toBe(false);
    });

    it('should return initial stats', () => {
      const stats = breaker.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.nextAttempt).toBeUndefined();
    });
  });

  describe('closed state behavior', () => {
    it('should execute successful operations', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await breaker.fire(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe('closed');
    });

    it('should track failures but stay closed below threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));

      // First failure
      await expect(breaker.fire(mockFn)).rejects.toThrow('test error');
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getStats().failures).toBe(1);

      // Second failure
      await expect(breaker.fire(mockFn)).rejects.toThrow('test error');
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getStats().failures).toBe(2);
    });

    it('should open after reaching error threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));

      // Fail up to threshold
      for (let i = 0; i < 3; i++) {
        await expect(breaker.fire(mockFn)).rejects.toThrow('test error');
      }

      expect(breaker.getState()).toBe('open');
      expect(stateChanges).toContain('open');
    });

    it('should reset failure count on success', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValueOnce('success');

      // Two failures
      await expect(breaker.fire(mockFn)).rejects.toThrow();
      await expect(breaker.fire(mockFn)).rejects.toThrow();
      expect(breaker.getStats().failures).toBe(2);

      // Success should reset
      await breaker.fire(mockFn);
      expect(breaker.getStats().failures).toBe(0);
      expect(breaker.getState()).toBe('closed');
    });

    it('should handle timeouts', async () => {
      const mockFn = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200)); // Longer than timeout
        return 'success';
      });

      await expect(breaker.fire(mockFn)).rejects.toThrow('circuit_timeout');
      expect(breaker.getStats().failures).toBe(1);
    });
  });

  describe('open state behavior', () => {
    beforeEach(async () => {
      // Force breaker open
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.fire(mockFn)).rejects.toThrow();
      }
      expect(breaker.getState()).toBe('open');
    });

    it('should reject calls immediately when open', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      await expect(breaker.fire(mockFn)).rejects.toThrow('circuit_open');

      expect(mockFn).not.toHaveBeenCalled();
      expect(breaker.getState()).toBe('open');
    });

    it('should transition to half-open after reset time', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });
      const mockFn = jest.fn().mockResolvedValue('success');

      // Advance past the reset window deterministically
      const resetMs = 200;
      await jest.advanceTimersByTimeAsync(resetMs + 10);
      
      // Next call should transition to half-open
      await breaker.fire(mockFn);
      await Promise.resolve(); // flush microtasks

      expect(breaker.getState()).toBe('closed'); // Should close immediately on success
      expect(stateChanges).toContain('half-open');
    });

    it('should allow pre-opening via preOpen method', () => {
      // Start with closed breaker
      const freshBreaker = new CircuitBreaker();
      expect(freshBreaker.getState()).toBe('closed');

      // Pre-open it
      freshBreaker.preOpen();
      expect(freshBreaker.getState()).toBe('open');
    });
  });

  describe('half-open state behavior', () => {
    beforeEach(async () => {
      // Force breaker open
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.fire(mockFn)).rejects.toThrow();
      }

      // Wait for reset and trigger half-open
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Make call to enter half-open state
      const successFn = jest.fn().mockResolvedValue('success');
      await breaker.fire(successFn);

      // Reset for testing (need to manually set half-open for clean tests)
      breaker = new CircuitBreaker(
        {
          timeout: 100,
          errorThreshold: 3,
          resetMs: 200,
          successThreshold: 2,
        },
        (state) => stateChanges.push(state)
      );

      // Force into half-open state by manipulating internal state
      (breaker as any).state = 'half-open';
      (breaker as any).failures = 3;
    });

    it('should close after reaching success threshold', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      // First success in half-open
      await breaker.fire(mockFn);
      expect(breaker.getState()).toBe('half-open');

      // Second success should close the circuit
      await breaker.fire(mockFn);
      expect(breaker.getState()).toBe('closed');
      expect(stateChanges).toContain('closed');
    });

    it('should reopen on failure in half-open state', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));

      await expect(breaker.fire(mockFn)).rejects.toThrow('test error');

      expect(breaker.getState()).toBe('open');
      expect(stateChanges).toContain('open');
    });
  });

  describe('force operations', () => {
    it('should force close from any state', async () => {
      // Open the breaker
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.fire(mockFn)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('open');

      // Force close
      breaker.forceClose();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getStats().failures).toBe(0);
      expect(stateChanges).toContain('closed');
    });

    it('should allow immediate execution after force close', async () => {
      // Open the breaker
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.fire(mockFn)).rejects.toThrow();
      }

      // Force close
      breaker.forceClose();

      // Should now accept calls
      const successFn = jest.fn().mockResolvedValue('success');
      const result = await breaker.fire(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('state change notifications', () => {
    it('should notify on state changes', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));

      // Should start with no notifications
      expect(stateChanges).toHaveLength(0);

      // Cause state change to open
      for (let i = 0; i < 3; i++) {
        await expect(breaker.fire(mockFn)).rejects.toThrow();
      }

      expect(stateChanges).toContain('open');

      // Force close should also notify
      breaker.forceClose();

      expect(stateChanges).toContain('closed');
    });

    it('should not notify on same state', async () => {
      const successFn = jest.fn().mockResolvedValue('success');

      // Multiple successful calls shouldn't trigger notifications
      await breaker.fire(successFn);
      await breaker.fire(successFn);
      await breaker.fire(successFn);

      expect(stateChanges).toHaveLength(0);
    });
  });
});
