/**
 * Tests for FsDedupeIndex.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createFsDedupeIndex } from '../src/index.js';
import type { DedupeEntry } from '@peac/capture-core';

// =============================================================================
// Test Helpers
// =============================================================================

function makeDedupeEntry(sequence: number, emitted = false): DedupeEntry {
  return {
    sequence,
    entry_digest: `digest_${sequence}_${'a'.repeat(50)}`.slice(0, 64),
    captured_at: new Date().toISOString(),
    emitted,
  };
}

describe('FsDedupeIndex', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-dedupe-'));
    filePath = path.join(tmpDir, 'dedupe.idx');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Basic Operations
  // ===========================================================================

  it('sets and gets entries', async () => {
    const index = await createFsDedupeIndex({ filePath });

    const entry = makeDedupeEntry(1);
    await index.set('action-1', entry);

    expect(await index.has('action-1')).toBe(true);
    expect(await index.has('action-2')).toBe(false);

    const result = await index.get('action-1');
    expect(result).toBeDefined();
    expect(result!.sequence).toBe(1);
    expect(result!.emitted).toBe(false);

    await index.close();
  });

  it('marks entries as emitted', async () => {
    const index = await createFsDedupeIndex({ filePath });

    await index.set('action-1', makeDedupeEntry(1));

    const marked = await index.markEmitted('action-1');
    expect(marked).toBe(true);

    const entry = await index.get('action-1');
    expect(entry!.emitted).toBe(true);

    // Mark non-existent returns false
    const notFound = await index.markEmitted('action-99');
    expect(notFound).toBe(false);

    await index.close();
  });

  it('deletes entries', async () => {
    const index = await createFsDedupeIndex({ filePath });

    await index.set('action-1', makeDedupeEntry(1));
    expect(await index.size()).toBe(1);

    const deleted = await index.delete('action-1');
    expect(deleted).toBe(true);
    expect(await index.has('action-1')).toBe(false);
    expect(await index.size()).toBe(0);

    // Delete non-existent returns false
    expect(await index.delete('action-99')).toBe(false);

    await index.close();
  });

  it('clears all entries', async () => {
    const index = await createFsDedupeIndex({ filePath });

    await index.set('action-1', makeDedupeEntry(1));
    await index.set('action-2', makeDedupeEntry(2));
    expect(await index.size()).toBe(2);

    await index.clear();
    expect(await index.size()).toBe(0);
    expect(await index.has('action-1')).toBe(false);

    await index.close();
  });

  it('reports correct size', async () => {
    const index = await createFsDedupeIndex({ filePath });

    expect(await index.size()).toBe(0);

    await index.set('action-1', makeDedupeEntry(1));
    expect(await index.size()).toBe(1);

    await index.set('action-2', makeDedupeEntry(2));
    expect(await index.size()).toBe(2);

    await index.close();
  });

  // ===========================================================================
  // Persistence
  // ===========================================================================

  it('persists entries across restarts', async () => {
    // Write entries
    const index1 = await createFsDedupeIndex({ filePath });
    await index1.set('action-1', makeDedupeEntry(1));
    await index1.set('action-2', makeDedupeEntry(2, true));
    await index1.commit();
    await index1.close();

    // Reopen and verify
    const index2 = await createFsDedupeIndex({ filePath });
    expect(await index2.size()).toBe(2);
    expect(await index2.has('action-1')).toBe(true);
    expect(await index2.has('action-2')).toBe(true);

    const entry2 = await index2.get('action-2');
    expect(entry2!.emitted).toBe(true);

    await index2.close();
  });

  it('persists markEmitted across restarts', async () => {
    const index1 = await createFsDedupeIndex({ filePath });
    await index1.set('action-1', makeDedupeEntry(1));
    await index1.markEmitted('action-1');
    await index1.commit();
    await index1.close();

    const index2 = await createFsDedupeIndex({ filePath });
    const entry = await index2.get('action-1');
    expect(entry!.emitted).toBe(true);
    await index2.close();
  });

  it('persists delete across restarts', async () => {
    const index1 = await createFsDedupeIndex({ filePath });
    await index1.set('action-1', makeDedupeEntry(1));
    await index1.set('action-2', makeDedupeEntry(2));
    await index1.delete('action-1');
    await index1.commit();
    await index1.close();

    const index2 = await createFsDedupeIndex({ filePath });
    expect(await index2.has('action-1')).toBe(false);
    expect(await index2.has('action-2')).toBe(true);
    expect(await index2.size()).toBe(1);
    await index2.close();
  });

  // ===========================================================================
  // Duplicate Tolerance
  // ===========================================================================

  it('handles duplicate lines on reload (last-write-wins)', async () => {
    // Manually write duplicate ops to file
    const ops = [
      { op: 'set', actionId: 'action-1', entry: makeDedupeEntry(1) },
      { op: 'set', actionId: 'action-1', entry: makeDedupeEntry(10) }, // Override
    ];
    const content = ops.map((o) => JSON.stringify(o)).join('\n') + '\n';
    await fs.writeFile(filePath, content, 'utf-8');

    const index = await createFsDedupeIndex({ filePath });
    const entry = await index.get('action-1');
    expect(entry!.sequence).toBe(10); // Last write wins
    expect(await index.size()).toBe(1);

    await index.close();
  });

  it('tolerates malformed lines on reload', async () => {
    // Write some valid + some malformed
    const validOp = { op: 'set', actionId: 'action-1', entry: makeDedupeEntry(1) };
    const content =
      JSON.stringify(validOp) +
      '\n' +
      '{"broken json\n' +
      '\n' + // empty line
      JSON.stringify({ op: 'set', actionId: 'action-2', entry: makeDedupeEntry(2) }) +
      '\n';

    await fs.writeFile(filePath, content, 'utf-8');

    const index = await createFsDedupeIndex({ filePath });
    expect(await index.size()).toBe(2);
    expect(await index.has('action-1')).toBe(true);
    expect(await index.has('action-2')).toBe(true);

    await index.close();
  });

  // ===========================================================================
  // commit() Type Guard Pattern
  // ===========================================================================

  it('commit() is callable via type guard', async () => {
    const index = await createFsDedupeIndex({ filePath });

    // Simulate how the adapter would call commit
    const dedupe: unknown = index;
    if (
      dedupe !== null &&
      typeof dedupe === 'object' &&
      'commit' in (dedupe as Record<string, unknown>) &&
      typeof (dedupe as Record<string, (...args: unknown[]) => unknown>).commit === 'function'
    ) {
      await (dedupe as { commit: () => Promise<void> }).commit();
    }

    await index.close();
  });

  // ===========================================================================
  // Close Behavior
  // ===========================================================================

  it('rejects operations after close', async () => {
    const index = await createFsDedupeIndex({ filePath });
    await index.close();

    await expect(index.has('action-1')).rejects.toThrow('closed');
    await expect(index.set('action-1', makeDedupeEntry(1))).rejects.toThrow('closed');
  });

  it('double close is safe', async () => {
    const index = await createFsDedupeIndex({ filePath });
    await index.close();
    await index.close(); // Should not throw
  });
});
