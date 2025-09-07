import { Request, Response, NextFunction } from 'express';
import { rateLimiter, Tier } from '../core/ratelimit';
import { telemetry } from '../telemetry/log';
import { verifyWebBotAuth } from '../adapters/webbot/verify';
import {
  readAttribution,
  PEAC_HEADERS,
  RATE_LIMIT_HEADERS,
  STANDARD_HEADERS,
} from '../http/headers';
import { problemDetails } from '../http/problems';
import { metrics } from '../metrics';
import { logger } from '../logging';

export function createTokenBucketRateLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip if disabled (test/dev only)
      if (process.env.PEAC_RATELIMIT_DISABLED === 'true') {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('PEAC_RATELIMIT_DISABLED must not be true in production');
        }

        res.set({
          [PEAC_HEADERS.TIER]: 'anonymous',
          [RATE_LIMIT_HEADERS.LIMIT]: '999999',
          [RATE_LIMIT_HEADERS.REMAINING]: '999999',
          [RATE_LIMIT_HEADERS.RESET]: Math.floor((Date.now() + 60000) / 1000).toString(),
          [STANDARD_HEADERS.LINK]: '</.well-known/peac>; rel="peac-policy"',
        });
        return next();
      }

      // Determine tier and context
      let tier: Tier = 'anonymous';
      let verifiedThumbprint: string | undefined;
      let attribution: string | undefined;

      // Check for Web Bot Auth verification
      const wbaResult = await verifyWebBotAuth(req);
      if (wbaResult.ok && wbaResult.thumb) {
        tier = 'verified';
        verifiedThumbprint = wbaResult.thumb || undefined;
      } else {
        // Check for attribution
        attribution = readAttribution(req.headers) || undefined;
        if (attribution) {
          tier = 'attributed';
        }
      }

      // Apply rate limiting
      const rateLimitResult = rateLimiter.checkRateLimit(
        req,
        tier,
        verifiedThumbprint,
        attribution
      );

      // Set rate limit headers
      const headers: Record<string, string> = {
        [PEAC_HEADERS.TIER]: tier,
        [RATE_LIMIT_HEADERS.LIMIT]: rateLimitResult.limit.toString(),
        [RATE_LIMIT_HEADERS.REMAINING]: rateLimitResult.remaining.toString(),
        [RATE_LIMIT_HEADERS.RESET]: Math.floor(rateLimitResult.resetAt / 1000).toString(),
        [STANDARD_HEADERS.LINK]: '</.well-known/peac>; rel="peac-policy"',
      };

      // Add verified key header if applicable
      if (tier === 'verified' && verifiedThumbprint) {
        headers['peac-verified-key'] = verifiedThumbprint;
      }

      if (rateLimitResult.retryAfterSec) {
        headers['Retry-After'] = rateLimitResult.retryAfterSec.toString();
      }

      res.set(headers);

      // Log telemetry
      telemetry.logRateLimit(req, {
        tier,
        keying: 'ip', // Use config keying
        remaining: rateLimitResult.remaining,
      });

      if (rateLimitResult.allowed) {
        metrics.rateLimitAllowed?.inc({ tier });
        next();
      } else {
        metrics.rateLimitExceeded?.inc({ tier });

        logger.warn(
          {
            tier,
            remaining: rateLimitResult.remaining,
            retryAfter: rateLimitResult.retryAfterSec,
          },
          'Rate limit exceeded'
        );

        problemDetails.send(res, 'rate_limit_exceeded', {
          detail:
            tier === 'anonymous' ? 'Provide Peac-Attribution header for higher limits' : undefined,
        });
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Rate limit middleware error'
      );

      telemetry.logError(req, {
        where: 'rate_limit_middleware',
        code: 'internal_error',
      });

      // Continue with conservative rate limit
      res.set({
        [PEAC_HEADERS.TIER]: 'anonymous',
        [RATE_LIMIT_HEADERS.LIMIT]: '60',
        [RATE_LIMIT_HEADERS.REMAINING]: '59',
        [RATE_LIMIT_HEADERS.RESET]: Math.floor((Date.now() + 60000) / 1000).toString(),
        [STANDARD_HEADERS.LINK]: '</.well-known/peac>; rel="peac-policy"',
      });

      next();
    }
  };
}

export const tokenBucketRateLimit = createTokenBucketRateLimit();
