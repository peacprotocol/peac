/**
 * @peac/crawler v0.9.12.1 - Circuit breaker with half-open state
 * Implements closed/open/half-open pattern with configurable thresholds
 */

export interface BreakerOptions {
  timeout: number;           // Operation timeout in ms
  errorThreshold: number;    // Consecutive failures to open
  resetMs: number;          // Time in open state before trying half-open
  successThreshold: number;  // Successes in half-open to close
}

export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerStats {
  state: BreakerState;
  failures: number;
  successes: number;
  nextAttempt?: number;
  lastStateChange: number;
}

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private halfOpenSuccesses = 0;
  private nextAttempt = 0;
  private lastStateChange = Date.now();
  
  constructor(
    private readonly opts: BreakerOptions = {
      timeout: 1000,
      errorThreshold: 5,
      resetMs: 30_000,
      successThreshold: 2
    },
    private onStateChange?: (state: BreakerState, stats: BreakerStats) => void
  ) {}
  
  private setState(newState: BreakerState): void {
    if (newState !== this.state) {
      this.state = newState;
      this.lastStateChange = Date.now();
      
      if (this.onStateChange) {
        this.onStateChange(newState, this.getStats());
      }
    }
  }
  
  /**
   * Pre-emptively open the breaker (e.g., from health checks)
   */
  preOpen(): void {
    this.failures = this.opts.errorThreshold;
    this.nextAttempt = Date.now() + this.opts.resetMs;
    this.setState('open');
  }
  
  /**
   * Force the breaker closed (e.g., manual override)
   */
  forceClose(): void {
    this.failures = 0;
    this.halfOpenSuccesses = 0;
    this.setState('closed');
  }
  
  /**
   * Execute function through circuit breaker
   */
  async fire<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    
    // Check if we should transition from open to half-open
    if (this.state === 'open') {
      if (now >= this.nextAttempt) {
        this.setState('half-open');
        this.halfOpenSuccesses = 0;
      } else {
        throw new Error('circuit_open');
      }
    }
    
    // Set up timeout race
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('circuit_timeout')), this.opts.timeout);
    });
    
    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      
      // Handle success based on current state
      if (this.state === 'half-open') {
        this.halfOpenSuccesses++;
        if (this.halfOpenSuccesses >= this.opts.successThreshold) {
          this.failures = 0;
          this.setState('closed');
        }
      } else if (this.state === 'closed') {
        // Reset failure count on successful closed-state operation
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      
      // Transition to open if we've hit the error threshold
      if (this.failures >= this.opts.errorThreshold) {
        this.nextAttempt = Date.now() + this.opts.resetMs;
        this.setState('open');
      } else if (this.state === 'half-open') {
        // Half-open failure immediately goes back to open
        this.nextAttempt = Date.now() + this.opts.resetMs;
        this.setState('open');
      }
      
      throw error;
    }
  }
  
  /**
   * Get current breaker statistics
   */
  getStats(): BreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.halfOpenSuccesses,
      nextAttempt: this.state === 'open' ? this.nextAttempt : undefined,
      lastStateChange: this.lastStateChange
    };
  }
  
  /**
   * Check if the breaker allows requests
   */
  isOpen(): boolean {
    if (this.state === 'open') {
      const now = Date.now();
      if (now >= this.nextAttempt) {
        // Would transition to half-open on next fire()
        return false;
      }
      return true;
    }
    return false;
  }
  
  /**
   * Get current state
   */
  getState(): BreakerState {
    return this.state;
  }
}