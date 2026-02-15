/**
 * Integration tests: full capture session with filesystem stores.
 *
 * Tests the complete pipeline: CaptureSession + FsSpoolStore + FsDedupeIndex.
 * Verifies entries persist, dedupe works, chain is valid, and restart preserves state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createFsSpoolStore, createFsDedupeIndex } from '../src/index.js';
import { createCaptureSession, createHasher } from '@peac/capture-core';
import type { CapturedAction } from '@peac/capture-core';

// =============================================================================
// Test Helpers
// =============================================================================

function makeAction(id: string, toolName: string): CapturedAction {
  return {
    id,
    kind: 'tool.call',
    platform: 'test',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    tool_name: toolName,
    status: 'ok',
    input_bytes: new TextEncoder().encode(JSON.stringify({ tool: toolName, arg: id })),
    output_bytes: new TextEncoder().encode(JSON.stringify({ result: 'success' })),
  };
}

describe('integration: CaptureSession + FsStores', () => {
  let tmpDir: string;
  let spoolPath: string;
  let dedupePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-integ-'));
    spoolPath = path.join(tmpDir, 'spool.jsonl');
    dedupePath = path.join(tmpDir, 'dedupe.idx');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createSession(opts?: { maxEntries?: number }) {
    const store = await createFsSpoolStore({
      filePath: spoolPath,
      autoCommitIntervalMs: 0,
      maxEntries: opts?.maxEntries,
    });
    const dedupe = await createFsDedupeIndex({ filePath: dedupePath });
    const hasher = createHasher();
    const session = createCaptureSession({ store, dedupe, hasher });
    return { session, store, dedupe };
  }

  it('captures actions end-to-end', async () => {
    const { session, dedupe } = await createSession();

    // Capture 3 actions
    const r1 = await session.capture(makeAction('a1', 'read_file'));
    expect(r1.success).toBe(true);

    const r2 = await session.capture(makeAction('a2', 'write_file'));
    expect(r2.success).toBe(true);

    const r3 = await session.capture(makeAction('a3', 'exec_command'));
    expect(r3.success).toBe(true);

    // Verify chain
    if (r1.success && r2.success && r3.success) {
      expect(r2.entry.prev_entry_digest).toBe(r1.entry.entry_digest);
      expect(r3.entry.prev_entry_digest).toBe(r2.entry.entry_digest);
      expect(r3.entry.sequence).toBe(3);
    }

    // Verify digests are present
    if (r1.success) {
      expect(r1.entry.input_digest).toBeDefined();
      expect(r1.entry.output_digest).toBeDefined();
    }

    await session.commit();
    await session.close();
    await dedupe.close();
  });

  it('deduplicates across captures', async () => {
    const { session, dedupe } = await createSession();

    const action = makeAction('dup-1', 'tool');
    const r1 = await session.capture(action);
    expect(r1.success).toBe(true);

    // Same action ID should be deduplicated
    const r2 = await session.capture(action);
    expect(r2.success).toBe(false);
    if (!r2.success) {
      expect(r2.code).toBe('E_CAPTURE_DUPLICATE');
    }

    await session.close();
    await dedupe.close();
  });

  it('persists and resumes across process restarts', async () => {
    // Session 1: capture 2 actions
    {
      const store = await createFsSpoolStore({
        filePath: spoolPath,
        autoCommitIntervalMs: 0,
      });
      const dedupe = await createFsDedupeIndex({ filePath: dedupePath });
      const hasher = createHasher();
      const session = createCaptureSession({ store, dedupe, hasher });

      await session.capture(makeAction('a1', 'tool1'));
      await session.capture(makeAction('a2', 'tool2'));
      await session.commit();
      await session.close();
      await dedupe.close();
    }

    // Session 2: verify state, capture more
    {
      const store = await createFsSpoolStore({
        filePath: spoolPath,
        autoCommitIntervalMs: 0,
      });
      const dedupe = await createFsDedupeIndex({ filePath: dedupePath });
      const hasher = createHasher();
      const session = createCaptureSession({ store, dedupe, hasher });

      // Sequence should continue from 2
      const headDigest = await session.getHeadDigest();
      expect(headDigest).not.toBe('0'.repeat(64)); // Not genesis

      // Duplicates from session 1 should be caught
      const dup = await session.capture(makeAction('a1', 'tool1'));
      expect(dup.success).toBe(false);
      if (!dup.success) {
        expect(dup.code).toBe('E_CAPTURE_DUPLICATE');
      }

      // New action should succeed at sequence 3
      const r3 = await session.capture(makeAction('a3', 'tool3'));
      expect(r3.success).toBe(true);
      if (r3.success) {
        expect(r3.entry.sequence).toBe(3);
      }

      // Read all entries
      const entries = await store.read(1);
      expect(entries).toHaveLength(3);

      // Verify chain integrity
      const genesis = '0'.repeat(64);
      expect(entries[0].prev_entry_digest).toBe(genesis);
      expect(entries[1].prev_entry_digest).toBe(entries[0].entry_digest);
      expect(entries[2].prev_entry_digest).toBe(entries[1].entry_digest);

      await session.commit();
      await session.close();
      await dedupe.close();
    }
  });

  it('hard-cap blocks captures but session stays alive', async () => {
    const { session, dedupe } = await createSession({ maxEntries: 2 });

    const r1 = await session.capture(makeAction('a1', 'tool1'));
    expect(r1.success).toBe(true);

    const r2 = await session.capture(makeAction('a2', 'tool2'));
    expect(r2.success).toBe(true);

    // Third capture should fail with store error (SpoolFullError caught by session)
    const r3 = await session.capture(makeAction('a3', 'tool3'));
    expect(r3.success).toBe(false);
    if (!r3.success) {
      expect(r3.code).toBe('E_CAPTURE_STORE_FAILED');
      expect(r3.message).toContain('Spool full');
    }

    // Session is still alive -- can read, get head digest, etc.
    const head = await session.getHeadDigest();
    expect(head).toBeTruthy();

    await session.close();
    await dedupe.close();
  });

  it('dedupe commit() works via type guard in drain path', async () => {
    const store = await createFsSpoolStore({
      filePath: spoolPath,
      autoCommitIntervalMs: 0,
    });
    const dedupe = await createFsDedupeIndex({ filePath: dedupePath });
    const hasher = createHasher();
    const session = createCaptureSession({ store, dedupe, hasher });

    await session.capture(makeAction('a1', 'tool'));
    await session.commit();

    // Simulate background service drain path: commit both stores
    await store.commit();
    if ('commit' in dedupe && typeof (dedupe as Record<string, unknown>).commit === 'function') {
      await (dedupe as { commit: () => Promise<void> }).commit();
    }

    await session.close();
    await dedupe.close();
  });
});
