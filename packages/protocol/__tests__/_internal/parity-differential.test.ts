/**
 * Same-path-vs-same-path zero-divergence proof.
 *
 * Runs the existing canonical validator path TWICE on every eligible
 * fixture (parity-corpus + wire-02 conformance) and asserts that the
 * normalized ParityVerdict on the LEFT side byte-equals the verdict on
 * the RIGHT side. This is a determinism proof for the harness machinery
 * BEFORE any new validator code can hide behind a weak comparison.
 *
 * No validator code is called here. The test is intentionally trivial
 * for pure-function inputs (the canonical path is deterministic), but
 * its purpose is to prove the harness wiring is honest: any future
 * regression that introduces non-determinism in the canonical path
 * (timestamps, random ids, etc.) will surface here first.
 *
 * Coverage:
 *   - all 31 parity-corpus vectors (4 families)
 *   - all eligible wire-02 conformance fixtures (full-pipeline,
 *     jws-security with header_overrides, warning)
 *   - non-wire-02 fixture directories explicitly excluded with reasons
 *
 * The fixture manifest asserts included + excluded == total scanned;
 * no fixture is silently skipped.
 */

import { describe, it, expect } from 'vitest';
import { runCanonicalForKind } from '../../src/_internal/test-helpers/canonical-runner';
import { verdictKey } from '../../src/_internal/test-helpers/parity-verdict';
import { loadFixtureManifest } from '../../src/_internal/test-helpers/fixture-manifest';

const manifest = loadFixtureManifest();

describe('parity differential (same-path vs same-path)', () => {
  it('manifest accounts for every scanned fixture (no silent skips)', () => {
    expect(manifest.totals.total).toBe(manifest.totals.included + manifest.totals.excluded);
    expect(manifest.totals.included).toBeGreaterThan(0);
    expect(manifest.totals.excluded).toBeGreaterThan(0);
  });

  it('every excluded entry carries a non-empty reason string', () => {
    for (const e of manifest.excluded) {
      expect(typeof e.reason).toBe('string');
      expect(e.reason.length).toBeGreaterThan(0);
    }
  });

  it('parity-corpus floor coverage (>= 31 included from parity-corpus)', () => {
    const fromCorpus = manifest.included.filter((e) => e.source === 'parity-corpus');
    expect(fromCorpus.length).toBeGreaterThanOrEqual(31);
  });

  it('wire-02 coverage (>= 100 included from wire-02-conformance)', () => {
    const fromWire02 = manifest.included.filter((e) => e.source === 'wire-02-conformance');
    expect(fromWire02.length).toBeGreaterThanOrEqual(100);
  });

  describe('zero divergence: canonical path is deterministic on every included fixture', () => {
    for (const entry of manifest.included) {
      it(`${entry.source}/${entry.family}/${entry.id}: LEFT === RIGHT`, () => {
        const left = runCanonicalForKind(entry.runnerKind, entry.input);
        const right = runCanonicalForKind(entry.runnerKind, entry.input);
        expect(verdictKey(left)).toBe(verdictKey(right));
      });
    }
  });
});
