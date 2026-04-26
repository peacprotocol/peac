/**
 * Layer-isolated parity test: bounded internal kernel-constraints
 * validator vs the canonical @peac/schema implementation.
 *
 * Compares ConstraintValidationResult byte-for-byte across every
 * envelope-payload fixture in the parity manifest. Layer-isolated
 * means: only validateKernelConstraints is exercised on either side;
 * parseReceiptClaims, type-extension mapping, JOSE hardening,
 * verifyLocal warnings, policy binding, and full-JWS verification
 * are NOT in scope here.
 *
 * Eligibility: every IncludedEntry with runnerKind === 'envelope' from
 * the fixture manifest. JOSE-rejection vectors (runnerKind 'jose')
 * exercise validateWire02Header and are excluded from this test.
 *
 * Any divergence is stop-the-line (the new validator is REVERTED, not
 * the canonical or the fixture).
 */

import { describe, it, expect } from 'vitest';
import { validateKernelConstraints } from '@peac/schema';
import { validateKernelConstraintsInternal } from '../../src/_internal/record-core/validators';
import { loadFixtureManifest } from '../../src/_internal/test-helpers/fixture-manifest';

const manifest = loadFixtureManifest();
const envelopeFixtures = manifest.included.filter((e) => e.runnerKind === 'envelope');

describe('kernel-constraints parity (LEFT @peac/schema vs RIGHT internal)', () => {
  it('manifest has at least one envelope-payload fixture for the comparison', () => {
    expect(envelopeFixtures.length).toBeGreaterThan(0);
  });

  describe('ConstraintValidationResult byte-equal on every envelope-payload fixture', () => {
    for (const entry of envelopeFixtures) {
      it(`${entry.source}/${entry.family}/${entry.id}: LEFT === RIGHT`, () => {
        const left = validateKernelConstraints(entry.input);
        const right = validateKernelConstraintsInternal(entry.input);
        expect(right).toEqual(left);
      });
    }
  });
});
