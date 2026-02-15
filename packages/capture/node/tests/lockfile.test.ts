/**
 * Tests for lockfile acquisition and release.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { acquireLock, LockfileError } from '../src/index.js';

describe('lockfile', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-lock-'));
    filePath = path.join(tmpDir, 'test.jsonl');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('acquires and releases a lock', async () => {
    const lock = await acquireLock(filePath);

    // Lock file should exist
    const lockPath = filePath + '.lock';
    const stat = await fs.stat(lockPath);
    expect(stat.isFile()).toBe(true);

    // Lock payload should contain pid
    const content = JSON.parse(await fs.readFile(lockPath, 'utf-8'));
    expect(content.pid).toBe(process.pid);
    expect(content.hostname).toBeTruthy();
    expect(content.createdAt).toBeTruthy();

    // Release
    await lock.release();

    // Lock file should be gone
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it('fails when lock already held (conservative default)', async () => {
    const lock1 = await acquireLock(filePath);

    // Second acquire should fail with LockfileError
    await expect(acquireLock(filePath)).rejects.toThrow(LockfileError);
    await expect(acquireLock(filePath)).rejects.toThrow(/Another PEAC instance/);

    await lock1.release();
  });

  it('succeeds after lock released', async () => {
    const lock1 = await acquireLock(filePath);
    await lock1.release();

    // Should succeed now
    const lock2 = await acquireLock(filePath);
    await lock2.release();
  });

  it('double release is safe', async () => {
    const lock = await acquireLock(filePath);
    await lock.release();
    await lock.release(); // Should not throw
  });

  it('breaks stale lock when opt-in', async () => {
    // Create a stale lock manually
    const lockPath = filePath + '.lock';
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    const stalePayload = {
      pid: 999999,
      startTime: Date.now() - 7200_000, // 2 hours ago
      hostname: 'stale-host',
      createdAt: new Date(Date.now() - 7200_000).toISOString(),
    };
    await fs.writeFile(lockPath, JSON.stringify(stalePayload) + '\n');

    // Set mtime to 2 hours ago so stale detection works
    const twoHoursAgo = new Date(Date.now() - 7200_000);
    await fs.utimes(lockPath, twoHoursAgo, twoHoursAgo);

    // Without opt-in: should fail
    await expect(acquireLock(filePath)).rejects.toThrow(LockfileError);

    // With opt-in + 1h max age: should succeed (lock is 2h old)
    const lock = await acquireLock(filePath, {
      allowStaleLockBreak: true,
      staleLockMaxAgeMs: 3_600_000,
    });

    await lock.release();
  });

  it('does not break non-stale lock even with opt-in', async () => {
    // Create a fresh lock
    const lock1 = await acquireLock(filePath);

    // Even with opt-in, should fail because lock is not stale
    await expect(
      acquireLock(filePath, {
        allowStaleLockBreak: true,
        staleLockMaxAgeMs: 3_600_000,
      })
    ).rejects.toThrow(LockfileError);

    await lock1.release();
  });

  it('includes holder PID in error message', async () => {
    const lock1 = await acquireLock(filePath);

    try {
      await acquireLock(filePath);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LockfileError);
      expect((err as LockfileError).holderPid).toBe(process.pid);
      expect((err as LockfileError).message).toContain(String(process.pid));
    }

    await lock1.release();
  });
});
