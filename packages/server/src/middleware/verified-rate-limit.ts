import { Request, Response, NextFunction } from 'express';
import {
  readAttribution,
  PEAC_HEADERS,
  RATE_LIMIT_HEADERS,
  STANDARD_HEADERS,
} from '../http/headers';
import { verifyWebBotAuth } from '../adapters/webbot/verify';
import { metrics } from '../metrics';
import { problemDetails } from '../http/problems';
import { logger } from '../logging';

export type Tier = 'anonymous' | 'attributed' | 'verified';

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number;
}

class VerifiedRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // 5 minutes
  }

  private getKey(req: Request): string {
    return req.ip || 'unknown';
  }

  private async getTier(req: Request): Promise<{ tier: Tier; limit: number }> {
    // Check for attribution first
    const attribution = readAttribution(req.headers);
    const baseTier: 'anonymous' | 'attributed' = attribution ? 'attributed' : 'anonymous';
    const baseLimit = baseTier === 'attributed' ? 600 : 60;

    // Try Web Bot Auth verification for verified tier
    try {
      const verifyResult = await verifyWebBotAuth(req);
      if (verifyResult.ok && verifyResult.tierHint === 'verified') {
        return { tier: 'verified', limit: 6000 };
      }
    } catch (error) {
      logger.debug({ error: String(error) }, 'Web Bot Auth verification error');
      // Fall through to base tier
    }

    return { tier: baseTier, limit: baseLimit };
  }

  private getBucket(key: string, maxTokens: number): RateLimitBucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: maxTokens,
        lastRefill: Date.now(),
        maxTokens,
        refillRate: maxTokens / 60000, // refill rate per ms for 1-minute window
      };
      this.buckets.set(key, bucket);
    }

    // Update bucket if tier changed (maxTokens different)
    if (bucket.maxTokens !== maxTokens) {
      bucket.maxTokens = maxTokens;
      bucket.refillRate = maxTokens / 60000;
    }

    return bucket;
  }

  private refillBucket(bucket: RateLimitBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * bucket.refillRate;
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - 300000; // 5 minutes ago

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Skip if disabled (test/dev only)
      if (process.env.PEAC_RATELIMIT_DISABLED === 'true') {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('PEAC_RATELIMIT_DISABLED must not be true in production');
        }

        res.set({
          [PEAC_HEADERS.TIER]: 'anonymous',
          [RATE_LIMIT_HEADERS.LIMIT]: '999999',
          [RATE_LIMIT_HEADERS.REMAINING]: '999999',
          [RATE_LIMIT_HEADERS.RESET]: '60',
          [RATE_LIMIT_HEADERS.POLICY]: '999999;w=60',
          [STANDARD_HEADERS.LINK]: '</.well-known/peac>; rel="peac-policy"',
        });
        return next();
      }

      try {
        const key = this.getKey(req);
        const { tier, limit } = await this.getTier(req);
        const bucket = this.getBucket(key, limit);

        this.refillBucket(bucket);

        const remaining = Math.floor(bucket.tokens);

        // Set headers on all responses
        const headers: Record<string, string> = {
          [PEAC_HEADERS.TIER]: tier,
          [RATE_LIMIT_HEADERS.LIMIT]: limit.toString(),
          [RATE_LIMIT_HEADERS.REMAINING]: remaining.toString(),
          [RATE_LIMIT_HEADERS.RESET]: '60',
          [RATE_LIMIT_HEADERS.POLICY]: `${limit};w=60`,
          [STANDARD_HEADERS.LINK]: '</.well-known/peac>; rel="peac-policy"',
        };

        res.set(headers);

        // Enhanced caching for attributed and verified requests
        if (tier === 'attributed') {
          const originalSend = res.send;
          const originalJson = res.json;

          res.send = function (body: any) {
            this.set(STANDARD_HEADERS.CACHE_CONTROL, 'max-age=3600');
            return originalSend.call(this, body);
          };

          res.json = function (body: any) {
            this.set(STANDARD_HEADERS.CACHE_CONTROL, 'max-age=3600');
            return originalJson.call(this, body);
          };
        } else if (tier === 'verified') {
          const originalSend = res.send;
          const originalJson = res.json;

          res.send = function (body: any) {
            this.set(STANDARD_HEADERS.CACHE_CONTROL, 'max-age=7200');
            return originalSend.call(this, body);
          };

          res.json = function (body: any) {
            this.set(STANDARD_HEADERS.CACHE_CONTROL, 'max-age=7200');
            return originalJson.call(this, body);
          };
        }

        if (bucket.tokens >= 1) {
          bucket.tokens -= 1;
          metrics.rateLimitAllowed?.inc({ tier });
          next();
        } else {
          const retryAfter = Math.ceil((1 - bucket.tokens) / bucket.refillRate / 1000);

          res.set('Retry-After', retryAfter.toString());

          metrics.rateLimitExceeded?.inc({ tier });
          logger.warn({ key, tier, remaining, retryAfter }, 'Rate limit exceeded');

          problemDetails.send(res, 'rate_limit_exceeded', {
            detail: tier === 'anonymous' 
              ? 'Send Peac-Attribution header to receive higher limits'
              : 'Rate limit exceeded for current tier',
          });
        }
      } catch (error) {
        logger.error({ error: String(error) }, 'Rate limiting error');
        // Fallback to anonymous tier on error
        res.set({
          [PEAC_HEADERS.TIER]: 'anonymous',
          [RATE_LIMIT_HEADERS.LIMIT]: '60',
          [RATE_LIMIT_HEADERS.REMAINING]: '0',
          [RATE_LIMIT_HEADERS.RESET]: '60',
          [STANDARD_HEADERS.LINK]: '</.well-known/peac>; rel="peac-policy"',
        });
        next();
      }
    };
  }

  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export const verifiedRateLimiter = new VerifiedRateLimiter();