/**
 * Rate limiter middleware
 * - Per-IP limit: 100 req/s
 * - Global limit: 1000 req/s
 */

import type { Context, Next } from 'hono';

interface RateLimitConfig {
  perIpLimit: number; // Requests per second per IP
  globalLimit: number; // Requests per second globally
  windowMs: number; // Time window in milliseconds
}

const DEFAULT_CONFIG: RateLimitConfig = {
  perIpLimit: 100,
  globalLimit: 1000,
  windowMs: 1000, // 1 second
};

/**
 * Sliding window rate limiter
 */
class SlidingWindowLimiter {
  private ipWindows = new Map<string, number[]>();
  private globalWindow: number[] = [];

  constructor(private config: RateLimitConfig = DEFAULT_CONFIG) {}

  /**
   * Check if request is allowed
   */
  isAllowed(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Clean old entries for this IP
    const ipRequests = this.ipWindows.get(ip) || [];
    const recentIpRequests = ipRequests.filter((t) => t > windowStart);
    this.ipWindows.set(ip, recentIpRequests);

    // Check per-IP limit
    if (recentIpRequests.length >= this.config.perIpLimit) {
      const oldestRequest = recentIpRequests[0];
      const retryAfter = Math.ceil((oldestRequest + this.config.windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Clean old global entries
    this.globalWindow = this.globalWindow.filter((t) => t > windowStart);

    // Check global limit
    if (this.globalWindow.length >= this.config.globalLimit) {
      const oldestRequest = this.globalWindow[0];
      const retryAfter = Math.ceil((oldestRequest + this.config.windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Record this request
    recentIpRequests.push(now);
    this.globalWindow.push(now);
    this.ipWindows.set(ip, recentIpRequests);

    return { allowed: true };
  }

  /**
   * Get current stats
   */
  getStats(ip?: string): { perIp?: number; global: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Clean global window
    this.globalWindow = this.globalWindow.filter((t) => t > windowStart);

    const stats: { perIp?: number; global: number } = {
      global: this.globalWindow.length,
    };

    if (ip) {
      const ipRequests = this.ipWindows.get(ip) || [];
      const recentIpRequests = ipRequests.filter((t) => t > windowStart);
      stats.perIp = recentIpRequests.length;
    }

    return stats;
  }
}

// Singleton instance
const limiter = new SlidingWindowLimiter();

/**
 * Rate limiting middleware for Hono
 */
export function rateLimiter() {
  return async (c: Context, next: Next) => {
    // Get client IP (handle proxy headers)
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    const result = limiter.isAllowed(ip);

    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfter || 60));
      return c.json(
        {
          type: 'https://www.peacprotocol.org/errors/rate-limit',
          title: 'Rate Limit Exceeded',
          status: 429,
          detail: `Rate limit exceeded. IP limit: ${DEFAULT_CONFIG.perIpLimit} req/s, Global limit: ${DEFAULT_CONFIG.globalLimit} req/s`,
          instance: c.req.path,
        },
        429,
        {
          'Content-Type': 'application/problem+json',
        }
      );
    }

    await next();
  };
}

/**
 * Get rate limiter stats
 */
export function getRateLimiterStats(ip?: string) {
  return limiter.getStats(ip);
}
