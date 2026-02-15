/**
 * @peac/capture-node - Filesystem Dedupe Index
 *
 * Map-backed deduplication index with append-only file persistence.
 * Last-write-wins on reload (tolerates duplicate lines from crash replay).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DedupeIndex, DedupeEntry } from '@peac/capture-core';

// =============================================================================
// Types
// =============================================================================

export interface FsDedupeIndexOptions {
  /** Path to dedupe.idx file. */
  filePath: string;
}

/**
 * Operations written to the append-only dedupe file.
 */
interface DedupeOp {
  op: 'set' | 'emit' | 'delete' | 'clear';
  actionId?: string;
  entry?: DedupeEntry;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a filesystem-backed dedupe index.
 */
export async function createFsDedupeIndex(options: FsDedupeIndexOptions): Promise<FsDedupeIndex> {
  const index = new FsDedupeIndex(options);
  await index.init();
  return index;
}

// =============================================================================
// Implementation
// =============================================================================

export class FsDedupeIndex implements DedupeIndex {
  private readonly filePath: string;
  private readonly entries: Map<string, DedupeEntry> = new Map();
  private fd: fs.FileHandle | null = null;
  private closed: boolean = false;
  private firstCreate: boolean = false;

  constructor(options: FsDedupeIndexOptions) {
    this.filePath = options.filePath;
  }

  /**
   * Initialize: load existing entries from file.
   */
  async init(): Promise<void> {
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    // Check if this is a fresh index (for directory fsync)
    try {
      await fs.access(this.filePath);
      this.firstCreate = false;
    } catch {
      this.firstCreate = true;
    }

    // Load existing data
    await this.loadFromFile();

    // Open for appending
    this.fd = await fs.open(this.filePath, 'a');
  }

  // ===========================================================================
  // DedupeIndex Interface
  // ===========================================================================

  async get(actionId: string): Promise<DedupeEntry | undefined> {
    this.assertNotClosed();
    return this.entries.get(actionId);
  }

  async set(actionId: string, entry: DedupeEntry): Promise<void> {
    this.assertNotClosed();
    this.entries.set(actionId, { ...entry });

    // Append op to file (no fsync -- batched with spool commit)
    await this.appendOp({ op: 'set', actionId, entry });
  }

  async has(actionId: string): Promise<boolean> {
    this.assertNotClosed();
    return this.entries.has(actionId);
  }

  async markEmitted(actionId: string): Promise<boolean> {
    this.assertNotClosed();
    const entry = this.entries.get(actionId);
    if (!entry) return false;

    entry.emitted = true;

    // Append emit marker to file
    await this.appendOp({ op: 'emit', actionId });

    return true;
  }

  async delete(actionId: string): Promise<boolean> {
    this.assertNotClosed();
    const existed = this.entries.delete(actionId);

    if (existed) {
      await this.appendOp({ op: 'delete', actionId });
    }

    return existed;
  }

  async size(): Promise<number> {
    this.assertNotClosed();
    return this.entries.size;
  }

  async clear(): Promise<void> {
    this.assertNotClosed();
    this.entries.clear();

    // Close current fd, truncate file, reopen
    if (this.fd) {
      await this.fd.close();
    }
    await fs.writeFile(this.filePath, '', 'utf-8');
    this.fd = await fs.open(this.filePath, 'a');
  }

  // ===========================================================================
  // Extra: commit() -- not on DedupeIndex interface
  //
  // Callers use type guard:
  //   if ('commit' in dedupe && typeof dedupe.commit === 'function')
  //     await dedupe.commit();
  // ===========================================================================

  /**
   * Flush pending writes to durable storage.
   *
   * Not part of the DedupeIndex interface (capture-core stays stable).
   * Callers use type guard to detect this method on the concrete type.
   */
  async commit(): Promise<void> {
    this.assertNotClosed();
    if (this.fd) {
      await this.fd.sync();
    }

    // On first creation, fsync the parent directory for directory entry durability.
    // Best-effort: not all platforms support fsync on a directory fd.
    if (this.firstCreate) {
      this.firstCreate = false;
      await this.fsyncDir().catch(() => {
        // Non-critical: directory fsync not supported on all platforms
      });
    }
  }

  // ===========================================================================
  // Close
  // ===========================================================================

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.fd) {
      try {
        await this.fd.sync();
      } catch {
        // Best-effort on close
      }
      await this.fd.close();
      this.fd = null;
    }
  }

  // ===========================================================================
  // Internals
  // ===========================================================================

  /**
   * Load entries from the dedupe file.
   * Last-write-wins for duplicate actionIds (handles crash replay).
   */
  private async loadFromFile(): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(this.filePath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return; // No file yet -- fresh index
      }
      throw err;
    }

    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      let op: DedupeOp;
      try {
        op = JSON.parse(line) as DedupeOp;
      } catch {
        // Skip malformed lines (crash artifact)
        continue;
      }

      switch (op.op) {
        case 'set':
          if (op.actionId && op.entry) {
            this.entries.set(op.actionId, op.entry);
          }
          break;
        case 'emit':
          if (op.actionId) {
            const entry = this.entries.get(op.actionId);
            if (entry) {
              entry.emitted = true;
            }
          }
          break;
        case 'delete':
          if (op.actionId) {
            this.entries.delete(op.actionId);
          }
          break;
        case 'clear':
          this.entries.clear();
          break;
      }
    }
  }

  /**
   * Append an operation to the dedupe file (no fsync).
   */
  private async appendOp(op: DedupeOp): Promise<void> {
    if (!this.fd) return;
    const line = JSON.stringify(op) + '\n';
    await this.fd.write(line, null, 'utf-8');
  }

  /**
   * fsync the parent directory for directory entry durability on first creation.
   * Best-effort: not all platforms support this (e.g. Windows).
   */
  private async fsyncDir(): Promise<void> {
    const dirPath = path.dirname(this.filePath);
    const dirFd = await fs.open(dirPath, 'r');
    try {
      await dirFd.sync();
    } finally {
      await dirFd.close();
    }
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('FsDedupeIndex is closed');
    }
  }
}
