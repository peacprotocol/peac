import { Request } from 'express';
import crypto from 'crypto';

export type RateLimitKeying = 'ip' | 'verified' | 'attribution' | 'ip_tlsfp';
export type Tier = 'anonymous' | 'attributed' | 'verified';

export interface RateLimitConfig {
  keying: RateLimitKeying;
  anonymous_rpm: number;
  attributed_rpm: number;
  verified_rpm: number;
}

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per millisecond
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec?: number;
}

class TokenBucketRateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Cleanup expired buckets every 5 minutes (skip in test environment)
    if (process.env.NODE_ENV !== 'test') {
      setInterval(() => {
        const cutoff = Date.now() - 300000; // 5 minutes
        for (const [key, bucket] of this.buckets) {
          if (bucket.lastRefill < cutoff) {
            this.buckets.delete(key);
          }
        }
      }, 300000);
    }
  }

  updateConfig(config: RateLimitConfig): void {
    this.config = config;
  }

  checkRateLimit(
    req: Request,
    tier: Tier,
    verifiedThumbprint?: string,
    attribution?: string
  ): RateLimitResult {
    const now = Date.now();
    const limit = this.getLimitForTier(tier);
    const bucketKey = this.getBucketKey(req, tier, verifiedThumbprint, attribution);

    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        tokens: limit,
        lastRefill: now,
        capacity: limit,
        refillRate: limit / 60000, // refill per minute in tokens per ms
      };
      this.buckets.set(bucketKey, bucket);
    }

    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      const tokensToAdd = Math.floor(elapsed * bucket.refillRate);
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    // Check if request can be served
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;

      return {
        allowed: true,
        limit,
        remaining: Math.floor(bucket.tokens),
        resetAt: Math.ceil(now / 60000) * 60000, // Next minute boundary
      };
    } else {
      // Calculate when next token will be available
      const msUntilToken = Math.ceil(1 / bucket.refillRate);
      const retryAfterSec = Math.ceil(msUntilToken / 1000);

      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: Math.ceil((now + msUntilToken) / 60000) * 60000,
        retryAfterSec,
      };
    }
  }

  private getLimitForTier(tier: Tier): number {
    switch (tier) {
      case 'anonymous':
        return this.config.anonymous_rpm;
      case 'attributed':
        return this.config.attributed_rpm;
      case 'verified':
        return this.config.verified_rpm;
      default:
        return this.config.anonymous_rpm;
    }
  }

  private getBucketKey(
    req: Request,
    tier: Tier,
    verifiedThumbprint?: string,
    attribution?: string
  ): string {
    const keying = (this.config.keying as string) === 'ip_ua' ? 'ip' : this.config.keying;

    switch (keying) {
      case 'ip': {
        const ip = this.getClientIP(req);
        return `ip:${tier}:${crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16)}`;
      }

      case 'verified': {
        if (tier === 'verified' && verifiedThumbprint) {
          return `verified:${verifiedThumbprint}`;
        }
        // Fall back to IP for non-verified tiers
        const ip = this.getClientIP(req);
        return `ip:${tier}:${crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16)}`;
      }

      case 'attribution': {
        if (attribution) {
          const hash = crypto
            .createHash('sha256')
            .update(attribution)
            .digest('hex')
            .substring(0, 16);
          return `attr:${tier}:${hash}`;
        }
        // Fall back to IP
        const ip = this.getClientIP(req);
        return `ip:${tier}:${crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16)}`;
      }

      case 'ip_tlsfp': {
        // TLS fingerprint not implemented - fall back to IP
        const ip = this.getClientIP(req);
        return `ip:${tier}:${crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16)}`;
      }

      default: {
        const ip = this.getClientIP(req);
        return `ip:${tier}:${crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16)}`;
      }
    }
  }

  private getClientIP(req: Request): string {
    // Check X-Forwarded-For (first IP in chain)
    const forwarded = req.get('X-Forwarded-For');
    if (forwarded) {
      const firstIP = forwarded.split(',')[0]?.trim();
      if (firstIP) return firstIP;
    }

    // Check X-Real-IP
    const realIP = req.get('X-Real-IP');
    if (realIP) return realIP;

    // Fall back to socket
    return req.socket.remoteAddress || 'unknown';
  }
}

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  keying: 'ip',
  anonymous_rpm: 60,
  attributed_rpm: 600,
  verified_rpm: 6000,
};

export const rateLimiter = new TokenBucketRateLimiter(DEFAULT_CONFIG);

export function updateRateLimitConfig(config: Partial<RateLimitConfig>): void {
  const newConfig = { ...DEFAULT_CONFIG, ...config };
  rateLimiter.updateConfig(newConfig);
}
