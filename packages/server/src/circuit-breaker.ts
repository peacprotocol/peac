/**
 * Circuit breaker for JWKS fetching
 * - 5 consecutive failures → 60s open
 * - Prevents cascading failures
 */

enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Blocking requests
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  openDurationMs: number; // Time to keep circuit open
  halfOpenRequests: number; // Number of test requests in half-open state
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  openDurationMs: 60000, // 60 seconds
  halfOpenRequests: 3,
};

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private openedAt: number | null = null;

  constructor(private config: CircuitBreakerConfig = DEFAULT_CONFIG) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      const elapsed = now - (this.openedAt || 0);

      if (elapsed >= this.config.openDurationMs) {
        // Transition to half-open
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error(
          `Circuit breaker is open. Retry after ${Math.ceil(
            (this.config.openDurationMs - elapsed) / 1000
          )}s`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.halfOpenRequests) {
        // Transition to closed
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.openedAt = null;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.config.failureThreshold
    ) {
      // Open the circuit
      this.state = CircuitState.OPEN;
      this.openedAt = Date.now();
      this.failureCount = 0;
      this.successCount = 0;
    }
  }

  /**
   * Get current state
   */
  getState(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    openedAt: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      openedAt: this.openedAt,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = null;
  }
}

// Singleton instance for JWKS fetching
export const jwksCircuitBreaker = new CircuitBreaker();
