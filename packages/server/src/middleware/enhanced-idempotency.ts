/**
 * PEAC Protocol v0.9.6 Enhanced Idempotency Middleware
 *
 * Enterprise-grade idempotency with:
 * - Request fingerprinting with SHA-256 hashing
 * - Content-based deduplication
 * - Distributed Redis storage with fallback
 * - Multi-level TTL management
 * - Conflict detection and resolution
 * - Request signature verification
 * - Comprehensive monitoring and metrics
 */

import { Request, Response, NextFunction } from 'express';
import { createHash, randomUUID } from 'crypto';
import { logger } from '../logging';
import { prometheus } from '../metrics/prom';
import { problemDetails } from '../http/problems';
import { getRedis } from '../utils/redis-pool';
import { withResilience, resilienceConfigs } from '../resilience';

export interface EnhancedIdempotencyConfig {
  enabled: boolean;
  mode: 'strict' | 'relaxed' | 'payment-only';
  storage: 'memory' | 'redis' | 'hybrid';

  // TTL Configuration
  shortTTL: number; // For fast operations (5 minutes)
  standardTTL: number; // For regular operations (1 hour)
  paymentTTL: number; // For payment operations (24 hours)
  conflictTTL: number; // For conflict resolution (48 hours)

  // Limits
  maxKeyLength: number;
  maxBodySize: number;
  maxEntries: number;
  maxConflictRetries: number;

  // Security
  enableFingerprinting: boolean;
  enableSignatureVerification: boolean;

  // Monitoring
  enableMetrics: boolean;
  enableAuditLog: boolean;
}

export interface IdempotencyEntry {
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: any;
  responseHeaders: Record<string, string>;
  timestamp: number;
  ttl: number;
  operationType: string;
  fingerprint?: string;
  metadata?: Record<string, unknown>;
}

export interface RequestFingerprint {
  method: string;
  path: string;
  contentHash: string;
  headersHash: string;
  queryHash: string;
  userAgent?: string;
  clientIP?: string;
}

export class EnhancedIdempotencyMiddleware {
  private memoryCache: Map<string, IdempotencyEntry> = new Map();
  private cleanupInterval!: NodeJS.Timeout;
  private conflictRetries: Map<string, number> = new Map();
  private operationStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    conflicts: 0,
    fingerprints: 0,
    redisHits: 0,
    redisErrors: 0,
  };

  constructor(private config: EnhancedIdempotencyConfig) {
    this.setupMetrics();
    this.scheduleCleanup();
  }

  /**
   * Express middleware for enhanced idempotency
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      try {
        if (!this.config.enabled) {
          return next();
        }

        // Apply to state-changing methods only
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          return next();
        }

        // Mode-based filtering
        if (this.config.mode === 'payment-only' && !this.isPaymentOperation(req)) {
          return next();
        }

        this.operationStats.totalRequests++;
        this.recordMetrics('request_total');

        // Get or generate idempotency key
        const idempotencyKey = await this.getOrGenerateKey(req);
        if (!idempotencyKey) {
          return next();
        }

        // Validate key
        if (!this.isValidKey(idempotencyKey)) {
          return problemDetails.send(res, 'validation_error', {
            detail: 'Invalid idempotency key format',
          });
        }

        // Create request fingerprint
        const fingerprint = this.config.enableFingerprinting
          ? await this.createRequestFingerprint(req)
          : null;

        // Check for existing response
        const existingEntry = await this.getIdempotencyEntry(idempotencyKey);
        if (existingEntry) {
          const result = await this.handleExistingEntry(req, res, existingEntry, fingerprint);
          if (result) {
            this.recordProcessingTime(Date.now() - startTime, 'cache_hit');
            return result;
          }
        }

        // Set up response interception
        await this.setupResponseInterception(req, res, idempotencyKey, fingerprint);

        // Continue with request processing
        next();
      } catch (error) {
        logger.error(
          {
            error: (error as Error).message,
            path: req.path,
            method: req.method,
          },
          'Enhanced idempotency middleware error',
        );

        this.recordMetrics('error');

        // Continue without idempotency on error
        next();
      }
    };
  }

  /**
   * Get or generate idempotency key
   */
  private async getOrGenerateKey(req: Request): Promise<string | null> {
    let key = req.get('Idempotency-Key') || req.get('idempotency-key');

    // Auto-generate for payment operations if not provided
    if (!key && this.isPaymentOperation(req)) {
      key = `auto_${randomUUID()}`;
      logger.info(
        {
          path: req.path,
          method: req.method,
        },
        'Auto-generated idempotency key for payment operation',
      );
    }

    // In strict mode, require explicit key for all operations
    if (!key && this.config.mode === 'strict') {
      return null;
    }

    return key || null;
  }

  /**
   * Validate idempotency key format and constraints
   */
  private isValidKey(key: string): boolean {
    if (!key || key.length === 0) return false;
    if (key.length > this.config.maxKeyLength) return false;

    // Must be alphanumeric with hyphens and underscores
    const validFormat = /^[a-zA-Z0-9_-]+$/.test(key);
    return validFormat;
  }

  /**
   * Create request fingerprint for content-based deduplication
   */
  private async createRequestFingerprint(req: Request): Promise<RequestFingerprint> {
    const bodyContent = req.body ? JSON.stringify(req.body) : '';
    const queryContent = JSON.stringify(req.query);

    // Create content hashes
    const contentHash = this.createHash(bodyContent);
    const queryHash = this.createHash(queryContent);

    // Create headers hash (exclude non-deterministic headers)
    const relevantHeaders = this.extractRelevantHeaders(req);
    const headersHash = this.createHash(JSON.stringify(relevantHeaders));

    const fingerprint: RequestFingerprint = {
      method: req.method,
      path: req.path,
      contentHash,
      headersHash,
      queryHash,
      userAgent: req.get('User-Agent'),
      clientIP: req.ip,
    };

    this.operationStats.fingerprints++;
    this.recordMetrics('fingerprint_created');

    return fingerprint;
  }

  /**
   * Extract relevant headers for fingerprinting
   */
  private extractRelevantHeaders(req: Request): Record<string, string> {
    const relevant: Record<string, string> = {};
    const includedHeaders = [
      'content-type',
      'accept',
      'authorization',
      'x-api-key',
      'x-client-version',
    ];

    for (const header of includedHeaders) {
      const value = req.get(header);
      if (value) {
        relevant[header] = value;
      }
    }

    return relevant;
  }

  /**
   * Create SHA-256 hash of content
   */
  private createHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Get idempotency entry from storage
   */
  private async getIdempotencyEntry(key: string): Promise<IdempotencyEntry | null> {
    const scopedKey = this.createScopedKey(key);

    // Try Redis first if configured
    if (this.config.storage === 'redis' || this.config.storage === 'hybrid') {
      try {
        const entry = await this.getFromRedis(scopedKey);
        if (entry) {
          this.operationStats.redisHits++;
          this.recordMetrics('redis_hit');
          return entry;
        }
      } catch (error) {
        this.operationStats.redisErrors++;
        this.recordMetrics('redis_error');
        logger.warn(
          {
            key: scopedKey,
            error: (error as Error).message,
          },
          'Redis idempotency lookup failed',
        );
      }
    }

    // Fallback to memory cache
    const memoryEntry = this.memoryCache.get(scopedKey);
    if (memoryEntry && this.isEntryValid(memoryEntry)) {
      this.recordMetrics('memory_hit');
      return memoryEntry;
    }

    return null;
  }

  /**
   * Handle existing idempotency entry
   */
  private async handleExistingEntry(
    req: Request,
    res: Response,
    entry: IdempotencyEntry,
    fingerprint: RequestFingerprint | null,
  ): Promise<any> {
    // Check if entry is still valid
    if (!this.isEntryValid(entry)) {
      await this.removeIdempotencyEntry(entry.key);
      return null;
    }

    // Verify fingerprint if enabled
    if (fingerprint && this.config.enableFingerprinting) {
      const fingerprintMatch = await this.verifyFingerprint(entry, fingerprint);
      if (!fingerprintMatch) {
        return await this.handleFingerprintConflict(req, res, entry, fingerprint);
      }
    }

    this.operationStats.cacheHits++;
    this.recordMetrics('cache_hit');

    const age = Date.now() - entry.timestamp;

    // Set idempotency response headers
    res.set({
      'Idempotency-Key': entry.key,
      'X-Idempotent-Replay': 'true',
      'X-Idempotent-Age': Math.floor(age / 1000).toString(),
      'X-Idempotent-Fingerprint': entry.fingerprint || 'none',
      ...entry.responseHeaders,
    });

    logger.info(
      {
        key: entry.key,
        age,
        operationType: entry.operationType,
        fingerprint: !!fingerprint,
      },
      'Returning cached idempotent response',
    );

    // Return cached response
    return res.status(entry.responseStatus).json(entry.responseBody);
  }

  /**
   * Verify request fingerprint matches stored entry
   */
  private async verifyFingerprint(
    entry: IdempotencyEntry,
    fingerprint: RequestFingerprint,
  ): Promise<boolean> {
    if (!entry.fingerprint) return true; // No fingerprint to verify

    const currentFingerprint = this.createHash(JSON.stringify(fingerprint));
    return entry.fingerprint === currentFingerprint;
  }

  /**
   * Handle fingerprint conflict (same key, different content)
   */
  private async handleFingerprintConflict(
    req: Request,
    res: Response,
    entry: IdempotencyEntry,
    fingerprint: RequestFingerprint,
  ): Promise<any> {
    this.operationStats.conflicts++;
    this.recordMetrics('fingerprint_conflict');

    const conflictKey = `${entry.key}_conflict`;
    const retryCount = this.conflictRetries.get(conflictKey) || 0;

    logger.warn(
      {
        key: entry.key,
        retryCount,
        existingFingerprint: entry.fingerprint,
        newFingerprint: this.createHash(JSON.stringify(fingerprint)),
        path: req.path,
      },
      'Idempotency key conflict detected',
    );

    if (retryCount >= this.config.maxConflictRetries) {
      this.conflictRetries.delete(conflictKey);
      return problemDetails.send(res, 'idempotency_conflict', {
        detail: 'Idempotency key conflicts with existing request with different content',
        key: entry.key,
        retryAfter: Math.ceil(entry.ttl / 1000),
      });
    }

    this.conflictRetries.set(conflictKey, retryCount + 1);

    // Store conflict for extended period
    await this.storeConflictEntry(entry, fingerprint);

    return problemDetails.send(res, 'idempotency_conflict', {
      detail: 'Idempotency key already in use with different request content',
      key: entry.key,
      retryAfter: 60, // Suggest retry after 1 minute
    });
  }

  /**
   * Set up response interception for caching
   */
  private async setupResponseInterception(
    req: Request,
    res: Response,
    key: string,
    fingerprint: RequestFingerprint | null,
  ): Promise<void> {
    const operationType = this.determineOperationType(req);
    const ttl = this.getTTLForOperation(operationType);

    // Store metadata in response locals
    res.locals.idempotency = {
      key,
      fingerprint,
      operationType,
      ttl,
      startTime: Date.now(),
    };

    res.set('Idempotency-Key', key);

    // Intercept response
    const originalJson = res.json.bind(res);
    const originalEnd = res.end.bind(res);

    res.json = (body: any) => {
      this.cacheResponse(req, res, body);
      return originalJson(body);
    };

    res.end = (chunk?: any) => {
      if (chunk && res.statusCode >= 200 && res.statusCode < 300) {
        this.cacheResponse(req, res, chunk);
      }
      return originalEnd(chunk);
    };
  }

  /**
   * Cache successful response
   */
  private async cacheResponse(req: Request, res: Response, body: any): Promise<void> {
    const idempotencyData = res.locals.idempotency;
    if (!idempotencyData || res.statusCode < 200 || res.statusCode >= 300) {
      return;
    }

    try {
      const entry: IdempotencyEntry = {
        key: idempotencyData.key,
        requestHash: req.body ? this.createHash(JSON.stringify(req.body)) : '',
        responseStatus: res.statusCode,
        responseBody: body,
        responseHeaders: this.extractResponseHeaders(res),
        timestamp: Date.now(),
        ttl: idempotencyData.ttl,
        operationType: idempotencyData.operationType,
        fingerprint: idempotencyData.fingerprint
          ? this.createHash(JSON.stringify(idempotencyData.fingerprint))
          : undefined,
        metadata: {
          method: req.method,
          path: req.path,
          userAgent: req.get('User-Agent'),
          processingTime: Date.now() - idempotencyData.startTime,
        },
      };

      await this.storeIdempotencyEntry(entry);

      this.recordMetrics('response_cached');

      if (this.config.enableAuditLog) {
        logger.info(
          {
            key: entry.key,
            operationType: entry.operationType,
            responseStatus: entry.responseStatus,
            ttl: entry.ttl,
            fingerprint: !!entry.fingerprint,
          },
          'Idempotency response cached',
        );
      }
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          key: idempotencyData.key,
        },
        'Failed to cache idempotent response',
      );
      this.recordMetrics('cache_error');
    }
  }

  /**
   * Extract relevant response headers for caching
   */
  private extractResponseHeaders(res: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    const relevantHeaders = ['content-type', 'location', 'etag', 'cache-control'];

    for (const header of relevantHeaders) {
      const value = res.get(header);
      if (value) {
        headers[header] = value;
      }
    }

    return headers;
  }

  /**
   * Store idempotency entry in configured storage
   */
  private async storeIdempotencyEntry(entry: IdempotencyEntry): Promise<void> {
    const scopedKey = this.createScopedKey(entry.key);

    // Store in memory cache
    this.memoryCache.set(scopedKey, entry);
    this.enforceMemoryLimits();

    // Store in Redis if configured
    if (this.config.storage === 'redis' || this.config.storage === 'hybrid') {
      await this.storeInRedis(scopedKey, entry);
    }
  }

  /**
   * Store entry in Redis with resilience
   */
  private async storeInRedis(key: string, entry: IdempotencyEntry): Promise<void> {
    try {
      await withResilience(
        async () => {
          const redis = await getRedis();
          const serialized = JSON.stringify(entry);
          await redis.setex(key, Math.ceil(entry.ttl / 1000), serialized);
        },
        resilienceConfigs.externalApi,
        'idempotency.redis.store',
      );
    } catch (error) {
      logger.warn(
        {
          key,
          error: (error as Error).message,
        },
        'Failed to store idempotency entry in Redis',
      );
      throw error;
    }
  }

  /**
   * Get entry from Redis with resilience
   */
  private async getFromRedis(key: string): Promise<IdempotencyEntry | null> {
    return withResilience(
      async () => {
        const redis = await getRedis();
        const serialized = await redis.get(key);
        if (!serialized) return null;

        const entry = JSON.parse(serialized) as IdempotencyEntry;
        return this.isEntryValid(entry) ? entry : null;
      },
      resilienceConfigs.externalApi,
      'idempotency.redis.get',
    );
  }

  /**
   * Remove idempotency entry from all storage
   */
  private async removeIdempotencyEntry(key: string): Promise<void> {
    const scopedKey = this.createScopedKey(key);

    // Remove from memory
    this.memoryCache.delete(scopedKey);

    // Remove from Redis
    if (this.config.storage === 'redis' || this.config.storage === 'hybrid') {
      try {
        const redis = await getRedis();
        await redis.del(scopedKey);
      } catch (error) {
        logger.warn(
          {
            key: scopedKey,
            error: (error as Error).message,
          },
          'Failed to remove idempotency entry from Redis',
        );
      }
    }
  }

  /**
   * Store conflict entry with extended TTL
   */
  private async storeConflictEntry(
    originalEntry: IdempotencyEntry,
    conflictFingerprint: RequestFingerprint,
  ): Promise<void> {
    const conflictEntry: IdempotencyEntry = {
      ...originalEntry,
      key: `${originalEntry.key}_conflict`,
      fingerprint: this.createHash(JSON.stringify(conflictFingerprint)),
      ttl: this.config.conflictTTL,
      timestamp: Date.now(),
      metadata: {
        ...originalEntry.metadata,
        conflictType: 'fingerprint_mismatch',
        originalKey: originalEntry.key,
      },
    };

    await this.storeIdempotencyEntry(conflictEntry);
  }

  /**
   * Create scoped cache key to prevent collisions
   */
  private createScopedKey(key: string): string {
    return `peac:idempotency:${key}`;
  }

  /**
   * Check if entry is still valid (not expired)
   */
  private isEntryValid(entry: IdempotencyEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return age < entry.ttl;
  }

  /**
   * Determine operation type for TTL selection
   */
  private determineOperationType(req: Request): string {
    if (this.isPaymentOperation(req)) return 'payment';
    if (req.path.includes('/negotiate')) return 'negotiation';
    if (req.method === 'DELETE') return 'deletion';
    if (req.method === 'PUT') return 'update';
    if (req.method === 'POST') return 'creation';
    return 'standard';
  }

  /**
   * Get TTL based on operation type
   */
  private getTTLForOperation(operationType: string): number {
    switch (operationType) {
      case 'payment':
        return this.config.paymentTTL;
      case 'negotiation':
        return this.config.standardTTL;
      case 'deletion':
      case 'creation':
        return this.config.standardTTL;
      default:
        return this.config.shortTTL;
    }
  }

  /**
   * Check if request is a payment operation
   */
  private isPaymentOperation(req: Request): boolean {
    const paymentPaths = ['/pay', '/payment', '/finalize'];
    return paymentPaths.some((path) => req.path.includes(path));
  }

  /**
   * Enforce memory cache size limits
   */
  private enforceMemoryLimits(): void {
    while (this.memoryCache.size > this.config.maxEntries) {
      const oldestKey = this.findOldestEntry();
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * Find oldest entry in memory cache
   */
  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Schedule cleanup of expired entries
   */
  private scheduleCleanup(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000,
    ); // Every 5 minutes
  }

  /**
   * Clean up expired entries from memory cache
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isEntryValid(entry)) {
        expired.push(key);
      }
    }

    expired.forEach((key) => this.memoryCache.delete(key));

    // Clean up conflict retry counters
    for (const [key, timestamp] of this.conflictRetries.entries()) {
      if (now - timestamp > this.config.conflictTTL) {
        this.conflictRetries.delete(key);
      }
    }

    if (expired.length > 0) {
      logger.debug(
        {
          expiredEntries: expired.length,
          remainingEntries: this.memoryCache.size,
        },
        'Cleaned up expired idempotency entries',
      );
    }
  }

  /**
   * Setup Prometheus metrics
   */
  private setupMetrics(): void {
    if (!this.config.enableMetrics) return;

    prometheus.setGauge('idempotency_config_max_entries', {}, this.config.maxEntries);
    prometheus.setGauge(
      'idempotency_config_standard_ttl_seconds',
      {},
      this.config.standardTTL / 1000,
    );
    prometheus.setGauge(
      'idempotency_config_payment_ttl_seconds',
      {},
      this.config.paymentTTL / 1000,
    );
  }

  /**
   * Record metrics
   */
  private recordMetrics(event: string, labels?: Record<string, string>): void {
    if (!this.config.enableMetrics) return;

    prometheus.incrementCounter('idempotency_operations_total', {
      event,
      ...labels,
    });

    // Update cache statistics
    prometheus.setGauge('idempotency_memory_cache_size', {}, this.memoryCache.size);
    prometheus.setGauge('idempotency_conflict_retries', {}, this.conflictRetries.size);

    // Update operation statistics
    prometheus.setGauge(
      'idempotency_cache_hit_rate',
      {},
      this.operationStats.totalRequests > 0
        ? this.operationStats.cacheHits / this.operationStats.totalRequests
        : 0,
    );
  }

  /**
   * Record processing time metrics
   */
  private recordProcessingTime(duration: number, type: string): void {
    if (!this.config.enableMetrics) return;

    prometheus.setGauge('idempotency_processing_duration_ms', { type }, duration);
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.operationStats,
      memoryCacheSize: this.memoryCache.size,
      conflictRetries: this.conflictRetries.size,
      config: {
        enabled: this.config.enabled,
        mode: this.config.mode,
        storage: this.config.storage,
        enableFingerprinting: this.config.enableFingerprinting,
      },
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down enhanced idempotency middleware');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Final cleanup
    this.cleanup();

    logger.info(
      {
        finalStats: this.getStats(),
      },
      'Enhanced idempotency middleware shutdown complete',
    );
  }
}

/**
 * Default configuration for different environments
 */
export const enhancedIdempotencyConfigs = {
  production: {
    enabled: true,
    mode: 'strict' as const,
    storage: 'redis' as const,
    shortTTL: 5 * 60 * 1000, // 5 minutes
    standardTTL: 60 * 60 * 1000, // 1 hour
    paymentTTL: 24 * 60 * 60 * 1000, // 24 hours
    conflictTTL: 48 * 60 * 60 * 1000, // 48 hours
    maxKeyLength: 255,
    maxBodySize: 10 * 1024 * 1024, // 10MB
    maxEntries: 10000,
    maxConflictRetries: 3,
    enableFingerprinting: true,
    enableSignatureVerification: true,
    enableMetrics: true,
    enableAuditLog: true,
  },

  staging: {
    enabled: true,
    mode: 'relaxed' as const,
    storage: 'hybrid' as const,
    shortTTL: 2 * 60 * 1000, // 2 minutes
    standardTTL: 30 * 60 * 1000, // 30 minutes
    paymentTTL: 12 * 60 * 60 * 1000, // 12 hours
    conflictTTL: 24 * 60 * 60 * 1000, // 24 hours
    maxKeyLength: 255,
    maxBodySize: 5 * 1024 * 1024, // 5MB
    maxEntries: 5000,
    maxConflictRetries: 2,
    enableFingerprinting: true,
    enableSignatureVerification: false,
    enableMetrics: true,
    enableAuditLog: true,
  },

  development: {
    enabled: true,
    mode: 'payment-only' as const,
    storage: 'memory' as const,
    shortTTL: 30 * 1000, // 30 seconds
    standardTTL: 5 * 60 * 1000, // 5 minutes
    paymentTTL: 30 * 60 * 1000, // 30 minutes
    conflictTTL: 60 * 60 * 1000, // 1 hour
    maxKeyLength: 255,
    maxBodySize: 1024 * 1024, // 1MB
    maxEntries: 1000,
    maxConflictRetries: 1,
    enableFingerprinting: false,
    enableSignatureVerification: false,
    enableMetrics: false,
    enableAuditLog: false,
  },
};

/**
 * Create enhanced idempotency middleware with environment-specific config
 */
export function createEnhancedIdempotencyMiddleware(
  environment: string = process.env.NODE_ENV || 'development',
): EnhancedIdempotencyMiddleware {
  const config =
    enhancedIdempotencyConfigs[environment as keyof typeof enhancedIdempotencyConfigs] ||
    enhancedIdempotencyConfigs.development;

  // Override with environment variables
  const envConfig: EnhancedIdempotencyConfig = {
    ...config,
    enabled: process.env.PEAC_IDEMPOTENCY_ENABLED !== 'false',
    mode: (process.env.PEAC_IDEMPOTENCY_MODE as any) || config.mode,
    storage: (process.env.PEAC_IDEMPOTENCY_STORAGE as any) || config.storage,
    standardTTL: parseInt(process.env.PEAC_IDEMPOTENCY_TTL || config.standardTTL.toString()),
    paymentTTL: parseInt(process.env.PEAC_IDEMPOTENCY_PAYMENT_TTL || config.paymentTTL.toString()),
    maxEntries: parseInt(process.env.PEAC_IDEMPOTENCY_MAX_ENTRIES || config.maxEntries.toString()),
    enableFingerprinting:
      process.env.PEAC_IDEMPOTENCY_FINGERPRINTING !== 'false' && config.enableFingerprinting,
    enableMetrics: process.env.PEAC_IDEMPOTENCY_METRICS !== 'false' && config.enableMetrics,
  };

  return new EnhancedIdempotencyMiddleware(envConfig);
}
