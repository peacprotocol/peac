/**
 * @peac/capture-node - Lockfile
 *
 * Single-writer guard using exclusive file creation (O_CREAT | O_EXCL).
 * Default: fail loudly if lock exists. Stale lock break is opt-in only.
 */

import * as fs from 'node:fs/promises';
import { hostname } from 'node:os';
import { LockfileError } from './errors.js';

// =============================================================================
// Types
// =============================================================================

export interface LockOptions {
  /** Allow breaking stale locks. Default: false (conservative). */
  allowStaleLockBreak?: boolean;
  /** Max age in ms before a lock is considered stale. Default: 3600000 (1 hour). */
  staleLockMaxAgeMs?: number;
}

interface LockPayload {
  pid: number;
  startTime: number;
  hostname: string;
  createdAt: string;
}

export interface LockHandle {
  /** Path to the lockfile. */
  lockPath: string;
  /** Release the lock (deletes the lockfile). */
  release(): Promise<void>;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Acquire an exclusive lockfile.
 *
 * Uses `fs.writeFile` with `wx` flag (O_CREAT | O_EXCL) for atomic creation.
 * If the lock already exists, either fail loudly (default) or attempt stale
 * lock break (opt-in).
 */
export async function acquireLock(filePath: string, options?: LockOptions): Promise<LockHandle> {
  const lockPath = filePath + '.lock';
  const allowStaleBreak = options?.allowStaleLockBreak ?? false;
  const staleMaxAge = options?.staleLockMaxAgeMs ?? 3_600_000;

  const payload: LockPayload = {
    pid: process.pid,
    startTime: Date.now(),
    hostname: getHostname(),
    createdAt: new Date().toISOString(),
  };

  try {
    // Atomic exclusive create -- fails if file exists
    await fs.writeFile(lockPath, JSON.stringify(payload, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o644,
    });
  } catch (err: unknown) {
    if (!isEnoent(err) && isEexist(err)) {
      // Lock file exists -- attempt stale break if allowed
      if (allowStaleBreak) {
        const broke = await tryBreakStaleLock(lockPath, staleMaxAge);
        if (broke) {
          // Retry after breaking stale lock
          try {
            await fs.writeFile(lockPath, JSON.stringify(payload, null, 2) + '\n', {
              flag: 'wx',
              mode: 0o644,
            });
          } catch (retryErr: unknown) {
            if (isEexist(retryErr)) {
              // Race: another process grabbed it between break and retry
              const holder = await readLockHolder(lockPath);
              throw new LockfileError(lockPath, holder?.pid);
            }
            throw retryErr;
          }
        } else {
          // Lock is not stale -- fail
          const holder = await readLockHolder(lockPath);
          throw new LockfileError(lockPath, holder?.pid);
        }
      } else {
        // Conservative mode: fail loudly
        const holder = await readLockHolder(lockPath);
        throw new LockfileError(lockPath, holder?.pid);
      }
    } else {
      // Unexpected error (permissions, disk full, etc.)
      throw err;
    }
  }

  let released = false;
  return {
    lockPath,
    async release() {
      if (released) return;
      released = true;
      try {
        await fs.unlink(lockPath);
      } catch {
        // Ignore unlink errors on release (lockfile may already be gone)
      }
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Read the lock holder info from the lockfile.
 */
async function readLockHolder(lockPath: string): Promise<LockPayload | undefined> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8');
    return JSON.parse(content) as LockPayload;
  } catch {
    return undefined;
  }
}

/**
 * Attempt to break a stale lock.
 *
 * A lock is stale if its age exceeds staleLockMaxAgeMs.
 * Returns true if the lock was broken.
 */
async function tryBreakStaleLock(lockPath: string, maxAgeMs: number): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;

    if (ageMs > maxAgeMs) {
      await fs.unlink(lockPath);
      return true;
    }

    return false;
  } catch {
    // If we can't stat the lock (e.g., it was just removed), treat as broken
    return true;
  }
}

function getHostname(): string {
  try {
    return hostname();
  } catch {
    return 'unknown';
  }
}

function isEexist(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'EEXIST';
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT';
}
