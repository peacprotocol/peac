/**
 * Canonical-vs-candidate differential.
 *
 * Runs the canonical validator path (`canonical-runner`) and the
 * canonical-composed candidate path (`candidate-runner`) on every
 * eligible fixture from the existing manifest and asserts the
 * normalized `ParityVerdict` byte-for-byte equals across both sides.
 *
 * The candidate is canonical-composed by construction: every layer
 * either delegates to the same canonical helper the canonical runner
 * uses or mirrors a canonical inline check verbatim. Byte equality
 * is therefore expected on every fixture; any divergence indicates a
 * defect in the candidate-runner's projection logic.
 *
 * This test asserts the candidate projection remains byte-equal to
 * the canonical verdict shape across the fixture manifest, not merely
 * that two implementations happened to agree by accident.
 *
 * Coverage inherited from the fixture manifest:
 *   - 31 schema-validated parity-corpus vectors (4 families).
 *   - All eligible wire-02-conformance fixtures (full-pipeline,
 *     jws-security with header_overrides, warning).
 *
 * Excluded fixtures are tracked in the manifest with explicit reasons
 * and do not run on either side.
 */

import { describe, it, expect } from 'vitest';
import { runCanonicalForKind } from '../../src/_internal/test-helpers/canonical-runner';
import { runCandidateForKind } from '../../src/_internal/test-helpers/candidate-runner';
import { verdictKey } from '../../src/_internal/test-helpers/parity-verdict';
import { loadFixtureManifest } from '../../src/_internal/test-helpers/fixture-manifest';

const manifest = loadFixtureManifest();

describe('parity differential (canonical vs candidate)', () => {
  it('manifest has fixtures eligible for the canonical-vs-candidate differential', () => {
    expect(manifest.totals.included).toBeGreaterThan(0);
  });

  describe('zero divergence: candidate verdict byte-equals canonical verdict on every included fixture', () => {
    for (const entry of manifest.included) {
      it(`${entry.source}/${entry.family}/${entry.id}: CANDIDATE === CANONICAL`, async () => {
        const canonical = await runCanonicalForKind(entry.runnerKind, entry.input);
        const candidate = await runCandidateForKind(entry.runnerKind, entry.input);
        expect(verdictKey(candidate)).toBe(verdictKey(canonical));
      });
    }
  });
});
