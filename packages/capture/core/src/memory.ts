/**
 * @peac/capture-core - In-Memory Implementations
 *
 * Reference implementations for testing and development.
 * NOT for production use - use @peac/capture-node for durable storage.
 */

import type { SpoolStore, SpoolEntry, DedupeIndex, DedupeEntry } from './types';
import { GENESIS_DIGEST } from './types';

// =============================================================================
// In-Memory Spool Store
// =============================================================================

/**
 * In-memory spool store for testing.
 *
 * Features:
 * - Entries stored in array (ordered by sequence)
 * - commit() is a no-op (no durability)
 * - Useful for unit tests and development
 */
export class InMemorySpoolStore implements SpoolStore {
  private entries: SpoolEntry[] = [];
  private headDigest: string = GENESIS_DIGEST;
  private currentSequence: number = 0;
  private closed: boolean = false;

  /**
   * Append an entry to the spool.
   */
  async append(entry: SpoolEntry): Promise<number> {
    this.assertNotClosed();

    // Validate sequence
    if (entry.sequence !== this.currentSequence + 1) {
      throw new Error(
        `Invalid sequence: expected ${this.currentSequence + 1}, got ${entry.sequence}`
      );
    }

    // Validate chain
    if (entry.prev_entry_digest !== this.headDigest) {
      throw new Error(
        `Invalid chain: expected prev_entry_digest ${this.headDigest}, got ${entry.prev_entry_digest}`
      );
    }

    this.entries.push(entry);
    this.headDigest = entry.entry_digest;
    this.currentSequence = entry.sequence;

    return entry.sequence;
  }

  /**
   * Commit is a no-op for in-memory store.
   */
  async commit(): Promise<void> {
    this.assertNotClosed();
    // No-op for in-memory
  }

  /**
   * Read entries starting from a sequence number.
   */
  async read(fromSequence: number, limit?: number): Promise<SpoolEntry[]> {
    this.assertNotClosed();

    const startIndex = fromSequence > 0 ? fromSequence - 1 : 0;
    const entries = this.entries.slice(startIndex);

    if (limit !== undefined && limit > 0) {
      return entries.slice(0, limit);
    }

    return entries;
  }

  /**
   * Get the current head digest.
   */
  async getHeadDigest(): Promise<string> {
    this.assertNotClosed();
    return this.headDigest;
  }

  /**
   * Get the current sequence number.
   */
  async getSequence(): Promise<number> {
    this.assertNotClosed();
    return this.currentSequence;
  }

  /**
   * Close the store.
   */
  async close(): Promise<void> {
    this.closed = true;
  }

  /**
   * Check if store is closed.
   */
  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('SpoolStore is closed');
    }
  }

  // Test helpers (not part of interface)

  /**
   * Get all entries (for testing).
   */
  getAllEntries(): SpoolEntry[] {
    return [...this.entries];
  }

  /**
   * Clear all entries (for testing).
   */
  clear(): void {
    this.entries = [];
    this.headDigest = GENESIS_DIGEST;
    this.currentSequence = 0;
  }
}

// =============================================================================
// In-Memory Dedupe Index
// =============================================================================

/**
 * In-memory dedupe index for testing.
 *
 * Features:
 * - Entries stored in Map
 * - No persistence
 * - Returns resolved Promises (async interface, sync implementation)
 * - Useful for unit tests and development
 */
export class InMemoryDedupeIndex implements DedupeIndex {
  private entries: Map<string, DedupeEntry> = new Map();

  /**
   * Get entry by action ID.
   */
  async get(actionId: string): Promise<DedupeEntry | undefined> {
    return this.entries.get(actionId);
  }

  /**
   * Set entry for action ID.
   */
  async set(actionId: string, entry: DedupeEntry): Promise<void> {
    this.entries.set(actionId, entry);
  }

  /**
   * Check if action ID exists.
   */
  async has(actionId: string): Promise<boolean> {
    return this.entries.has(actionId);
  }

  /**
   * Mark an entry as emitted.
   */
  async markEmitted(actionId: string): Promise<boolean> {
    const entry = this.entries.get(actionId);
    if (!entry) {
      return false;
    }
    entry.emitted = true;
    return true;
  }

  /**
   * Delete entry.
   */
  async delete(actionId: string): Promise<boolean> {
    return this.entries.delete(actionId);
  }

  /**
   * Get count of entries.
   */
  async size(): Promise<number> {
    return this.entries.size;
  }

  /**
   * Clear all entries.
   */
  async clear(): Promise<void> {
    this.entries.clear();
  }

  // Test helpers (not part of interface)

  /**
   * Get all entries as array (for testing).
   */
  getAllEntries(): Array<[string, DedupeEntry]> {
    return [...this.entries.entries()];
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an in-memory spool store.
 */
export function createInMemorySpoolStore(): InMemorySpoolStore {
  return new InMemorySpoolStore();
}

/**
 * Create an in-memory dedupe index.
 */
export function createInMemoryDedupeIndex(): InMemoryDedupeIndex {
  return new InMemoryDedupeIndex();
}
