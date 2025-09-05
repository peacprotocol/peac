/**
 * @peac/api/security - OWASP security gates
 * Implements rate limiting, SSRF protection, size limits
 */

import { createHash, timingSafeEqual } from 'crypto';

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly capacity: number = 100,
    private readonly refillRate: number = 100, // tokens per minute
    private readonly windowMs: number = 60000, // 1 minute
  ) {}

  consume(key: string, tokens: number = 1): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) || {
      tokens: this.capacity,
      lastRefill: now,
    };

    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const refillAmount = Math.floor((elapsed / this.windowMs) * this.refillRate);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refillAmount);
    bucket.lastRefill = now;

    // Try to consume
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      this.buckets.set(key, bucket);
      return true;
    }

    return false;
  }

  getRemainingTokens(key: string): number {
    const bucket = this.buckets.get(key);
    return bucket ? bucket.tokens : this.capacity;
  }

  getResetTime(key: string): Date {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.tokens >= this.capacity) {
      return new Date();
    }
    const tokensNeeded = this.capacity - bucket.tokens;
    const msToReset = (tokensNeeded / this.refillRate) * this.windowMs;
    return new Date(Date.now() + msToReset);
  }
}

/**
 * SSRF protection for discovery endpoints
 */
export class SSRFProtection {
  private static readonly DENY_LIST = [
    // IPv4 private/local
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./, // link-local
    /^0\.0\.0\.0/,
    // IPv6 private/local
    /^::1$/,
    /^fe80:/i,
    /^fc00:/i,
    /^fd00:/i,
    // Metadata endpoints
    /metadata\.google/i,
    /169\.254\.169\.254/,
    /metadata\.aws/i,
  ];

  static isAllowedURL(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Only allow HTTP(S)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      // Check hostname against deny list
      const hostname = parsed.hostname;
      if (this.DENY_LIST.some((pattern) => pattern.test(hostname))) {
        return false;
      }

      // Prevent localhost variations
      if (['localhost', '0.0.0.0', '::1'].includes(hostname.toLowerCase())) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  static sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const safe: Record<string, string> = {};
    const allowed = ['content-type', 'accept', 'user-agent', 'cache-control'];

    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (allowed.includes(lower)) {
        // Limit header value size
        safe[lower] = value.substring(0, 1024);
      }
    }

    return safe;
  }
}

/**
 * Request size and content validation
 */
export class RequestValidator {
  static readonly MAX_HEADER_SIZE = 8192; // 8KB
  static readonly MAX_BODY_SIZE = 1048576; // 1MB
  static readonly MAX_URL_LENGTH = 2048;

  static validateHeaders(headers: Record<string, string | string[]>): void {
    const serialized = JSON.stringify(headers);
    if (serialized.length > this.MAX_HEADER_SIZE) {
      throw new Error('Headers exceed maximum size');
    }

    // Strict Content-Type validation
    const contentType = headers['content-type'];
    if (contentType) {
      const ct = Array.isArray(contentType) ? contentType[0] : contentType;
      if (!this.isAllowedContentType(ct)) {
        throw new Error(`Unsupported Content-Type: ${ct}`);
      }
    }
  }

  static validateBody(body: string | Buffer): void {
    const size = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body);
    if (size > this.MAX_BODY_SIZE) {
      throw new Error(`Body exceeds maximum size: ${size} > ${this.MAX_BODY_SIZE}`);
    }
  }

  static validateURL(url: string): void {
    if (url.length > this.MAX_URL_LENGTH) {
      throw new Error(`URL exceeds maximum length: ${url.length} > ${this.MAX_URL_LENGTH}`);
    }
  }

  private static isAllowedContentType(contentType: string): boolean {
    const allowed = [
      'application/json',
      'application/jose',
      'application/jose+json',
      'application/peac-receipt+jws',
      'application/problem+json',
      'text/plain',
    ];
    const ct = contentType.toLowerCase().split(';')[0].trim();
    return allowed.includes(ct);
  }
}

/**
 * Constant-time comparison for security tokens
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return timingSafeEqual(bufA, bufB);
}

/**
 * Secure hash comparison
 */
export function secureHashCompare(
  data: string,
  expectedHash: string,
  algorithm = 'sha256',
): boolean {
  const hash = createHash(algorithm).update(data).digest('hex');
  return constantTimeCompare(hash, expectedHash);
}

/**
 * Discovery timeout and cache configuration
 */
export class DiscoveryConfig {
  static readonly TIMEOUT_MS = 5000; // 5 seconds
  static readonly CACHE_TTL_MS = 3600000; // 1 hour
  static readonly MAX_REDIRECTS = 3;
  static readonly ETAG_CACHE_SIZE = 1000;

  static getTimeout(): number {
    return this.TIMEOUT_MS;
  }

  static getCacheTTL(hasETag: boolean): number {
    // Shorter TTL if no ETag (can't validate freshness)
    return hasETag ? this.CACHE_TTL_MS : this.CACHE_TTL_MS / 4;
  }
}

/**
 * OWASP security middleware
 */
export interface SecurityMiddleware {
  rateLimiter: RateLimiter;

  checkRateLimit(key: string): {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  };

  validateRequest(req: {
    url: string;
    headers: Record<string, string | string[]>;
    body?: string | Buffer;
  }): void;

  validateDiscoveryURL(url: string): void;
}

export function createSecurityMiddleware(): SecurityMiddleware {
  const rateLimiter = new RateLimiter();

  return {
    rateLimiter,

    checkRateLimit(key: string) {
      const allowed = rateLimiter.consume(key);
      return {
        allowed,
        remaining: rateLimiter.getRemainingTokens(key),
        resetAt: rateLimiter.getResetTime(key),
      };
    },

    validateRequest(req) {
      RequestValidator.validateURL(req.url);
      RequestValidator.validateHeaders(req.headers);
      if (req.body) {
        RequestValidator.validateBody(req.body);
      }
    },

    validateDiscoveryURL(url: string) {
      if (!SSRFProtection.isAllowedURL(url)) {
        throw new Error(`URL not allowed: ${url}`);
      }
    },
  };
}
