/**
 * @peac/crawler v0.9.12.1 - Verification cache with in-flight deduplication
 * LRU cache with 1-minute TTL and request coalescing for identical verifications
 */

import { LRUCache } from 'lru-cache';
import { VerifyRequest, VerificationResult } from './types.js';

export interface CacheStats {
  size: number;
  inflight: number;
  hits: number;
  misses: number;
  hit_rate: number;
}

export class VerificationCache {
  private cache = new LRUCache<string, VerificationResult>({
    max: 10_000,
    ttl: 60_000, // 1 minute TTL
  });

  private inFlight = new Map<string, Promise<VerificationResult>>();
  private stats = { hits: 0, misses: 0 };

  constructor(private readonly namespace: string) {}

  key(req: VerifyRequest): string {
    return `${this.namespace}:${req.ip}:${req.userAgent}`;
  }

  async getOrCompute(
    req: VerifyRequest,
    compute: () => Promise<VerificationResult>
  ): Promise<VerificationResult> {
    const k = this.key(req);

    // 1) Check cache hit
    const cached = this.cache.get(k);
    if (cached) {
      this.stats.hits++;
      return { ...cached, fromCache: true };
    }

    // 2) Check in-flight deduplication
    const flying = this.inFlight.get(k);
    if (flying) {
      this.stats.hits++; // Count as hit since we're avoiding duplicate work
      return flying;
    }

    // 3) Compute with deduplication
    this.stats.misses++;
    const promise = compute()
      .then((result) => {
        this.cache.set(k, result);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(k);
      });

    this.inFlight.set(k, promise);
    return promise;
  }

  has(req: VerifyRequest): boolean {
    return this.cache.has(this.key(req));
  }

  delete(req: VerifyRequest): boolean {
    const k = this.key(req);
    this.inFlight.delete(k);
    return this.cache.delete(k);
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      inflight: this.inFlight.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hit_rate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  // For testing/debugging
  getCacheKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  getInFlightKeys(): string[] {
    return Array.from(this.inFlight.keys());
  }
}
