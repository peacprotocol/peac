/**
 * @peac/capture-node - Filesystem Spool Store
 *
 * Append-only JSONL spool with tamper-evident chaining.
 * Production-grade: crash recovery, hard-cap limits, streaming reads,
 * single-writer lockfile, meta file for fast startup, max line guard.
 *
 * Durability model:
 *   append() writes without fsync (throughput).
 *   commit() fsyncs (durability).
 *   Auto-commit timer (default 5s) prevents unflushed windows.
 *
 * Commit ordering (when used with dedupe):
 *   Spool commit first, dedupe commit second (best-effort).
 *   Spool is the authoritative evidence log; dedupe is an optimization index.
 *   If dedupe.commit() fails after spool.commit(), worst case is re-emitting
 *   some receipts after restart -- no evidence is lost.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SpoolStore, SpoolEntry } from '@peac/capture-core';
import { GENESIS_DIGEST } from '@peac/capture-core';
import { SpoolFullError, SpoolCorruptError } from './errors.js';
import type { CorruptReason } from './errors.js';
import { acquireLock, type LockOptions, type LockHandle } from './lockfile.js';
import { streamLines, truncateFile } from './line-reader.js';

// =============================================================================
// Constants
// =============================================================================

/** Meta file format version. Reject unknown versions on load. */
const META_VERSION = 1;

/** Max line length in bytes during read(). Lines exceeding this = corrupt. */
const DEFAULT_MAX_LINE_BYTES = 4 * 1024 * 1024; // 4MB

// =============================================================================
// Types
// =============================================================================

export interface FsSpoolStoreOptions {
  /** Path to spool.jsonl. */
  filePath: string;
  /** Maximum entries before spool is full. Default: 100_000. */
  maxEntries?: number;
  /** Maximum file size in bytes before spool is full. Default: 100MB. */
  maxFileBytes?: number;
  /** Maximum allowed line length in bytes during read(). Default: 4MB. */
  maxLineBytes?: number;
  /** Auto-commit interval in ms. Default: 5000 (5s). 0 = disabled. */
  autoCommitIntervalMs?: number;
  /** Lockfile options. */
  lockOptions?: LockOptions;
  /** Warning callback (crash recovery, stale lock, etc.). */
  onWarning?: (msg: string) => void;
}

interface SpoolMeta {
  metaVersion: number;
  sequence: number;
  headDigest: string;
  entryCount: number;
  fileBytes: number;
  mtimeMs: number;
}

/**
 * Diagnostic snapshot for operator tooling (e.g. /peac-status).
 *
 * Queryable without parsing error strings. Use `getFsSpoolDiagnostics()`
 * or access `store.diagnostics()` on the concrete type.
 */
export interface SpoolDiagnostics {
  /** Operational mode: 'active' = capturing, 'read_only' = full/corrupt. */
  mode: 'active' | 'read_only';
  /** Whether the spool has reached its hard-cap limit. */
  spoolFull: boolean;
  /** Whether linkage corruption was detected on load. */
  spoolCorrupt: boolean;
  /** Why the spool was marked corrupt. Only set when spoolCorrupt is true. */
  corruptReason?: CorruptReason;
  /** Sequence number where corruption was detected. */
  corruptAtSequence?: number;
  /** Current entry count. */
  entryCount: number;
  /** Current file size in bytes. */
  fileBytes: number;
  /** Configured max entries. */
  maxEntries: number;
  /** Configured max file bytes. */
  maxFileBytes: number;
  /** Path to the spool file. */
  filePath: string;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a filesystem-backed spool store.
 *
 * Acquires a single-writer lockfile, loads existing data (or recovers from
 * crash), and returns a SpoolStore ready for use.
 */
export async function createFsSpoolStore(options: FsSpoolStoreOptions): Promise<FsSpoolStore> {
  const store = new FsSpoolStore(options);
  await store.init();
  return store;
}

// =============================================================================
// Diagnostics Helper
// =============================================================================

/**
 * Get spool diagnostics from a SpoolStore via type guard.
 *
 * Usage:
 *   const diag = getFsSpoolDiagnostics(store);
 *   if (diag) { // store is FsSpoolStore }
 */
export function getFsSpoolDiagnostics(store: SpoolStore): SpoolDiagnostics | undefined {
  if (
    store !== null &&
    typeof store === 'object' &&
    'diagnostics' in store &&
    typeof (store as Record<string, unknown>).diagnostics === 'function'
  ) {
    return (store as FsSpoolStore).diagnostics();
  }
  return undefined;
}

// =============================================================================
// Implementation
// =============================================================================

export class FsSpoolStore implements SpoolStore {
  private readonly filePath: string;
  private readonly metaPath: string;
  private readonly maxEntries: number;
  private readonly maxFileBytes: number;
  private readonly maxLineBytes: number;
  private readonly autoCommitIntervalMs: number;
  private readonly lockOptions: LockOptions | undefined;
  private readonly onWarning: (msg: string) => void;

  // In-memory state (loaded on init, updated on append)
  private sequence: number = 0;
  private headDigest: string = GENESIS_DIGEST;
  private entryCount: number = 0;
  private fileBytes: number = 0;

  // File handle for appending
  private fd: fs.FileHandle | null = null;
  private lock: LockHandle | null = null;
  private closed: boolean = false;
  private corrupt: boolean = false;
  private corruptReason: CorruptReason | undefined;
  private corruptAtSequence: number | undefined;
  private firstCreate: boolean = false;

  // Auto-commit
  private dirty: boolean = false;
  private autoCommitTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: FsSpoolStoreOptions) {
    this.filePath = options.filePath;
    this.metaPath = options.filePath + '.meta.json';
    this.maxEntries = options.maxEntries ?? 100_000;
    this.maxFileBytes = options.maxFileBytes ?? 100 * 1024 * 1024;
    this.maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
    this.autoCommitIntervalMs = options.autoCommitIntervalMs ?? 5_000;
    this.lockOptions = options.lockOptions;
    this.onWarning = options.onWarning ?? (() => {});
  }

  /**
   * Initialize: acquire lock, load or recover state, open file handle.
   */
  async init(): Promise<void> {
    const dirPath = path.dirname(this.filePath);

    // Ensure parent directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Acquire single-writer lock
    this.lock = await acquireLock(this.filePath, this.lockOptions);

    try {
      // Check if this is a fresh spool (for directory fsync)
      let fileExists: boolean;
      try {
        await fs.access(this.filePath);
        fileExists = true;
      } catch {
        fileExists = false;
      }
      this.firstCreate = !fileExists;

      // Try meta file fast path
      const metaLoaded = fileExists && (await this.tryLoadMeta());

      if (!metaLoaded && fileExists) {
        // Full scan: read JSONL line by line, recover from crash
        await this.fullScan();
      }

      // Open file for appending
      this.fd = await fs.open(this.filePath, 'a');

      // Start auto-commit timer
      if (this.autoCommitIntervalMs > 0) {
        this.autoCommitTimer = setInterval(() => {
          if (this.dirty && !this.closed) {
            this.commit().catch((err) => {
              this.onWarning(`Auto-commit failed: ${String(err)}`);
            });
          }
        }, this.autoCommitIntervalMs);
        // Unref so the timer doesn't keep the process alive
        if (typeof this.autoCommitTimer === 'object' && 'unref' in this.autoCommitTimer) {
          this.autoCommitTimer.unref();
        }
      }
    } catch (err) {
      // If init fails after lock acquired, release lock
      await this.lock.release();
      this.lock = null;
      throw err;
    }
  }

  // ===========================================================================
  // SpoolStore Interface
  // ===========================================================================

  async append(entry: SpoolEntry): Promise<number> {
    this.assertWritable();

    // Hard-cap: entry count
    if (this.entryCount >= this.maxEntries) {
      throw new SpoolFullError(this.entryCount, this.maxEntries, 'entries');
    }

    // Serialize
    const line = JSON.stringify(entry) + '\n';
    const lineBytes = Buffer.byteLength(line, 'utf-8');

    // Hard-cap: file size
    if (this.fileBytes + lineBytes > this.maxFileBytes) {
      throw new SpoolFullError(this.fileBytes, this.maxFileBytes, 'bytes');
    }

    // Validate chain linkage
    if (entry.prev_entry_digest !== this.headDigest) {
      throw new Error(
        `Invalid chain: expected prev_entry_digest ${this.headDigest}, got ${entry.prev_entry_digest}`
      );
    }

    // Validate sequence monotonicity
    if (entry.sequence !== this.sequence + 1) {
      throw new Error(`Invalid sequence: expected ${this.sequence + 1}, got ${entry.sequence}`);
    }

    // Write (no fsync -- batched with commit)
    await this.fd!.write(line, null, 'utf-8');

    // Update in-memory state
    this.headDigest = entry.entry_digest;
    this.sequence = entry.sequence;
    this.entryCount++;
    this.fileBytes += lineBytes;
    this.dirty = true;

    return entry.sequence;
  }

  async commit(): Promise<void> {
    this.assertNotClosed();

    if (!this.dirty || !this.fd) return;

    // fsync the spool file
    await this.fd.sync();
    this.dirty = false;

    // On first creation, fsync the parent directory for directory entry durability.
    // Best-effort: not all platforms support fsync on a directory fd.
    if (this.firstCreate) {
      this.firstCreate = false;
      await this.fsyncDir().catch((err) => {
        this.onWarning(`Directory fsync failed (non-critical): ${String(err)}`);
      });
    }

    // Write meta file (best-effort -- meta is an optimization, not critical)
    await this.writeMeta().catch((err) => {
      this.onWarning(`Meta file write failed: ${String(err)}`);
    });
  }

  async read(fromSequence: number, limit?: number): Promise<SpoolEntry[]> {
    this.assertNotClosed();

    const entries: SpoolEntry[] = [];
    const effectiveLimit = limit !== undefined && limit > 0 ? limit : Infinity;

    // Pre-materialization streaming read: maxLineBytes enforced BEFORE
    // the line is converted to a JS string. Prevents memory blowup from
    // a single giant line.
    for await (const result of streamLines({
      filePath: this.filePath,
      maxLineBytes: this.maxLineBytes,
    })) {
      if (result.kind === 'line_too_large') {
        this.onWarning(
          `Line at byte offset ${result.byteOffset} exceeds maxLineBytes ` +
            `(${result.accumulatedBytes}/${this.maxLineBytes}) -- marking corrupt`
        );
        this.setCorrupt('LINE_TOO_LARGE', this.sequence);
        break;
      }

      // Both 'line' and 'incomplete_tail' have the parsed string
      if (!result.line.trim()) continue;

      let entry: SpoolEntry;
      try {
        entry = JSON.parse(result.line) as SpoolEntry;
      } catch {
        // Skip malformed lines (crash recovery truncated them)
        continue;
      }

      if (entry.sequence >= fromSequence) {
        entries.push(entry);
        if (entries.length >= effectiveLimit) {
          break; // Early stop
        }
      }
    }

    return entries;
  }

  async getHeadDigest(): Promise<string> {
    this.assertNotClosed();
    return this.headDigest;
  }

  async getSequence(): Promise<number> {
    this.assertNotClosed();
    return this.sequence;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Stop auto-commit timer
    if (this.autoCommitTimer !== null) {
      clearInterval(this.autoCommitTimer);
      this.autoCommitTimer = null;
    }

    // Final fsync + close fd
    if (this.fd) {
      if (this.dirty) {
        try {
          await this.fd.sync();
          this.dirty = false;
          await this.writeMeta().catch(() => {});
        } catch {
          // Best-effort on close
        }
      }
      await this.fd.close();
      this.fd = null;
    }

    // Release lockfile
    if (this.lock) {
      await this.lock.release();
      this.lock = null;
    }
  }

  // ===========================================================================
  // Diagnostics (P0-7: queryable without parsing error strings)
  // ===========================================================================

  /**
   * Get a diagnostic snapshot for operator tooling.
   *
   * Use `getFsSpoolDiagnostics(store)` if you have a generic SpoolStore
   * reference and need to probe for this method via type guard.
   */
  diagnostics(): SpoolDiagnostics {
    const full = this.entryCount >= this.maxEntries || this.fileBytes >= this.maxFileBytes;
    return {
      mode: full || this.corrupt ? 'read_only' : 'active',
      spoolFull: full,
      spoolCorrupt: this.corrupt,
      corruptReason: this.corruptReason,
      corruptAtSequence: this.corruptAtSequence,
      entryCount: this.entryCount,
      fileBytes: this.fileBytes,
      maxEntries: this.maxEntries,
      maxFileBytes: this.maxFileBytes,
      filePath: this.filePath,
    };
  }

  /** Whether the spool has reached its hard-cap limit. */
  get isFull(): boolean {
    return this.entryCount >= this.maxEntries || this.fileBytes >= this.maxFileBytes;
  }

  /** Whether linkage corruption was detected on load. */
  get isCorrupt(): boolean {
    return this.corrupt;
  }

  /** Current entry count. */
  get currentEntryCount(): number {
    return this.entryCount;
  }

  /** Current file size in bytes. */
  get currentFileBytes(): number {
    return this.fileBytes;
  }

  /** Configured max entries. */
  get maxEntryLimit(): number {
    return this.maxEntries;
  }

  /** Configured max file bytes. */
  get maxBytesLimit(): number {
    return this.maxFileBytes;
  }

  // ===========================================================================
  // Initialization Internals
  // ===========================================================================

  /**
   * Try to load state from meta file (fast path).
   * Returns true if meta was valid and loaded.
   */
  private async tryLoadMeta(): Promise<boolean> {
    try {
      let metaContent: string;
      try {
        metaContent = await fs.readFile(this.metaPath, 'utf-8');
      } catch {
        // New meta path not found -- try legacy path (spool.meta.json instead of spool.jsonl.meta.json).
        // One-release fallback: if old meta exists, read it, then write new meta on next commit.
        const legacyMetaPath = this.filePath.replace(/\.jsonl$/, '.meta.json');
        if (legacyMetaPath !== this.metaPath) {
          try {
            metaContent = await fs.readFile(legacyMetaPath, 'utf-8');
          } catch {
            return false;
          }
        } else {
          return false;
        }
      }

      const fileStat = await fs.stat(this.filePath);
      const meta = JSON.parse(metaContent) as SpoolMeta;

      // Reject unknown meta format versions
      if (meta.metaVersion !== META_VERSION) {
        this.onWarning(
          `Meta file version mismatch (expected ${META_VERSION}, got ${meta.metaVersion}) -- falling back to full scan`
        );
        return false;
      }

      // Trust meta only if both fileBytes and mtimeMs match
      if (meta.fileBytes !== fileStat.size || meta.mtimeMs !== fileStat.mtimeMs) {
        this.onWarning(
          `Meta file mismatch (fileBytes: ${meta.fileBytes}/${fileStat.size}, ` +
            `mtimeMs: ${meta.mtimeMs}/${fileStat.mtimeMs}) -- falling back to full scan`
        );
        return false;
      }

      this.sequence = meta.sequence;
      this.headDigest = meta.headDigest;
      this.entryCount = meta.entryCount;
      this.fileBytes = meta.fileBytes;

      return true;
    } catch {
      // Invalid meta content -- fall back to full scan
      return false;
    }
  }

  /**
   * Full JSONL scan: stream line by line, verify linkage, recover from crash.
   *
   * Uses the custom streaming line parser (streamLines) which enforces
   * maxLineBytes BEFORE materializing the line as a JS string. This prevents
   * memory blowup from a single giant line -- the primary "local file DoS" vector.
   *
   * Crash recovery rules:
   * - Incomplete last line (no trailing newline + invalid JSON): truncate tail only.
   * - Invalid JSON mid-file (before the last line): mark spool_corrupt, do NOT auto-repair.
   *   Auto-repair mid-file would mask real tampering.
   */
  private async fullScan(): Promise<void> {
    let prevDigest = GENESIS_DIGEST;
    let shouldTruncateAt: number | undefined;
    let lineNumber = 0;

    for await (const result of streamLines({
      filePath: this.filePath,
      maxLineBytes: this.maxLineBytes,
    })) {
      lineNumber++;

      if (result.kind === 'line_too_large') {
        this.onWarning(
          `Line ${lineNumber} exceeds maxLineBytes ` +
            `(${result.accumulatedBytes}/${this.maxLineBytes}) -- marking spool corrupt`
        );
        this.setCorrupt('LINE_TOO_LARGE', this.sequence);
        break;
      }

      const lineStr = result.line;
      if (!lineStr.trim()) continue;

      let entry: SpoolEntry;
      try {
        entry = JSON.parse(lineStr) as SpoolEntry;
      } catch {
        if (result.kind === 'incomplete_tail') {
          // Crash artifact at tail -- truncate to start of this line
          this.onWarning(
            `Incomplete last line detected (${result.byteLength} bytes) -- truncating`
          );
          shouldTruncateAt = result.byteOffset;
        } else {
          // Malformed JSON mid-file -- corrupt (do NOT auto-repair)
          this.onWarning(`Malformed JSON at line ${lineNumber} -- marking spool corrupt`);
          this.setCorrupt('MALFORMED_JSON', this.sequence);
        }
        break;
      }

      // Verify linkage
      if (entry.prev_entry_digest !== prevDigest) {
        this.onWarning(
          `Chain linkage broken at sequence ${entry.sequence}: ` +
            `expected ${prevDigest}, got ${entry.prev_entry_digest}`
        );
        this.setCorrupt('CHAIN_BROKEN', entry.sequence);
        break;
      }

      prevDigest = entry.entry_digest;
      this.sequence = entry.sequence;
      this.headDigest = entry.entry_digest;
      this.entryCount++;
    }

    // Truncate if needed (crash tail only, not mid-file corruption)
    if (shouldTruncateAt !== undefined && !this.corrupt) {
      await truncateFile(this.filePath, shouldTruncateAt);
    }

    // Compute file size from actual file
    try {
      const stat = await fs.stat(this.filePath);
      this.fileBytes = stat.size;
    } catch {
      this.fileBytes = 0;
    }
  }

  /**
   * Write meta file for fast startup.
   */
  private async writeMeta(): Promise<void> {
    const stat = await fs.stat(this.filePath);
    const meta: SpoolMeta = {
      metaVersion: META_VERSION,
      sequence: this.sequence,
      headDigest: this.headDigest,
      entryCount: this.entryCount,
      fileBytes: stat.size,
      mtimeMs: stat.mtimeMs,
    };
    // Atomic write: write to temp then rename
    const tmpPath = this.metaPath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
    await fs.rename(tmpPath, this.metaPath);
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

  // ===========================================================================
  // Guards
  // ===========================================================================

  /**
   * Mark the spool as corrupt with a specific reason.
   */
  private setCorrupt(reason: CorruptReason, atSequence?: number): void {
    this.corrupt = true;
    this.corruptReason = reason;
    this.corruptAtSequence = atSequence;
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('FsSpoolStore is closed');
    }
  }

  private assertWritable(): void {
    this.assertNotClosed();
    if (this.corrupt) {
      throw new SpoolCorruptError(this.corruptReason ?? 'CHAIN_BROKEN', this.corruptAtSequence);
    }
  }
}
