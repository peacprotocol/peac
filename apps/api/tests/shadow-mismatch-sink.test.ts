import { describe, it, expect, beforeEach } from 'vitest';
import {
  getShadowSinkBufferSize,
  recordMismatch,
  getMismatches,
  getShadowSinkCapacity,
  resetShadowSinkForTests,
  __TEST_CONSTANTS__,
  type MismatchSinkEntry,
} from '../src/lib/shadow-mismatch-sink.js';

const SAMPLE_HASH = 'a'.repeat(64);

function baseEntry(overrides: Partial<MismatchSinkEntry> = {}): Omit<MismatchSinkEntry, 'ts'> {
  return {
    requestHash: SAMPLE_HASH,
    class: 'parity_class_mismatch',
    legacySummary: { ok: true, byteCount: 256, durationBucket: 'fast' },
    shadowSummary: { ok: false, code: 'fetch_timeout', durationBucket: 'slow' },
    ...overrides,
  };
}

describe('getShadowSinkBufferSize', () => {
  it('returns the default when env var is unset', () => {
    expect(getShadowSinkBufferSize({})).toBe(__TEST_CONSTANTS__.DEFAULT_BUFFER_SIZE);
  });

  it('returns the default for non-numeric values', () => {
    expect(getShadowSinkBufferSize({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: 'wat' })).toBe(
      __TEST_CONSTANTS__.DEFAULT_BUFFER_SIZE
    );
  });

  it('clamps below minimum', () => {
    expect(getShadowSinkBufferSize({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '4' })).toBe(
      __TEST_CONSTANTS__.MIN_BUFFER_SIZE
    );
  });

  it('clamps above maximum', () => {
    expect(getShadowSinkBufferSize({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '999999' })).toBe(
      __TEST_CONSTANTS__.MAX_BUFFER_SIZE
    );
  });

  it('honours valid in-range values', () => {
    expect(getShadowSinkBufferSize({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '512' })).toBe(512);
  });
});

describe('shadow mismatch sink ring buffer', () => {
  beforeEach(() => {
    resetShadowSinkForTests({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '64' });
  });

  it('initialises empty', () => {
    expect(getMismatches()).toEqual([]);
  });

  it('records entries in insertion order until capacity', () => {
    for (let i = 0; i < 5; i++) {
      recordMismatch({ ...baseEntry(), requestHash: `${i.toString().repeat(64)}`.slice(0, 64) });
    }
    const entries = getMismatches();
    expect(entries.length).toBe(5);
    expect(entries[0].requestHash.startsWith('0')).toBe(true);
    expect(entries[4].requestHash.startsWith('4')).toBe(true);
  });

  it('overwrites oldest entries (FIFO) once capacity is exceeded', () => {
    resetShadowSinkForTests({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '64' });
    const cap = getShadowSinkCapacity();
    expect(cap).toBe(64);
    for (let i = 0; i < cap + 5; i++) {
      recordMismatch({ ...baseEntry(), requestHash: `${i.toString(16).padStart(64, '0')}` });
    }
    const entries = getMismatches();
    expect(entries.length).toBe(cap);
    expect(entries[0].requestHash).toBe(`${(5).toString(16).padStart(64, '0')}`);
    expect(entries[cap - 1].requestHash).toBe(`${(cap + 4).toString(16).padStart(64, '0')}`);
  });

  it('stamps ts in ISO-8601 second precision', () => {
    const entry = recordMismatch(baseEntry());
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('limit param returns the most recent N entries', () => {
    for (let i = 0; i < 10; i++) {
      recordMismatch({ ...baseEntry(), requestHash: `${i.toString().padStart(64, '0')}` });
    }
    const last3 = getMismatches(3);
    expect(last3.length).toBe(3);
    expect(last3[0].requestHash).toBe(`${(7).toString().padStart(64, '0')}`);
    expect(last3[2].requestHash).toBe(`${(9).toString().padStart(64, '0')}`);
  });
});

describe('shadow mismatch sink ~512-byte entry cap', () => {
  beforeEach(() => {
    resetShadowSinkForTests({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '64' });
  });

  it('keeps small entries unchanged', () => {
    const entry = recordMismatch(baseEntry());
    expect(JSON.stringify(entry).length).toBeLessThanOrEqual(__TEST_CONSTANTS__.ENTRY_BYTE_CAP);
    expect(entry.legacySummary.byteCount).toBe(256);
    expect(entry.shadowSummary.code).toBe('fetch_timeout');
  });

  it('drops excerpts when the entry would exceed the cap', () => {
    const entry = recordMismatch({
      ...baseEntry({ class: 'output-byte-diff' }),
      excerptLegacy: 'L'.repeat(__TEST_CONSTANTS__.EXCERPT_BYTE_CAP),
      excerptShadow: 'S'.repeat(__TEST_CONSTANTS__.EXCERPT_BYTE_CAP),
    });
    expect(JSON.stringify(entry).length).toBeLessThanOrEqual(__TEST_CONSTANTS__.ENTRY_BYTE_CAP);
    expect(entry.excerptLegacy).toBeUndefined();
    expect(entry.excerptShadow).toBeUndefined();
  });

  it('replaces codes with placeholder when still oversized after dropping excerpts', () => {
    const longCode = 'x'.repeat(120);
    const entry = recordMismatch({
      ...baseEntry({
        class: 'output-byte-diff',
        legacySummary: { ok: false, code: longCode, byteCount: 1024, durationBucket: 'slow' },
        shadowSummary: { ok: false, code: longCode, byteCount: 1024, durationBucket: 'slow' },
      }),
      excerptLegacy: 'L'.repeat(__TEST_CONSTANTS__.EXCERPT_BYTE_CAP),
      excerptShadow: 'S'.repeat(__TEST_CONSTANTS__.EXCERPT_BYTE_CAP),
    });
    expect(JSON.stringify(entry).length).toBeLessThanOrEqual(__TEST_CONSTANTS__.ENTRY_BYTE_CAP);
    expect(entry.excerptLegacy).toBeUndefined();
    expect(entry.excerptShadow).toBeUndefined();
  });

  it('clamps overlong code/kid fields to per-field caps', () => {
    const entry = recordMismatch({
      ...baseEntry({
        class: 'cross-runtime-drift',
        legacySummary: {
          ok: false,
          code: 'a'.repeat(200),
          jwksKid: 'k'.repeat(200),
          durationBucket: 'medium',
        },
        shadowSummary: { ok: false, code: 'b'.repeat(200), jwksKid: 'k'.repeat(200) },
      }),
    });
    expect(entry.legacySummary.code?.length).toBeLessThanOrEqual(64);
    expect(entry.legacySummary.jwksKid?.length).toBeLessThanOrEqual(32);
    expect(entry.shadowSummary.code?.length).toBeLessThanOrEqual(64);
  });
});

describe('shadow mismatch sink isolation', () => {
  it('resetShadowSinkForTests respects buffer size env override', () => {
    resetShadowSinkForTests({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '128' });
    expect(getShadowSinkCapacity()).toBe(128);
    resetShadowSinkForTests({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '999999' });
    expect(getShadowSinkCapacity()).toBe(__TEST_CONSTANTS__.MAX_BUFFER_SIZE);
  });
});
