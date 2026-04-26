/**
 * Layer-isolated parity test: bounded internal temporal validator vs
 * the canonical checkOccurredAtSkew in @peac/schema.
 *
 * Compares the normalized {accepted, errorCode?, warnings?} result
 * byte-for-byte across the re-included temporal warning fixtures and
 * a synthetic edge-case set. Layer-isolated means: only the
 * occurred_at canonical-skew classification is exercised on either
 * side; iat-not-yet-valid checks (which live inline at
 * verify-local.ts:454 with no helper to import) are NOT in scope here.
 *
 * LEFT side: checkOccurredAtSkew(occurredAt, iat, now, tolerance) ->
 *   raw return (null | warning object | 'future_error') -> projected
 *   to TemporalResult.
 * RIGHT side: validateTemporalInternal(occurredAt, iat, now, tolerance).
 *
 * **Temporal parity uses a fixed clock. Any test that depends on live
 * wall-clock time is invalid.** All `now` values in this file are
 * fixed Unix-second integers; no Date.now() call is permitted.
 *
 * Any divergence is stop-the-line.
 */

import { describe, it, expect } from 'vitest';
import { checkOccurredAtSkew } from '@peac/schema';
import { OCCURRED_AT_TOLERANCE_SECONDS } from '@peac/kernel';
import {
  validateTemporalInternal,
  type TemporalResult,
} from '../../src/_internal/record-core/validators';
import { loadFixtureManifest } from '../../src/_internal/test-helpers/fixture-manifest';

// ---------------------------------------------------------------------------
// LEFT (canonical) helper: projects checkOccurredAtSkew's raw return
// (null | warning object | 'future_error') to the normalized
// TemporalResult shape used by the bounded validator
// ---------------------------------------------------------------------------

function runCanonicalTemporal(
  occurredAt: string | undefined,
  iat: number,
  now: number,
  tolerance: number = OCCURRED_AT_TOLERANCE_SECONDS
): TemporalResult {
  const raw = checkOccurredAtSkew(occurredAt, iat, now, tolerance);
  if (raw === null) {
    return { accepted: true };
  }
  if (raw === 'future_error') {
    return { accepted: false, errorCode: 'E_OCCURRED_AT_FUTURE', pointer: '/occurred_at' };
  }
  // VerificationWarning object
  return {
    accepted: true,
    warnings: [{ code: raw.code, pointer: raw.pointer }],
  };
}

function bothAgree(
  occurredAt: string | undefined,
  iat: number,
  now: number,
  tolerance?: number
): TemporalResult {
  const left = runCanonicalTemporal(occurredAt, iat, now, tolerance);
  const right = validateTemporalInternal(occurredAt, iat, now, tolerance);
  expect(right).toEqual(left);
  return left;
}

// ---------------------------------------------------------------------------
// Fixture-driven parity (re-included temporal warning fixtures)
// ---------------------------------------------------------------------------

const manifest = loadFixtureManifest();
const temporalFixtures = manifest.included.filter(
  (e) => e.category === 'included_temporal_warning'
);

/**
 * Fixed `now` value far in the future so the future-error path never
 * fires for fixture data; only the occurred_at-after-iat skew warning
 * branch is exercised. Year 2099-01-01T00:00:00Z in Unix seconds.
 */
const FIXTURE_NOW = 4070908800;

describe('temporal parity (LEFT checkOccurredAtSkew vs RIGHT internal)', () => {
  it('manifest re-included at least one temporal warning fixture', () => {
    expect(temporalFixtures.length).toBeGreaterThan(0);
  });

  describe('result byte-equal on every re-included fixture', () => {
    for (const entry of temporalFixtures) {
      it(`${entry.source}/${entry.family}/${entry.id}: LEFT === RIGHT`, () => {
        const claims = entry.input as { occurred_at?: unknown; iat?: unknown };
        const occurredAt = typeof claims.occurred_at === 'string' ? claims.occurred_at : undefined;
        const iat = typeof claims.iat === 'number' ? claims.iat : 0;
        bothAgree(occurredAt, iat, FIXTURE_NOW);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic edge cases (fixed clock; deterministic)
// ---------------------------------------------------------------------------

describe('temporal edge cases (LEFT vs RIGHT, fixed clock)', () => {
  /** Fixed reference time: 2025-01-01T00:00:00Z. */
  const NOW = 1735689600;
  /** iat exactly at NOW. */
  const IAT_AT_NOW = NOW;

  describe('occurred_at presence and parseability', () => {
    it('occurred_at undefined: accepted, no warning', () => {
      const r = bothAgree(undefined, IAT_AT_NOW, NOW);
      expect(r).toEqual({ accepted: true });
    });

    it('occurred_at unparseable: accepted, no warning (parse failure surfaces from schema layer)', () => {
      const r = bothAgree('not-a-timestamp', IAT_AT_NOW, NOW);
      expect(r).toEqual({ accepted: true });
    });
  });

  describe('occurred_at vs iat (within tolerance)', () => {
    it('occurred_at equal to iat: accepted, no warning', () => {
      const r = bothAgree('2025-01-01T00:00:00Z', IAT_AT_NOW, NOW);
      expect(r).toEqual({ accepted: true });
    });

    it('occurred_at one second before iat: accepted, no warning', () => {
      const r = bothAgree('2024-12-31T23:59:59Z', IAT_AT_NOW, NOW);
      expect(r).toEqual({ accepted: true });
    });

    it('occurred_at one second after iat (within tolerance): occurred_at_skew warning', () => {
      const r = bothAgree('2025-01-01T00:00:01Z', IAT_AT_NOW, NOW);
      expect(r).toEqual({
        accepted: true,
        warnings: [{ code: 'occurred_at_skew', pointer: '/occurred_at' }],
      });
    });

    it('occurred_at exactly at tolerance ceiling (now + tolerance): occurred_at_skew warning, not future_error', () => {
      // ts = now + tolerance is the boundary; canonical uses ts > now+tolerance
      // for future_error, so equality stays in the skew-warning branch.
      const ts = NOW + OCCURRED_AT_TOLERANCE_SECONDS;
      const iso = new Date(ts * 1000).toISOString();
      const r = bothAgree(iso, IAT_AT_NOW, NOW);
      expect(r).toEqual({
        accepted: true,
        warnings: [{ code: 'occurred_at_skew', pointer: '/occurred_at' }],
      });
    });
  });

  describe('occurred_at beyond tolerance (future)', () => {
    it('occurred_at one second past tolerance: E_OCCURRED_AT_FUTURE', () => {
      const ts = NOW + OCCURRED_AT_TOLERANCE_SECONDS + 1;
      const iso = new Date(ts * 1000).toISOString();
      const r = bothAgree(iso, IAT_AT_NOW, NOW);
      expect(r).toEqual({
        accepted: false,
        errorCode: 'E_OCCURRED_AT_FUTURE',
        pointer: '/occurred_at',
      });
    });

    it('occurred_at far in the future: E_OCCURRED_AT_FUTURE', () => {
      const r = bothAgree('2099-12-31T23:59:59Z', IAT_AT_NOW, NOW);
      expect(r).toEqual({
        accepted: false,
        errorCode: 'E_OCCURRED_AT_FUTURE',
        pointer: '/occurred_at',
      });
    });
  });

  describe('explicit tolerance parameter', () => {
    it('tighter tolerance (60s) accepts within-bound skew', () => {
      const ts = NOW + 30; // 30 seconds in the future relative to now
      const iso = new Date(ts * 1000).toISOString();
      const r = bothAgree(iso, IAT_AT_NOW, NOW, 60);
      expect(r).toEqual({
        accepted: true,
        warnings: [{ code: 'occurred_at_skew', pointer: '/occurred_at' }],
      });
    });

    it('tighter tolerance (60s) rejects beyond-bound future', () => {
      const ts = NOW + 61; // 1 second past 60s tolerance
      const iso = new Date(ts * 1000).toISOString();
      const r = bothAgree(iso, IAT_AT_NOW, NOW, 60);
      expect(r).toEqual({
        accepted: false,
        errorCode: 'E_OCCURRED_AT_FUTURE',
        pointer: '/occurred_at',
      });
    });

    it('zero tolerance: any future occurred_at is rejected', () => {
      const r = bothAgree('2025-01-01T00:00:01Z', IAT_AT_NOW, NOW, 0);
      expect(r).toEqual({
        accepted: false,
        errorCode: 'E_OCCURRED_AT_FUTURE',
        pointer: '/occurred_at',
      });
    });

    it('zero tolerance: occurred_at equal to now stays in skew-warning branch (not rejected)', () => {
      // ts === now; ts > now+0 is FALSE; ts > iat depends on iat.
      // With iat slightly older than now, ts > iat fires skew warning.
      const olderIat = NOW - 10;
      const r = bothAgree('2025-01-01T00:00:00Z', olderIat, NOW, 0);
      expect(r).toEqual({
        accepted: true,
        warnings: [{ code: 'occurred_at_skew', pointer: '/occurred_at' }],
      });
    });
  });

  describe('format and offset handling', () => {
    it('occurred_at with non-UTC offset (+05:30) parses to the same UTC instant', () => {
      // 2025-01-01T05:30:00+05:30 == 2025-01-01T00:00:00Z == NOW
      const r = bothAgree('2025-01-01T05:30:00+05:30', IAT_AT_NOW, NOW);
      expect(r).toEqual({ accepted: true });
    });

    it('occurred_at with millisecond precision is parsed', () => {
      const r = bothAgree('2025-01-01T00:00:00.500Z', IAT_AT_NOW, NOW);
      // ts is now + 0.5s; ts > iat (now), so skew warning expected
      expect(r).toEqual({
        accepted: true,
        warnings: [{ code: 'occurred_at_skew', pointer: '/occurred_at' }],
      });
    });
  });
});
