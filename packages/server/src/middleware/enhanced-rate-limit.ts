import { Request, Response, NextFunction } from "express";
import { metrics } from "../metrics";
import { problemDetails } from "../http/problems";
import { logger } from "../logging";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}

class TokenBucket {
  private tokens: number;
  public lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxTokens: number, refillRatePerMinute: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    this.refillRate = refillRatePerMinute / 60000; // Convert to per-ms
  }

  consume(tokens = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getRetryAfter(): number {
    this.refill();
    if (this.tokens < 1) {
      return Math.ceil((1 - this.tokens) / this.refillRate / 1000);
    }
    return 0;
  }

  getRemainingTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  getNextResetTime(): number {
    this.refill();
    const timeToFullRefill = (this.maxTokens - this.tokens) / this.refillRate;
    return Math.ceil(timeToFullRefill / 1000);
  }
}

export class EnhancedRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private config: RateLimitConfig) {
    // Cleanup old buckets every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Production safety: prevent rate limit bypass in production
      if (process.env.NODE_ENV === "production" && process.env.PEAC_RATELIMIT_DISABLED === "true") {
        throw new Error("PEAC_RATELIMIT_DISABLED must not be true in production");
      }
      
      // Skip rate limiting if disabled via environment (test/dev only)
      if (process.env.PEAC_RATELIMIT_DISABLED === "true") {
        const resetDelta = 3600; // seconds until reset
        res.set({
          "RateLimit-Limit": "999999",
          "RateLimit-Remaining": "999999", 
          "RateLimit-Reset": String(resetDelta),
          "RateLimit-Policy": "999999;w=3600",
        });
        return next();
      }

      const key = this.config.keyGenerator
        ? this.config.keyGenerator(req)
        : this.getDefaultKey(req);

      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = new TokenBucket(
          this.config.maxRequests,
          this.config.maxRequests * (60000 / this.config.windowMs)
        );
        this.buckets.set(key, bucket);
      }

      // Always set RFC 9331 RateLimit headers
      const remaining = bucket.getRemainingTokens();
      const resetTime = bucket.getNextResetTime();
      const limit = this.config.maxRequests;
      const windowSeconds = Math.ceil(this.config.windowMs / 1000);

      res.set({
        "RateLimit-Limit": limit.toString(),
        "RateLimit-Remaining": remaining.toString(), 
        "RateLimit-Reset": resetTime.toString(),
        "RateLimit-Policy": `${limit};w=${windowSeconds}`,
      });

      if (bucket.consume()) {
        metrics.rateLimitAllowed.inc({ key });
        next();
      } else {
        const retryAfter = bucket.getRetryAfter();
        metrics.rateLimitExceeded.inc({ key });
        logger.warn({ key, retryAfter, remaining, resetTime }, "Rate limit exceeded");

        // Add Retry-After header for exceeded requests
        res.set("Retry-After", Math.ceil(retryAfter).toString());

        problemDetails.send(res, "rate_limit_exceeded", {
          detail: `Rate limit exceeded. Please retry after ${Math.ceil(retryAfter)} seconds`,
          retry_after: Math.ceil(retryAfter),
        });
      }
    };
  }

  private getDefaultKey(req: Request): string {
    return req.ip || "unknown";
  }

  private cleanup(): void {
    // Remove buckets that haven't been used in 5 minutes
    const fiveMinutesAgo = Date.now() - 300000;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.lastRefill < fiveMinutesAgo) {
        this.buckets.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Test-friendly rate limiting configuration
const isTestEnvironment = process.env.NODE_ENV === "test";
const rateLimitDisabled = process.env.PEAC_RATELIMIT_DISABLED === "true";

export const standardRateLimiter = new EnhancedRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: rateLimitDisabled ? 999999 : (isTestEnvironment ? 1000 : 60),
});

export const strictRateLimiter = new EnhancedRateLimiter({
  windowMs: 60000,
  maxRequests: rateLimitDisabled ? 999999 : (isTestEnvironment ? 500 : 10),
});