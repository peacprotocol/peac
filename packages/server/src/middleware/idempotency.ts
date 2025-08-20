import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../logging';
import { idempotencyHits, idempotencyStores } from '../metrics/enhanced';
import { problemDetails } from '../http/problems';

export interface IdempotencyConfig {
  enabled: boolean;
  cacheTTL: number;
  maxKeyLength: number;
  maxEntries: number;
}

export class IdempotencyMiddleware {
  private cache: Map<string, { response: any; timestamp: number }> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private config: IdempotencyConfig) {
    // Cleanup expired entries every 5 minutes (skip in test environment)
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
    }
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.enabled) {
        return next();
      }

      // Only apply to state-changing methods
      if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
        return next();
      }

      let idempotencyKey = req.get('Idempotency-Key') || req.get('idempotency-key');

      // Generate key if not provided for payment-like operations
      if (!idempotencyKey && this.isPaymentOperation(req)) {
        idempotencyKey = randomUUID();
        logger.info({ path: req.path }, 'Generated idempotency key for payment operation');
      }

      if (idempotencyKey) {
        // Validate key format and length
        if (idempotencyKey.length > this.config.maxKeyLength) {
          return problemDetails.send(res, 'validation_error', {
            detail: `Idempotency key too long (max ${this.config.maxKeyLength} characters)`,
          });
        }

        // Scope the cache key to prevent cross-route collisions (defense-in-depth)
        const scopedKey = `${req.method}:${req.path}:${idempotencyKey}`;

        // Check for existing response
        const cached = this.cache.get(scopedKey);
        if (cached) {
          const age = Date.now() - cached.timestamp;
          if (age < this.config.cacheTTL) {
            logger.info({ idempotencyKey, age }, 'Returning cached idempotent response');
            idempotencyHits.inc({ path: req.path });

            // Set idempotency headers
            res.set({
              'Idempotency-Key': idempotencyKey,
              'X-Idempotent-Replay': 'true',
              Age: Math.floor(age / 1000).toString(),
            });

            return res.status(cached.response.status).json(cached.response.body);
          } else {
            // Expired entry
            this.cache.delete(scopedKey);
          }
        }

        // Store key for response caching
        res.locals.idempotencyKey = idempotencyKey;
        res.locals.scopedKey = scopedKey;
        res.set('Idempotency-Key', idempotencyKey);

        // Intercept response to cache it
        const originalJson = res.json.bind(res);
        res.json = (body: any) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Enforce max entries limit to prevent unbounded memory growth
            if (this.cache.size >= this.config.maxEntries) {
              // Remove oldest entry by finding minimum timestamp
              let oldestKey: string | null = null;
              let oldestTimestamp = Date.now();

              for (const [key, entry] of this.cache.entries()) {
                if (entry.timestamp < oldestTimestamp) {
                  oldestTimestamp = entry.timestamp;
                  oldestKey = key;
                }
              }

              if (oldestKey) {
                this.cache.delete(oldestKey);
                logger.debug({ evictedKey: oldestKey }, 'Evicted oldest idempotency key');
              }
            }

            this.cache.set(scopedKey, {
              response: { status: res.statusCode, body },
              timestamp: Date.now(),
            });
            idempotencyStores.inc({ path: req.path });
          }
          return originalJson(body);
        };
      }

      // Log all payment operations for audit trail
      if (this.isPaymentOperation(req)) {
        logger.info(
          {
            method: req.method,
            path: req.path,
            idempotencyKey: idempotencyKey ? '[redacted]' : undefined,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
          },
          'Payment operation audit log',
        );
      }

      next();
    };
  }

  private isPaymentOperation(req: Request): boolean {
    // Detect payment-related operations
    const paymentPaths = ['/pay', '/payment', '/negotiate', '/finalize', '/peac/payments/charges'];
    return paymentPaths.some((path) => req.path.includes(path));
  }

  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheTTL) {
        expired.push(key);
      }
    }

    expired.forEach((key) => this.cache.delete(key));

    if (expired.length > 0) {
      logger.debug({ expiredCount: expired.length }, 'Cleaned up expired idempotency keys');
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }

  getStats() {
    return {
      cacheSize: this.cache.size,
      enabled: this.config.enabled,
    };
  }

  dispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval as any);
    }
  }
}

const idempotencyConfig: IdempotencyConfig = {
  enabled: process.env.PEAC_IDEMPOTENCY_ENABLED !== 'false',
  cacheTTL: parseInt(process.env.PEAC_IDEMPOTENCY_TTL || '3600000'), // 1 hour
  maxKeyLength: 255,
  maxEntries: parseInt(process.env.PEAC_IDEMPOTENCY_MAX_ENTRIES || '1000'),
};

export const idempotencyMiddleware = new IdempotencyMiddleware(idempotencyConfig);
