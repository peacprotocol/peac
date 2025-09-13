/**
 * Nonce-based replay protection for PEAC receipts
 * Default TTL: 300s (5 minutes max per spec)
 */

export interface NonceCache {
  has(nonce: string): Promise<boolean> | boolean;
  add(nonce: string, ttlSeconds?: number): Promise<void> | void;
  cleanup(): Promise<void> | void;
}

export interface NonceEntry {
  timestamp: number;
  expiresAt: number;
}

/**
 * In-memory TTL-based nonce cache
 * Uses monotonic timestamps and automatic cleanup
 */
export class InMemoryNonceCache implements NonceCache {
  private cache = new Map<string, NonceEntry>();
  private cleanupTimer?: NodeJS.Timeout;
  private readonly defaultTtlSeconds: number;
  private readonly cleanupIntervalMs: number;

  constructor(
    defaultTtlSeconds = 300, // 5 minutes max per v0.9.12.4 spec
    cleanupIntervalMs = 60000 // Clean every minute
  ) {
    if (defaultTtlSeconds > 300) {
      throw new Error('TTL cannot exceed 300 seconds (5 minutes)');
    }

    this.defaultTtlSeconds = defaultTtlSeconds;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.startCleanupTimer();
  }

  /**
   * Check if nonce exists and is not expired
   */
  has(nonce: string): boolean {
    const entry = this.cache.get(nonce);
    if (!entry) return false;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(nonce);
      return false;
    }

    return true;
  }

  /**
   * Add nonce with TTL
   */
  add(nonce: string, ttlSeconds?: number): void {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    if (ttl > 300) {
      throw new Error('TTL cannot exceed 300 seconds (5 minutes)');
    }

    const now = Date.now();
    const entry: NonceEntry = {
      timestamp: now,
      expiresAt: now + ttl * 1000,
    };

    this.cache.set(nonce, entry);
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [nonce, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(nonce);
      }
    }
  }

  /**
   * Get cache size (for testing)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);

    // Allow process to exit cleanly
    (this.cleanupTimer as any)?.unref?.();
  }

  /**
   * Stop cleanup timer
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }
}

/**
 * Check if nonce is replay attack (already exists in cache)
 */
export function isReplayAttack(nonce: string, cache: NonceCache): Promise<boolean> | boolean {
  return cache.has(nonce);
}

/**
 * Add nonce to prevent replay attacks
 */
export function preventReplay(
  nonce: string,
  cache: NonceCache,
  ttlSeconds?: number
): Promise<void> | void {
  return cache.add(nonce, ttlSeconds);
}

/**
 * Validate nonce format (should be UUIDv7 for receipts)
 */
export function isValidNonce(nonce: string): boolean {
  // UUIDv7 pattern
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce);
}
