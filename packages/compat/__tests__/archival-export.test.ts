// @peac/compat: archival-export reader / writer / validator invariants.
//
// Workspace-private package contract; not a public protocol surface and
// not a stable cross-organization interchange format.

import { describe, expect, it } from 'vitest';
import {
  serializeArchivalBundle,
  parseArchivalBundle,
  validateArchivalBundle,
  type ArchivalBundle,
  type ArchivalRecord,
  type ArchivalValidationResult,
} from '../src/archival-export.js';
import type { MigrationClass } from '../src/taxonomy.js';

const baseRecord: ArchivalRecord = {
  recordRef: 'sha256:deadbeef',
  originalWire: 'peac-receipt/0.1',
  archivedAt: '2026-04-30T12:00:00Z',
  payload: { hello: 'world' },
};

const baseBundle: ArchivalBundle = {
  version: 'peac-archival/0.1-internal',
  createdAt: '2026-04-30T12:00:00Z',
  records: [baseRecord],
};

function failureCode(r: ArchivalValidationResult): string | undefined {
  return r.ok ? undefined : r.code;
}

describe('serializeArchivalBundle', () => {
  it('emits a deterministic string for the same input', () => {
    const a = serializeArchivalBundle(baseBundle);
    const b = serializeArchivalBundle(baseBundle);
    expect(a).toBe(b);
  });

  it('emits a stable string regardless of source key order', () => {
    const reordered: ArchivalBundle = {
      records: [baseRecord],
      createdAt: '2026-04-30T12:00:00Z',
      version: 'peac-archival/0.1-internal',
    };
    expect(serializeArchivalBundle(reordered)).toBe(serializeArchivalBundle(baseBundle));
  });

  it('does not emit any wall-clock or random field (output is reproducible across calls)', async () => {
    const a = serializeArchivalBundle(baseBundle);
    await new Promise((r) => setTimeout(r, 15));
    const b = serializeArchivalBundle(baseBundle);
    expect(b).toBe(a);
  });

  it('throws on a malformed bundle (validates before serializing)', () => {
    const bad = { ...baseBundle, version: 'wrong' } as unknown as ArchivalBundle;
    expect(() => serializeArchivalBundle(bad)).toThrow(/archival_invalid_version/);
  });

  it('emits keys in alphabetical order at every level', () => {
    const s = serializeArchivalBundle(baseBundle);
    expect(s.indexOf('"createdAt"')).toBeLessThan(s.indexOf('"records"'));
    expect(s.indexOf('"records"')).toBeLessThan(s.indexOf('"version"'));
    expect(s.indexOf('"archivedAt"')).toBeLessThan(s.indexOf('"originalWire"'));
    expect(s.indexOf('"originalWire"')).toBeLessThan(s.indexOf('"payload"'));
    expect(s.indexOf('"payload"')).toBeLessThan(s.indexOf('"recordRef"'));
  });
});

describe('parseArchivalBundle', () => {
  it('round-trips a serialized bundle to the same structure', () => {
    const s = serializeArchivalBundle(baseBundle);
    const p = parseArchivalBundle(s);
    expect(p).toEqual(baseBundle);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseArchivalBundle('not json')).toThrow(/archival_invalid_input/);
  });

  it('throws on a non-object input', () => {
    expect(() => parseArchivalBundle('[]')).toThrow(/archival_invalid_input/);
  });

  it('throws when the parsed bundle fails validation', () => {
    expect(() =>
      parseArchivalBundle(JSON.stringify({ version: 'wrong', createdAt: '2026', records: [] }))
    ).toThrow(/archival_invalid_version/);
  });

  it('preserves a complex JSON-compatible payload exactly', () => {
    const payload = {
      nested: { array: [1, 2, 3], bool: true, nullVal: null, str: 'hello' },
    };
    const bundle: ArchivalBundle = {
      ...baseBundle,
      records: [{ ...baseRecord, payload }],
    };
    const round = parseArchivalBundle(serializeArchivalBundle(bundle));
    expect(round.records[0].payload).toEqual(payload);
  });
});

describe('validateArchivalBundle', () => {
  it('accepts a minimal valid bundle', () => {
    const r = validateArchivalBundle(baseBundle);
    expect(r.ok).toBe(true);
  });

  it('accepts an empty records array', () => {
    const empty = { ...baseBundle, records: [] };
    const r = validateArchivalBundle(empty);
    expect(r.ok).toBe(true);
  });

  it('rejects unknown version', () => {
    const r = validateArchivalBundle({ ...baseBundle, version: 'wrong' });
    expect(failureCode(r)).toBe('archival_invalid_version');
  });

  it('rejects missing records', () => {
    const r = validateArchivalBundle({
      version: 'peac-archival/0.1-internal',
      createdAt: '2026-04-30T12:00:00Z',
    });
    expect(failureCode(r)).toBe('archival_invalid_records');
  });

  it('rejects records as a non-array', () => {
    const r = validateArchivalBundle({ ...baseBundle, records: {} });
    expect(failureCode(r)).toBe('archival_invalid_records');
  });

  it('rejects an empty createdAt', () => {
    const r = validateArchivalBundle({ ...baseBundle, createdAt: '' });
    expect(failureCode(r)).toBe('archival_invalid_created_at');
  });

  it('rejects a non-object record', () => {
    const r = validateArchivalBundle({ ...baseBundle, records: ['not an object'] });
    expect(failureCode(r)).toBe('archival_invalid_record');
  });

  it('rejects records missing recordRef', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [{ originalWire: 'x', archivedAt: '2026', payload: {} }],
    });
    expect(failureCode(r)).toBe('archival_invalid_record_ref');
  });

  it('rejects records missing originalWire', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [{ recordRef: 'r', archivedAt: '2026', payload: {} }],
    });
    expect(failureCode(r)).toBe('archival_invalid_original_wire');
  });

  it('rejects records missing archivedAt', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [{ recordRef: 'r', originalWire: 'x', payload: {} }],
    });
    expect(failureCode(r)).toBe('archival_invalid_archived_at');
  });

  it('rejects records with undefined payload', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [
        {
          recordRef: 'r',
          originalWire: 'x',
          archivedAt: '2026',
        },
      ],
    });
    expect(failureCode(r)).toBe('archival_invalid_payload');
  });

  it('rejects non-JSON-compatible payload (e.g., Symbol)', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [{ ...baseRecord, payload: Symbol('x') as unknown }],
    });
    expect(failureCode(r)).toBe('archival_invalid_payload');
  });

  it('rejects invalid migrationVerdict (non-object)', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [{ ...baseRecord, migrationVerdict: 'string' as unknown }],
    });
    expect(failureCode(r)).toBe('archival_invalid_verdict');
  });

  it('rejects invalid migration verdict class', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [
        {
          ...baseRecord,
          migrationVerdict: { class: 'bogus', notes: ['x'] },
        },
      ],
    });
    expect(failureCode(r)).toBe('archival_invalid_verdict_class');
  });

  it('accepts every valid migration class', () => {
    for (const klass of ['exact', 'derived', 'lossy', 'impossible'] as MigrationClass[]) {
      const r = validateArchivalBundle({
        ...baseBundle,
        records: [
          {
            ...baseRecord,
            migrationVerdict: { class: klass, notes: ['ok'] },
          },
        ],
      });
      expect(r.ok).toBe(true);
    }
  });

  it('rejects non-array notes', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [{ ...baseRecord, migrationVerdict: { class: 'exact', notes: 'not an array' } }],
    });
    expect(failureCode(r)).toBe('archival_invalid_notes');
  });

  it('rejects empty note strings', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [{ ...baseRecord, migrationVerdict: { class: 'exact', notes: [''] } }],
    });
    expect(failureCode(r)).toBe('archival_invalid_notes');
  });

  it('rejects out-of-bounds note strings', () => {
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [
        {
          ...baseRecord,
          migrationVerdict: { class: 'exact', notes: ['a'.repeat(2000)] },
        },
      ],
    });
    expect(failureCode(r)).toBe('archival_invalid_notes');
  });

  it('rejects non-object input (null / string / number / array)', () => {
    expect(failureCode(validateArchivalBundle(null))).toBe('archival_invalid_input');
    expect(failureCode(validateArchivalBundle('string'))).toBe('archival_invalid_input');
    expect(failureCode(validateArchivalBundle(42))).toBe('archival_invalid_input');
    expect(failureCode(validateArchivalBundle([]))).toBe('archival_invalid_input');
  });

  it('preserves payload exactly through validation', () => {
    const payload = {
      nested: { array: [1, 2, 3], bool: true, nullVal: null, str: 'hello' },
    };
    const r = validateArchivalBundle({
      ...baseBundle,
      records: [{ ...baseRecord, payload }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bundle.records[0].payload).toEqual(payload);
    }
  });
});
