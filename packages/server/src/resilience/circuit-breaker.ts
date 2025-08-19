/**
 * Circuit Breaker Pattern Implementation for PEAC Protocol v0.9.6
 *
 * Provides enterprise-grade resilience with:
 * - Three-state circuit breaker (Closed, Open, Half-Open)
 * - Configurable failure thresholds and timeouts
 * - Health metrics and monitoring
 * - Graceful degradation patterns
 * - Request rate limiting during failures
 */

import { EventEmitter } from 'events';
import { logger } from '../logging';
import { prometheus } from '../metrics/prom';

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time in ms to wait before trying half-open
  monitoringPeriod: number; // Rolling window in ms
  volumeThreshold: number; // Minimum requests before breaker can open
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

interface CircuitBreakerStats {
  requests: number;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  windowStart: number;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private stats: CircuitBreakerStats;
  private nextAttempt: number = 0;
  private halfOpenSuccesses: number = 0;

  constructor(private config: CircuitBreakerConfig) {
    super();
    this.stats = this.resetStats();
    this.setupMetrics();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.state === CircuitBreakerState.OPEN) {
        if (Date.now() < this.nextAttempt) {
          const error = new CircuitBreakerError(
            `Circuit breaker is OPEN for ${this.config.name}`,
            'CIRCUIT_OPEN',
          );
          this.recordMetrics('rejected');
          return reject(error);
        } else {
          // Transition to half-open
          this.transitionToHalfOpen();
        }
      }

      // Clean up old stats outside the monitoring window
      this.cleanupStats();

      const startTime = Date.now();
      this.stats.requests++;

      fn()
        .then((result) => {
          this.onSuccess(startTime);
          resolve(result);
        })
        .catch((error) => {
          this.onFailure(error, startTime);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution
   */
  private onSuccess(startTime: number): void {
    const duration = Date.now() - startTime;

    this.stats.successes++;
    this.stats.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenSuccesses++;

      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }

    this.recordMetrics('success', duration);

    logger.debug(
      {
        circuitBreaker: this.config.name,
        state: this.state,
        duration,
        stats: this.getStats(),
      },
      'Circuit breaker success',
    );
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error, startTime: number): void {
    const duration = Date.now() - startTime;

    this.stats.failures++;
    this.stats.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CircuitBreakerState.CLOSED) {
      if (this.shouldOpen()) {
        this.transitionToOpen();
      }
    }

    this.recordMetrics('failure', duration);

    logger.warn(
      {
        circuitBreaker: this.config.name,
        state: this.state,
        error: error.message,
        duration,
        stats: this.getStats(),
      },
      'Circuit breaker failure',
    );
  }

  /**
   * Check if circuit breaker should open
   */
  private shouldOpen(): boolean {
    const { requests, failures } = this.stats;
    const { failureThreshold, volumeThreshold } = this.config;

    // Need minimum volume before opening
    if (requests < volumeThreshold) {
      return false;
    }

    const failureRate = failures / requests;
    const threshold = failureThreshold / 100; // Convert percentage to decimal

    return failureRate >= threshold;
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttempt = Date.now() + this.config.timeout;
    this.halfOpenSuccesses = 0;

    this.emit('stateChange', {
      from: this.state,
      to: CircuitBreakerState.OPEN,
      name: this.config.name,
      stats: this.getStats(),
    });

    logger.warn(
      {
        circuitBreaker: this.config.name,
        state: this.state,
        nextAttempt: new Date(this.nextAttempt),
        stats: this.getStats(),
      },
      'Circuit breaker opened',
    );

    this.recordMetrics('opened');
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.HALF_OPEN;
    this.halfOpenSuccesses = 0;

    this.emit('stateChange', {
      from: previousState,
      to: CircuitBreakerState.HALF_OPEN,
      name: this.config.name,
      stats: this.getStats(),
    });

    logger.info(
      {
        circuitBreaker: this.config.name,
        state: this.state,
        stats: this.getStats(),
      },
      'Circuit breaker half-opened',
    );

    this.recordMetrics('half_opened');
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.stats = this.resetStats();
    this.halfOpenSuccesses = 0;

    this.emit('stateChange', {
      from: previousState,
      to: CircuitBreakerState.CLOSED,
      name: this.config.name,
      stats: this.getStats(),
    });

    logger.info(
      {
        circuitBreaker: this.config.name,
        state: this.state,
        stats: this.getStats(),
      },
      'Circuit breaker closed',
    );

    this.recordMetrics('closed');
  }

  /**
   * Reset statistics for new monitoring window
   */
  private resetStats(): CircuitBreakerStats {
    return {
      requests: 0,
      failures: 0,
      successes: 0,
      windowStart: Date.now(),
    };
  }

  /**
   * Clean up old statistics outside monitoring window
   */
  private cleanupStats(): void {
    const now = Date.now();
    const windowStart = now - this.config.monitoringPeriod;

    if (this.stats.windowStart < windowStart) {
      this.stats = this.resetStats();
    }
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats & { state: CircuitBreakerState; failureRate: number } {
    const failureRate = this.stats.requests > 0 ? this.stats.failures / this.stats.requests : 0;

    return {
      ...this.stats,
      state: this.state,
      failureRate,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Force state change (for testing)
   */
  forceState(state: CircuitBreakerState): void {
    const previousState = this.state;
    this.state = state;

    if (state === CircuitBreakerState.OPEN) {
      this.nextAttempt = Date.now() + this.config.timeout;
    } else if (state === CircuitBreakerState.CLOSED) {
      this.stats = this.resetStats();
    }

    this.emit('stateChange', {
      from: previousState,
      to: state,
      name: this.config.name,
      stats: this.getStats(),
    });
  }

  /**
   * Setup Prometheus metrics
   */
  private setupMetrics(): void {
    // Metrics are handled by the prometheus instance
    // This method can be expanded to create custom metrics
  }

  /**
   * Record metrics for monitoring
   */
  private recordMetrics(event: string, duration?: number): void {
    const labels = {
      circuit_breaker: this.config.name,
      state: this.state,
    };

    switch (event) {
      case 'success': {
        prometheus.incrementCounter('circuit_breaker_requests_total', {
          ...labels,
          result: 'success',
        });
        if (duration) {
          prometheus.setGauge('circuit_breaker_request_duration_ms', labels, duration);
        }
        break;
      }
      case 'failure': {
        prometheus.incrementCounter('circuit_breaker_requests_total', {
          ...labels,
          result: 'failure',
        });
        if (duration) {
          prometheus.setGauge('circuit_breaker_request_duration_ms', labels, duration);
        }
        break;
      }
      case 'rejected': {
        prometheus.incrementCounter('circuit_breaker_requests_total', {
          ...labels,
          result: 'rejected',
        });
        break;
      }
      case 'opened': {
        prometheus.incrementCounter('circuit_breaker_state_changes_total', {
          ...labels,
          event: 'opened',
        });
        break;
      }
      case 'closed': {
        prometheus.incrementCounter('circuit_breaker_state_changes_total', {
          ...labels,
          event: 'closed',
        });
        break;
      }
      case 'half_opened': {
        prometheus.incrementCounter('circuit_breaker_state_changes_total', {
          ...labels,
          event: 'half_opened',
        });
        break;
      }
    }

    // Update state gauge
    prometheus.setGauge('circuit_breaker_state', labels, this.getStateValue());
    prometheus.setGauge('circuit_breaker_failure_rate', labels, this.getStats().failureRate);
  }

  /**
   * Convert state to numeric value for metrics
   */
  private getStateValue(): number {
    switch (this.state) {
      case CircuitBreakerState.CLOSED: {
        return 0;
      }
      case CircuitBreakerState.OPEN: {
        return 1;
      }
      case CircuitBreakerState.HALF_OPEN: {
        return 0.5;
      }
      default: {
        return -1;
      }
    }
  }
}

/**
 * Circuit breaker specific error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Create or get a circuit breaker
   */
  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (this.breakers.has(name)) {
      return this.breakers.get(name)!;
    }

    const defaultConfig: CircuitBreakerConfig = {
      name,
      failureThreshold: 50, // 50% failure rate
      successThreshold: 3, // 3 consecutive successes to close
      timeout: 60000, // 1 minute timeout
      monitoringPeriod: 60000, // 1 minute rolling window
      volumeThreshold: 10, // Minimum 10 requests
    };

    const finalConfig = { ...defaultConfig, ...config };
    const breaker = new CircuitBreaker(finalConfig);

    this.breakers.set(name, breaker);
    return breaker;
  }

  /**
   * Get all registered circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get health status of all breakers
   */
  getHealthStatus(): Record<string, unknown> {
    const status: Record<string, unknown> = {};

    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStats();
    }

    return status;
  }

  /**
   * Clear all breakers (for testing)
   */
  clear(): void {
    this.breakers.clear();
  }
}

// Global circuit breaker registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
