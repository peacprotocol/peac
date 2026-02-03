/**
 * @peac/capture-core - Determinism Tests
 *
 * These tests verify that the capture pipeline produces deterministic output.
 * Same input must always produce same output across runs.
 */

import { describe, it, expect } from 'vitest';
import { createHasher, createCaptureSession, toInteractionEvidence, GENESIS_DIGEST } from '../src';
import { createInMemorySpoolStore, createInMemoryDedupeIndex } from '../src/testkit';
import type { CapturedAction, SpoolEntry } from '../src';

// =============================================================================
// Test Fixtures
// =============================================================================

const FIXED_TIMESTAMP = '2024-02-01T10:00:00.000Z';
const FIXED_COMPLETED = '2024-02-01T10:00:01.000Z';

function createTestAction(overrides: Partial<CapturedAction> = {}): CapturedAction {
  return {
    id: 'test-action-001',
    kind: 'tool.call',
    platform: 'test-platform',
    platform_version: '1.0.0',
    tool_name: 'search',
    tool_provider: 'builtin',
    started_at: FIXED_TIMESTAMP,
    completed_at: FIXED_COMPLETED,
    duration_ms: 1000,
    status: 'ok',
    input_bytes: new TextEncoder().encode('{"query": "hello world"}'),
    output_bytes: new TextEncoder().encode('{"results": []}'),
    ...overrides,
  };
}

// =============================================================================
// Hasher Determinism Tests
// =============================================================================

describe('Hasher Determinism', () => {
  it('same payload produces same digest across multiple calls', async () => {
    const hasher = createHasher();
    const payload = new TextEncoder().encode('test payload data');

    const digest1 = await hasher.digest(payload);
    const digest2 = await hasher.digest(payload);
    const digest3 = await hasher.digest(payload);

    expect(digest1.value).toBe(digest2.value);
    expect(digest2.value).toBe(digest3.value);
    expect(digest1.alg).toBe(digest2.alg);
    expect(digest1.bytes).toBe(digest2.bytes);
  });

  it('same payload produces same digest with new hasher instances', async () => {
    const payload = new TextEncoder().encode('test payload data');

    const hasher1 = createHasher();
    const hasher2 = createHasher();

    const digest1 = await hasher1.digest(payload);
    const digest2 = await hasher2.digest(payload);

    expect(digest1.value).toBe(digest2.value);
    expect(digest1.alg).toBe(digest2.alg);
    expect(digest1.bytes).toBe(digest2.bytes);
  });

  it('empty payload produces deterministic digest', async () => {
    const hasher = createHasher();
    const payload = new Uint8Array(0);

    const digest1 = await hasher.digest(payload);
    const digest2 = await hasher.digest(payload);

    expect(digest1.value).toBe(digest2.value);
    expect(digest1.bytes).toBe(0);
    // SHA-256 of empty string is known constant
    expect(digest1.value).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('digest value is 64 lowercase hex chars', async () => {
    const hasher = createHasher();
    const payload = new TextEncoder().encode('test');

    const digest = await hasher.digest(payload);

    expect(digest.value).toMatch(/^[a-f0-9]{64}$/);
  });

  it('spool entry digest is deterministic', async () => {
    const hasher = createHasher();

    const entry: Omit<SpoolEntry, 'entry_digest'> = {
      captured_at: FIXED_TIMESTAMP,
      action: {
        id: 'test-001',
        kind: 'tool.call',
        platform: 'test',
        started_at: FIXED_TIMESTAMP,
      },
      prev_entry_digest: GENESIS_DIGEST,
      sequence: 1,
    };

    const digest1 = await hasher.digestEntry(entry);
    const digest2 = await hasher.digestEntry(entry);

    expect(digest1).toBe(digest2);
    expect(digest1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('entry digest changes when content changes', async () => {
    const hasher = createHasher();

    const entry1: Omit<SpoolEntry, 'entry_digest'> = {
      captured_at: FIXED_TIMESTAMP,
      action: {
        id: 'test-001',
        kind: 'tool.call',
        platform: 'test',
        started_at: FIXED_TIMESTAMP,
      },
      prev_entry_digest: GENESIS_DIGEST,
      sequence: 1,
    };

    const entry2: Omit<SpoolEntry, 'entry_digest'> = {
      ...entry1,
      action: { ...entry1.action, id: 'test-002' },
    };

    const digest1 = await hasher.digestEntry(entry1);
    const digest2 = await hasher.digestEntry(entry2);

    expect(digest1).not.toBe(digest2);
  });
});

// =============================================================================
// Capture Session Determinism Tests
// =============================================================================

describe('Capture Session Determinism', () => {
  it('same action list produces identical spool entries across sessions', async () => {
    // Create two independent sessions
    const session1 = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const session2 = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const actions = [
      createTestAction({ id: 'action-1' }),
      createTestAction({ id: 'action-2', kind: 'http.request' }),
      createTestAction({ id: 'action-3', tool_name: 'fetch' }),
    ];

    // Capture same actions in both sessions
    const results1: SpoolEntry[] = [];
    const results2: SpoolEntry[] = [];

    for (const action of actions) {
      const r1 = await session1.capture(action);
      const r2 = await session2.capture(action);

      if (r1.success) results1.push(r1.entry);
      if (r2.success) results2.push(r2.entry);
    }

    // Full determinism: all fields should match
    expect(results1.length).toBe(results2.length);
    expect(results1.length).toBe(3);

    for (let i = 0; i < results1.length; i++) {
      // Action content should be identical
      expect(results1[i].action).toEqual(results2[i].action);
      // Payload digests should be identical (same bytes -> same hash)
      expect(results1[i].input_digest).toEqual(results2[i].input_digest);
      expect(results1[i].output_digest).toEqual(results2[i].output_digest);
      // Sequence numbers should match
      expect(results1[i].sequence).toEqual(results2[i].sequence);
      // captured_at is now derived from action timestamps (deterministic)
      expect(results1[i].captured_at).toEqual(results2[i].captured_at);
      // Chain digests should now match (deterministic)
      expect(results1[i].prev_entry_digest).toEqual(results2[i].prev_entry_digest);
      expect(results1[i].entry_digest).toEqual(results2[i].entry_digest);
    }

    await session1.close();
    await session2.close();
  });

  it('chain is correctly linked', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const results: SpoolEntry[] = [];

    for (let i = 0; i < 5; i++) {
      const result = await session.capture(createTestAction({ id: `action-${i}` }));
      if (result.success) results.push(result.entry);
    }

    expect(results.length).toBe(5);

    // First entry links to genesis
    expect(results[0].prev_entry_digest).toBe(GENESIS_DIGEST);
    expect(results[0].sequence).toBe(1);

    // Each subsequent entry links to previous
    for (let i = 1; i < results.length; i++) {
      expect(results[i].prev_entry_digest).toBe(results[i - 1].entry_digest);
      expect(results[i].sequence).toBe(i + 1);
    }

    await session.close();
  });

  it('head digest tracks latest entry', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    // Initially genesis
    let head = await session.getHeadDigest();
    expect(head).toBe(GENESIS_DIGEST);

    // After first capture
    const result1 = await session.capture(createTestAction({ id: 'action-1' }));
    head = await session.getHeadDigest();
    if (result1.success) {
      expect(head).toBe(result1.entry.entry_digest);
    }

    // After second capture
    const result2 = await session.capture(createTestAction({ id: 'action-2' }));
    head = await session.getHeadDigest();
    if (result2.success) {
      expect(head).toBe(result2.entry.entry_digest);
    }

    await session.close();
  });

  it('captured_at uses completed_at when available', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const action = createTestAction({
      id: 'action-1',
      started_at: '2024-01-01T10:00:00.000Z',
      completed_at: '2024-01-01T10:00:05.000Z',
    });

    const result = await session.capture(action);

    expect(result.success).toBe(true);
    if (result.success) {
      // captured_at should be completed_at (preferred)
      expect(result.entry.captured_at).toBe('2024-01-01T10:00:05.000Z');
    }

    await session.close();
  });

  it('captured_at falls back to started_at when completed_at is missing', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    // Create action without completed_at (don't spread from fixture which has it)
    const action: CapturedAction = {
      id: 'action-fallback-test',
      kind: 'tool.call',
      platform: 'test-platform',
      started_at: '2024-01-01T10:00:00.000Z',
      // No completed_at
    };

    const result = await session.capture(action);

    expect(result.success).toBe(true);
    if (result.success) {
      // captured_at should be started_at (fallback)
      expect(result.entry.captured_at).toBe('2024-01-01T10:00:00.000Z');
    }

    await session.close();
  });
});

// =============================================================================
// Mapper Determinism Tests
// =============================================================================

describe('Mapper Determinism', () => {
  it('same entry produces same evidence', () => {
    const entry: SpoolEntry = {
      captured_at: FIXED_TIMESTAMP,
      action: {
        id: 'test-001',
        kind: 'tool.call',
        platform: 'test-platform',
        platform_version: '1.0.0',
        tool_name: 'search',
        started_at: FIXED_TIMESTAMP,
        completed_at: FIXED_COMPLETED,
        duration_ms: 1000,
        status: 'ok',
      },
      input_digest: { alg: 'sha-256', value: 'a'.repeat(64), bytes: 100 },
      output_digest: { alg: 'sha-256', value: 'b'.repeat(64), bytes: 50 },
      prev_entry_digest: GENESIS_DIGEST,
      entry_digest: 'c'.repeat(64),
      sequence: 1,
    };

    const evidence1 = toInteractionEvidence(entry);
    const evidence2 = toInteractionEvidence(entry);

    expect(evidence1).toEqual(evidence2);
  });

  it('evidence has correct structure', () => {
    const entry: SpoolEntry = {
      captured_at: FIXED_TIMESTAMP,
      action: {
        id: 'test-001',
        kind: 'tool.call',
        platform: 'test-platform',
        tool_name: 'search',
        started_at: FIXED_TIMESTAMP,
        status: 'ok',
      },
      prev_entry_digest: GENESIS_DIGEST,
      entry_digest: 'c'.repeat(64),
      sequence: 1,
    };

    const evidence = toInteractionEvidence(entry);

    expect(evidence.interaction_id).toBe('test-001');
    expect(evidence.kind).toBe('tool.call');
    expect(evidence.executor.platform).toBe('test-platform');
    expect(evidence.started_at).toBe(FIXED_TIMESTAMP);
    expect(evidence.tool?.name).toBe('search');
    expect(evidence.result?.status).toBe('ok');
  });

  it('spool anchor is included when requested', () => {
    const entry: SpoolEntry = {
      captured_at: FIXED_TIMESTAMP,
      action: {
        id: 'test-001',
        kind: 'tool.call',
        platform: 'test',
        started_at: FIXED_TIMESTAMP,
      },
      prev_entry_digest: GENESIS_DIGEST,
      entry_digest: 'c'.repeat(64),
      sequence: 42,
    };

    const evidence = toInteractionEvidence(entry, { includeSpoolAnchor: true });

    expect(evidence.extensions).toBeDefined();
    const anchor = evidence.extensions?.['org.peacprotocol/spool-anchor@0.1'] as {
      spool_head_digest: string;
      sequence: number;
    };
    expect(anchor).toBeDefined();
    expect(anchor.spool_head_digest).toBe('c'.repeat(64));
    expect(anchor.sequence).toBe(42);
  });
});

// =============================================================================
// Deduplication Tests
// =============================================================================

describe('Deduplication', () => {
  it('rejects duplicate action IDs', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const action = createTestAction({ id: 'unique-id-123' });

    const result1 = await session.capture(action);
    const result2 = await session.capture(action);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.code).toBe('E_CAPTURE_DUPLICATE');
    }

    await session.close();
  });

  it('allows different action IDs', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const result1 = await session.capture(createTestAction({ id: 'id-1' }));
    const result2 = await session.capture(createTestAction({ id: 'id-2' }));
    const result3 = await session.capture(createTestAction({ id: 'id-3' }));

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result3.success).toBe(true);

    await session.close();
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe('Action Validation', () => {
  it('rejects action without id', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const result = await session.capture(createTestAction({ id: '' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('E_CAPTURE_INVALID_ACTION');
    }

    await session.close();
  });

  it('rejects action without kind', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const result = await session.capture(createTestAction({ kind: '' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('E_CAPTURE_INVALID_ACTION');
    }

    await session.close();
  });

  it('rejects action without platform', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const result = await session.capture(createTestAction({ platform: '' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('E_CAPTURE_INVALID_ACTION');
    }

    await session.close();
  });

  it('rejects action without started_at', async () => {
    const session = createCaptureSession({
      store: createInMemorySpoolStore(),
      dedupe: createInMemoryDedupeIndex(),
      hasher: createHasher(),
    });

    const result = await session.capture(createTestAction({ started_at: '' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('E_CAPTURE_INVALID_ACTION');
    }

    await session.close();
  });
});
