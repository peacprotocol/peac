/**
 * Tests for FsSpoolStore.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createFsSpoolStore,
  SpoolFullError,
  SpoolCorruptError,
  getFsSpoolDiagnostics,
} from '../src/index.js';
import { GENESIS_DIGEST } from '@peac/capture-core';
import type { SpoolEntry } from '@peac/capture-core';

// =============================================================================
// Test Helpers
// =============================================================================

function makeEntry(sequence: number, prevDigest: string): SpoolEntry {
  const digest = `entry_digest_${sequence}_${'a'.repeat(40)}`.slice(0, 64);
  return {
    captured_at: new Date().toISOString(),
    action: {
      id: `action-${sequence}`,
      kind: 'tool.call',
      platform: 'test',
      started_at: new Date().toISOString(),
    },
    prev_entry_digest: prevDigest,
    entry_digest: digest,
    sequence,
  };
}

describe('FsSpoolStore', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-spool-'));
    filePath = path.join(tmpDir, 'spool.jsonl');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Basic Operations
  // ===========================================================================

  it('creates a new spool and appends entries', async () => {
    const store = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });

    expect(await store.getSequence()).toBe(0);
    expect(await store.getHeadDigest()).toBe(GENESIS_DIGEST);

    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const seq = await store.append(entry1);
    expect(seq).toBe(1);

    expect(await store.getSequence()).toBe(1);
    expect(await store.getHeadDigest()).toBe(entry1.entry_digest);

    const entry2 = makeEntry(2, entry1.entry_digest);
    await store.append(entry2);

    expect(await store.getSequence()).toBe(2);
    expect(await store.getHeadDigest()).toBe(entry2.entry_digest);

    await store.close();
  });

  it('persists entries across restarts', async () => {
    // Write entries
    const store1 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry2 = makeEntry(2, entry1.entry_digest);
    await store1.append(entry1);
    await store1.append(entry2);
    await store1.commit();
    await store1.close();

    // Reopen and verify
    const store2 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    expect(await store2.getSequence()).toBe(2);
    expect(await store2.getHeadDigest()).toBe(entry2.entry_digest);

    // Can continue appending
    const entry3 = makeEntry(3, entry2.entry_digest);
    await store2.append(entry3);
    expect(await store2.getSequence()).toBe(3);

    await store2.close();
  });

  it('reads entries with streaming', async () => {
    const store = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });

    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry2 = makeEntry(2, entry1.entry_digest);
    const entry3 = makeEntry(3, entry2.entry_digest);
    await store.append(entry1);
    await store.append(entry2);
    await store.append(entry3);
    await store.commit();

    // Read all
    const all = await store.read(1);
    expect(all).toHaveLength(3);
    expect(all[0].sequence).toBe(1);
    expect(all[2].sequence).toBe(3);

    // Read from sequence 2
    const from2 = await store.read(2);
    expect(from2).toHaveLength(2);
    expect(from2[0].sequence).toBe(2);

    // Read with limit
    const limited = await store.read(1, 2);
    expect(limited).toHaveLength(2);
    expect(limited[0].sequence).toBe(1);
    expect(limited[1].sequence).toBe(2);

    await store.close();
  });

  // ===========================================================================
  // Chain Validation
  // ===========================================================================

  it('rejects entries with wrong prev_entry_digest', async () => {
    const store = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });

    const entry1 = makeEntry(1, GENESIS_DIGEST);
    await store.append(entry1);

    // Wrong chain linkage
    const badEntry = makeEntry(2, 'wrong_digest_' + '0'.repeat(51));
    await expect(store.append(badEntry)).rejects.toThrow('Invalid chain');

    await store.close();
  });

  it('rejects entries with wrong sequence', async () => {
    const store = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });

    const entry1 = makeEntry(1, GENESIS_DIGEST);
    await store.append(entry1);

    // Wrong sequence (skip to 3)
    const badEntry = makeEntry(3, entry1.entry_digest);
    await expect(store.append(badEntry)).rejects.toThrow('Invalid sequence');

    await store.close();
  });

  // ===========================================================================
  // Hard-Cap Limits
  // ===========================================================================

  it('throws SpoolFullError when maxEntries exceeded', async () => {
    const store = await createFsSpoolStore({
      filePath,
      maxEntries: 2,
      autoCommitIntervalMs: 0,
    });

    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry2 = makeEntry(2, entry1.entry_digest);
    await store.append(entry1);
    await store.append(entry2);

    expect(store.isFull).toBe(true);

    const entry3 = makeEntry(3, entry2.entry_digest);
    await expect(store.append(entry3)).rejects.toThrow(SpoolFullError);

    try {
      await store.append(entry3);
    } catch (err) {
      expect(err).toBeInstanceOf(SpoolFullError);
      expect((err as SpoolFullError).unit).toBe('entries');
      expect((err as SpoolFullError).current).toBe(2);
      expect((err as SpoolFullError).max).toBe(2);
    }

    await store.close();
  });

  it('throws SpoolFullError when maxFileBytes exceeded', async () => {
    // First, figure out how big one entry is
    const sampleEntry = makeEntry(1, GENESIS_DIGEST);
    const sampleLineSize = Buffer.byteLength(JSON.stringify(sampleEntry) + '\n', 'utf-8');

    // Allow exactly one entry, not two
    const store = await createFsSpoolStore({
      filePath,
      maxFileBytes: sampleLineSize + 1,
      autoCommitIntervalMs: 0,
    });

    const entry1 = makeEntry(1, GENESIS_DIGEST);
    await store.append(entry1);

    // Entry 2 should exceed the byte limit
    const entry2 = makeEntry(2, entry1.entry_digest);
    await expect(store.append(entry2)).rejects.toThrow(SpoolFullError);

    try {
      await store.append(entry2);
    } catch (err) {
      expect(err).toBeInstanceOf(SpoolFullError);
      expect((err as SpoolFullError).unit).toBe('bytes');
    }

    await store.close();
  });

  // ===========================================================================
  // Crash Recovery
  // ===========================================================================

  it('recovers from incomplete last line', async () => {
    // Write valid entries + incomplete line
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry2 = makeEntry(2, entry1.entry_digest);
    const content =
      JSON.stringify(entry1) +
      '\n' +
      JSON.stringify(entry2) +
      '\n' +
      '{"incomplete": true, "no_closing';

    await fs.writeFile(filePath, content, 'utf-8');

    const warnings: string[] = [];
    const store = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    // Should have recovered: 2 valid entries
    expect(await store.getSequence()).toBe(2);
    expect(await store.getHeadDigest()).toBe(entry2.entry_digest);
    expect(warnings.some((w) => w.includes('Incomplete last line'))).toBe(true);

    // File should be truncated to valid content only
    const fileContent = await fs.readFile(filePath, 'utf-8');
    expect(fileContent.trim().split('\n')).toHaveLength(2);

    await store.close();
  });

  // ===========================================================================
  // Linkage Corruption
  // ===========================================================================

  it('detects chain linkage corruption and blocks appends', async () => {
    // Write entries with broken chain
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry2Bad: SpoolEntry = {
      ...makeEntry(2, 'broken_digest_' + '0'.repeat(50)),
      prev_entry_digest: 'broken_digest_' + '0'.repeat(50),
    };

    const content = JSON.stringify(entry1) + '\n' + JSON.stringify(entry2Bad) + '\n';

    await fs.writeFile(filePath, content, 'utf-8');

    const warnings: string[] = [];
    const store = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    expect(store.isCorrupt).toBe(true);
    expect(warnings.some((w) => w.includes('Chain linkage broken'))).toBe(true);

    // Diagnostics should expose the corrupt reason
    const diag = store.diagnostics();
    expect(diag.corruptReason).toBe('CHAIN_BROKEN');
    expect(diag.corruptAtSequence).toBe(2);

    // Appends should be blocked
    const entry3 = makeEntry(2, entry1.entry_digest);
    await expect(store.append(entry3)).rejects.toThrow(SpoolCorruptError);

    // Reads should still work (for export/inspect)
    const entries = await store.read(1);
    expect(entries.length).toBeGreaterThanOrEqual(1);

    await store.close();
  });

  // ===========================================================================
  // Meta File
  // ===========================================================================

  it('uses meta file for fast startup', async () => {
    // Write entries + commit (creates meta)
    const store1 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry2 = makeEntry(2, entry1.entry_digest);
    await store1.append(entry1);
    await store1.append(entry2);
    await store1.commit();
    await store1.close();

    // Verify meta file exists
    const metaPath = filePath + '.meta.json';
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    expect(meta.sequence).toBe(2);
    expect(meta.headDigest).toBe(entry2.entry_digest);
    expect(meta.entryCount).toBe(2);
    expect(meta.fileBytes).toBeGreaterThan(0);
    expect(meta.mtimeMs).toBeGreaterThan(0);

    // Reopen -- should use meta (fast path)
    const store2 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    expect(await store2.getSequence()).toBe(2);
    expect(await store2.getHeadDigest()).toBe(entry2.entry_digest);
    await store2.close();
  });

  it('falls back to full scan when meta file is stale', async () => {
    // Write entries + commit
    const store1 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    await store1.append(entry1);
    await store1.commit();
    await store1.close();

    // Tamper with meta file (wrong fileBytes)
    const metaPath = filePath + '.meta.json';
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    meta.fileBytes = 9999;
    await fs.writeFile(metaPath, JSON.stringify(meta), 'utf-8');

    const warnings: string[] = [];
    const store2 = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    // Should still have correct state (via full scan)
    expect(await store2.getSequence()).toBe(1);
    expect(warnings.some((w) => w.includes('Meta file mismatch'))).toBe(true);

    await store2.close();
  });

  // ===========================================================================
  // Close Behavior
  // ===========================================================================

  it('rejects operations after close', async () => {
    const store = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    await store.close();

    await expect(store.getSequence()).rejects.toThrow('closed');
    await expect(store.getHeadDigest()).rejects.toThrow('closed');

    const entry = makeEntry(1, GENESIS_DIGEST);
    await expect(store.append(entry)).rejects.toThrow('closed');
  });

  it('double close is safe', async () => {
    const store = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    await store.close();
    await store.close(); // Should not throw
  });

  // ===========================================================================
  // Operational State
  // ===========================================================================

  it('exposes operational state for /peac-status', async () => {
    const store = await createFsSpoolStore({
      filePath,
      maxEntries: 10,
      maxFileBytes: 1024 * 1024,
      autoCommitIntervalMs: 0,
    });

    expect(store.isFull).toBe(false);
    expect(store.isCorrupt).toBe(false);
    expect(store.currentEntryCount).toBe(0);
    expect(store.currentFileBytes).toBe(0);
    expect(store.maxEntryLimit).toBe(10);
    expect(store.maxBytesLimit).toBe(1024 * 1024);

    const entry1 = makeEntry(1, GENESIS_DIGEST);
    await store.append(entry1);

    expect(store.currentEntryCount).toBe(1);
    expect(store.currentFileBytes).toBeGreaterThan(0);

    await store.close();
  });

  // ===========================================================================
  // maxLineBytes Guard (P0-3)
  // ===========================================================================

  it('marks spool corrupt when a line exceeds maxLineBytes during read', async () => {
    // Write a normal entry then a much larger entry that exceeds the limit
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry1Size = Buffer.byteLength(JSON.stringify(entry1), 'utf-8');

    // Create a giant entry that is much larger than entry1
    const giantEntry: SpoolEntry = {
      ...makeEntry(2, entry1.entry_digest),
      action: {
        id: `action-2-${'z'.repeat(entry1Size * 2)}`,
        kind: 'tool.call',
        platform: 'test',
        started_at: new Date().toISOString(),
      },
    };
    const content = JSON.stringify(entry1) + '\n' + JSON.stringify(giantEntry) + '\n';

    await fs.writeFile(filePath, content, 'utf-8');

    // Set maxLineBytes to just above entry1 size but below giant entry size
    const warnings: string[] = [];
    const store = await createFsSpoolStore({
      filePath,
      maxLineBytes: entry1Size + 10, // entry1 fits, giant does not
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    // fullScan and read both enforce maxLineBytes pre-materialization.
    // The giant line is detected during fullScan (init) and read().
    expect(store.isCorrupt).toBe(true);
    expect(warnings.some((w) => w.includes('maxLineBytes'))).toBe(true);

    // read() returns only entries before the corrupt point
    const entries = await store.read(1);
    expect(entries).toHaveLength(1);

    // Diagnostics should expose the corrupt reason
    const diag = store.diagnostics();
    expect(diag.corruptReason).toBe('LINE_TOO_LARGE');

    await store.close();
  });

  it('marks spool corrupt when a line exceeds maxLineBytes during fullScan', async () => {
    // Write a normal entry then a giant line
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry1Size = Buffer.byteLength(JSON.stringify(entry1), 'utf-8');

    const giantEntry: SpoolEntry = {
      ...makeEntry(2, entry1.entry_digest),
      action: {
        id: `action-2-${'z'.repeat(entry1Size * 2)}`,
        kind: 'tool.call',
        platform: 'test',
        started_at: new Date().toISOString(),
      },
    };
    const content = JSON.stringify(entry1) + '\n' + JSON.stringify(giantEntry) + '\n';

    await fs.writeFile(filePath, content, 'utf-8');

    // maxLineBytes set so entry1 fits but giant entry does not
    const warnings: string[] = [];
    const store = await createFsSpoolStore({
      filePath,
      maxLineBytes: entry1Size + 10,
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    expect(store.isCorrupt).toBe(true);
    expect(warnings.some((w) => w.includes('maxLineBytes'))).toBe(true);

    // Diagnostics should expose the corrupt reason
    const diag = store.diagnostics();
    expect(diag.corruptReason).toBe('LINE_TOO_LARGE');

    await store.close();
  });

  // ===========================================================================
  // Crash Recovery Boundary (P0-4)
  // ===========================================================================

  it('does NOT auto-repair malformed JSON mid-file (marks corrupt)', async () => {
    // Write: valid entry, malformed mid-file, valid entry
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry3 = makeEntry(3, 'some_digest_' + '0'.repeat(52));
    const content =
      JSON.stringify(entry1) + '\n' + '{broken json here}\n' + JSON.stringify(entry3) + '\n';

    await fs.writeFile(filePath, content, 'utf-8');

    const warnings: string[] = [];
    const store = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    // Should be marked corrupt (not auto-repaired)
    expect(store.isCorrupt).toBe(true);
    expect(warnings.some((w) => w.includes('Malformed JSON'))).toBe(true);

    // Diagnostics should expose the corrupt reason
    const diag = store.diagnostics();
    expect(diag.corruptReason).toBe('MALFORMED_JSON');

    // File should NOT be modified (no auto-repair mid-file)
    const fileContent = await fs.readFile(filePath, 'utf-8');
    expect(fileContent).toContain('{broken json here}');

    await store.close();
  });

  // ===========================================================================
  // Meta File Version (P0-5)
  // ===========================================================================

  it('meta file includes metaVersion', async () => {
    const store = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    await store.append(entry1);
    await store.commit();
    await store.close();

    const metaPath = filePath + '.meta.json';
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    expect(meta.metaVersion).toBe(1);
  });

  it('falls back to full scan when meta version is unknown', async () => {
    // Write entries + commit
    const store1 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    await store1.append(entry1);
    await store1.commit();
    await store1.close();

    // Tamper with meta version
    const metaPath = filePath + '.meta.json';
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    meta.metaVersion = 99;
    const stat = await fs.stat(filePath);
    meta.fileBytes = stat.size;
    meta.mtimeMs = stat.mtimeMs;
    await fs.writeFile(metaPath, JSON.stringify(meta), 'utf-8');

    const warnings: string[] = [];
    const store2 = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    // Should still work (via full scan fallback)
    expect(await store2.getSequence()).toBe(1);
    expect(warnings.some((w) => w.includes('version mismatch'))).toBe(true);

    await store2.close();
  });

  // ===========================================================================
  // Diagnostics (P0-7 + P1-A: read_only degraded mode)
  // ===========================================================================

  it('diagnostics() returns active mode for healthy spool', async () => {
    const store = await createFsSpoolStore({
      filePath,
      maxEntries: 100,
      autoCommitIntervalMs: 0,
    });

    const diag = store.diagnostics();
    expect(diag.mode).toBe('active');
    expect(diag.spoolFull).toBe(false);
    expect(diag.spoolCorrupt).toBe(false);
    expect(diag.entryCount).toBe(0);
    expect(diag.maxEntries).toBe(100);
    expect(diag.filePath).toBe(filePath);

    await store.close();
  });

  it('diagnostics() returns read_only mode when spool is full', async () => {
    const store = await createFsSpoolStore({
      filePath,
      maxEntries: 1,
      autoCommitIntervalMs: 0,
    });

    const entry1 = makeEntry(1, GENESIS_DIGEST);
    await store.append(entry1);

    const diag = store.diagnostics();
    expect(diag.mode).toBe('read_only');
    expect(diag.spoolFull).toBe(true);

    await store.close();
  });

  it('diagnostics() returns read_only mode when spool is corrupt', async () => {
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const content = JSON.stringify(entry1) + '\n' + '{broken}\n';

    await fs.writeFile(filePath, content, 'utf-8');

    const store = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
      onWarning: () => {},
    });

    const diag = store.diagnostics();
    expect(diag.mode).toBe('read_only');
    expect(diag.spoolCorrupt).toBe(true);
    expect(diag.corruptReason).toBe('MALFORMED_JSON');

    await store.close();
  });

  it('getFsSpoolDiagnostics() works via type guard', async () => {
    const store = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
    });

    // Access via the helper function (treats store as SpoolStore)
    const diag = getFsSpoolDiagnostics(store);
    expect(diag).toBeDefined();
    expect(diag!.mode).toBe('active');

    await store.close();
  });

  // ===========================================================================
  // Lockfile Integration
  // ===========================================================================

  it('prevents concurrent access via lockfile', async () => {
    const store1 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });

    // Second store should fail to acquire lock
    await expect(createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 })).rejects.toThrow(
      /Another PEAC instance/
    );

    await store1.close();

    // After close, should succeed
    const store2 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });
    await store2.close();
  });

  // ===========================================================================
  // Kill-9 Durability (P1-C)
  // ===========================================================================

  it('committed entries survive simulated crash (uncommitted may be lost)', async () => {
    // Session 1: append N entries, commit, append M more (no commit), then "crash"
    const store1 = await createFsSpoolStore({ filePath, autoCommitIntervalMs: 0 });

    // Append 3 entries and commit them
    const entry1 = makeEntry(1, GENESIS_DIGEST);
    const entry2 = makeEntry(2, entry1.entry_digest);
    const entry3 = makeEntry(3, entry2.entry_digest);
    await store1.append(entry1);
    await store1.append(entry2);
    await store1.append(entry3);
    await store1.commit();

    // Append 2 more WITHOUT commit (simulates in-flight writes before kill -9)
    const entry4 = makeEntry(4, entry3.entry_digest);
    const entry5 = makeEntry(5, entry4.entry_digest);
    await store1.append(entry4);
    await store1.append(entry5);

    // "Crash": close fd without fsync or graceful shutdown
    // Access private fd via any cast for test purposes
    const fd = (store1 as unknown as { fd: { close: () => Promise<void> } }).fd;
    if (fd) await fd.close();
    // Null out fd to prevent GC FileHandle deprecation warning
    (store1 as unknown as { fd: null }).fd = null;

    // Also release the lock manually for the next open
    const lock = (store1 as unknown as { lock: { release: () => Promise<void> } }).lock;
    if (lock) await lock.release();

    // Force closed state to prevent double-close
    (store1 as unknown as { closed: boolean }).closed = true;

    // Session 2: restart and verify
    const warnings: string[] = [];
    const store2 = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    // Committed entries (1-3) should be present.
    // Uncommitted entries (4-5) MAY or MAY NOT be present depending on OS buffering.
    // The key invariant: no partial lines, valid linkage.
    const seq = await store2.getSequence();
    expect(seq).toBeGreaterThanOrEqual(3); // At least committed entries

    // Read entries and verify chain integrity
    const entries = await store2.read(1);
    expect(entries.length).toBeGreaterThanOrEqual(3);

    const genesis = '0'.repeat(64);
    expect(entries[0].prev_entry_digest).toBe(genesis);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].prev_entry_digest).toBe(entries[i - 1].entry_digest);
    }

    expect(store2.isCorrupt).toBe(false);

    await store2.close();
  });

  // ===========================================================================
  // Real Subprocess SIGKILL Test (P1-C enhancement)
  // ===========================================================================

  it('committed entries survive real SIGKILL (subprocess test)', async () => {
    // Skip on Windows -- SIGKILL not supported
    if (process.platform === 'win32') return;

    const { spawn } = await import('node:child_process');
    const fixturePath = path.join(__dirname, 'fixtures', 'spool-crash-writer.ts');

    const commitCount = 3;
    const uncommitCount = 2;

    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fixturePath, filePath, String(commitCount), String(uncommitCount)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    );

    // Wait for the child to signal "COMMITTED"
    const ready = await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Child timed out waiting for COMMITTED signal'));
      }, 10_000);

      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('COMMITTED')) {
          clearTimeout(timeout);
          resolve(true);
        }
      });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (!stdout.includes('COMMITTED')) {
          reject(new Error(`Child exited with code ${code} before COMMITTED. stderr: ${stderr}`));
        }
      });
    });

    expect(ready).toBe(true);

    // SIGKILL the child (no graceful shutdown)
    child.kill('SIGKILL');

    // Wait for process to actually die
    await new Promise<void>((resolve) => {
      child.on('exit', () => resolve());
    });

    // Clean up the lockfile left behind by the killed process
    try {
      await fs.unlink(filePath + '.lock');
    } catch {
      // May not exist
    }

    // Reopen the spool and verify
    const warnings: string[] = [];
    const store = await createFsSpoolStore({
      filePath,
      autoCommitIntervalMs: 0,
      onWarning: (msg) => warnings.push(msg),
    });

    // Committed entries (1-3) MUST be present
    const seq = await store.getSequence();
    expect(seq).toBeGreaterThanOrEqual(commitCount);

    // Read all entries and verify chain integrity
    const entries = await store.read(1);
    expect(entries.length).toBeGreaterThanOrEqual(commitCount);

    const genesis = '0'.repeat(64);
    expect(entries[0].prev_entry_digest).toBe(genesis);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].prev_entry_digest).toBe(entries[i - 1].entry_digest);
    }

    expect(store.isCorrupt).toBe(false);

    await store.close();
  }, 15_000); // Extended timeout for subprocess test
});
