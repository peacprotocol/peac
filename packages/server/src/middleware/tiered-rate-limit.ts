import { Request, Response, NextFunction } from 'express';
import {
  readAttribution,
  detectWebBotAuthHint,
  PEAC_HEADERS,
  RATE_LIMIT_HEADERS,
  STANDARD_HEADERS,
} from '../http/headers';
import { metrics } from '../metrics';
import { problemDetails } from '../http/problems';
import { logger } from '../logging';

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number;
}

class TieredRateLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }
  }

  private getKey(req: Request): string {
    return req.ip || 'unknown';
  }

  private getTier(req: Request): { tier: 'anonymous' | 'attributed'; limit: number } {
    const attribution = readAttribution(req.headers);

    if (attribution) {
      return { tier: 'attributed', limit: 600 };
    }

    return { tier: 'anonymous', limit: 60 };
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
    const fiveMinutesAgo = Date.now() - 300000;
    this.buckets.forEach((bucket, key) => {
      if (bucket.lastRefill < fiveMinutesAgo) {
        this.buckets.delete(key);
      }
    });
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
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

      const key = this.getKey(req);
      const { tier, limit } = this.getTier(req);
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

      // Override cache control for attributed requests after other middleware has run
      if (tier === 'attributed') {
        // This will run after the response is sent, so we need to set it immediately
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
      }

      // Log Web Bot Auth hints for observability (no behavior change)
      const webBotHint = detectWebBotAuthHint(req.headers);
      if (webBotHint.hasSignature) {
        logger.debug(
          {
            signatureAgent: webBotHint.signatureAgent,
            tier,
          },
          'Web Bot Auth headers detected',
        );
        metrics.webBotAuthHints?.inc({ tier });
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
          detail: 'Send x-peac-attribution to receive higher limits',
        });
      }
    };
  }

  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export const tieredRateLimiter = new TieredRateLimiter();
