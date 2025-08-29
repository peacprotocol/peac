import type { JWK } from 'jose';

export interface DirRecord {
  origin: string;
  etag?: string;
  lastModified?: string;
  verifiedAt: number;
  expiresAt: number;
  keys: Array<{ thumbprint: string; jwk: JWK }>;
  pinnedThumbs?: Set<string>; // TOFU pinning
}

export interface Cache {
  get(origin: string): DirRecord | undefined;
  set(rec: DirRecord): void;
  setNegative(origin: string, until: number): void;
  getNegative(origin: string): number | undefined;
  clear(): void;
}

// In-memory cache implementation
class DirectoryCache implements Cache {
  private records = new Map<string, DirRecord>();
  private negativeCache = new Map<string, number>();
  private maxSize = 1000; // Max cached directories

  get(origin: string): DirRecord | undefined {
    const rec = this.records.get(origin);
    if (rec && rec.expiresAt > Date.now()) {
      return rec;
    }
    if (rec) {
      this.records.delete(origin);
    }
    return undefined;
  }

  set(rec: DirRecord): void {
    // LRU eviction if at max size
    if (this.records.size >= this.maxSize && !this.records.has(rec.origin)) {
      const oldest = this.records.keys().next().value;
      if (oldest) {
        this.records.delete(oldest);
      }
    }
    this.records.set(rec.origin, rec);
  }

  setNegative(origin: string, until: number): void {
    this.negativeCache.set(origin, until);
  }

  getNegative(origin: string): number | undefined {
    const until = this.negativeCache.get(origin);
    if (until && until > Date.now()) {
      return until;
    }
    if (until) {
      this.negativeCache.delete(origin);
    }
    return undefined;
  }

  clear(): void {
    this.records.clear();
    this.negativeCache.clear();
  }
}

// Singleflight implementation to prevent stampedes
const inflightRequests = new Map<string, Promise<unknown>>();

export async function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const promise = fn().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

// Export singleton cache instance
export const directoryCache = new DirectoryCache();

// Jittered backoff for negative cache
export function getJitteredBackoff(minMs: number, maxMs: number): number {
  const jitter = Math.random() * (maxMs - minMs);
  return Math.floor(minMs + jitter);
}

// Helper to check if thumbprints overlap for rotation
export function hasThumbprintOverlap(oldThumbs: Set<string>, newThumbs: Set<string>): boolean {
  for (const thumb of newThumbs) {
    if (oldThumbs.has(thumb)) {
      return true;
    }
  }
  return false;
}
