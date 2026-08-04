/**
 * Routing / kid-constraint consistency.
 *
 * THE QUESTION: does an input exist where routing FAILS to read the protected header, canonical
 * verification nonetheless SUCCEEDS, and a supplied `allowedKids` constraint is then evaluated
 * against an absent protected kid -- producing a `mismatched` verdict for an inequality that was
 * never actually tested?
 *
 * Such an input exists whenever routing and canonical verification measure `kid` in DIFFERENT UNITS.
 * A value of 200 three-byte code points is 200 UTF-16 code units and 600 UTF-8 bytes, so a bound
 * stated in one unit accepts it while the same number stated in the other does not.
 *
 * This file pins both halves of the resolution: both surfaces apply one predicate in one unit, and
 * the unsound state is made unrepresentable by a backstop that fails closed for any divergence the
 * vectors do not enumerate.
 */
import { describe, it, expect, vi } from 'vitest';
import { VerifierError } from '../src/lib/errors.js';
import { readProtectedKidForRouting } from '../src/lib/protected-kid.js';
import { MAX_KID_UTF8_BYTES, isValidKid } from '../../../packages/crypto/src/kid';
import { initializeLocalVerifier } from '../src/verify.js';
import { makeFixture } from './helpers/fixtures.js';
import { assertReportValid, assertReportHash } from './helpers/report-schema.js';

function headerWithKid(kid: string): string {
  const json = JSON.stringify({ alg: 'EdDSA', typ: 'interaction-record+jwt', kid });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${b64}.eyJhIjoxfQ.c2ln`;
}

describe('routing and canonical kid bounds use the same unit', () => {
  /**
   * The unit matrix itself now lives in kid-length-vectors.test.ts, which checks EVERY layer
   * (kernel rule, canonical verification, routing, JWK, context) against the same accepted set.
   * What remains here is the specific unit mismatch that motivated the shared rule, and the
   * fail-closed backstop that covers any divergence not enumerated by those vectors.
   */
  it('the kid that caused the original divergence is now treated identically everywhere', () => {
    // 200 three-byte code points: 200 UTF-16 units (the OLD routing bound accepted it) and 600
    // UTF-8 bytes (the canonical bound, correctly, does not). Both layers now reject it, and for
    // the same reason -- which is the whole point.
    const kid = 'ࠀ'.repeat(200);
    expect(kid.length).toBe(200);
    expect(new TextEncoder().encode(kid).length).toBe(600);
    expect(isValidKid(kid)).toBe(false);
    expect(() => readProtectedKidForRouting(headerWithKid(kid))).toThrowError(/UTF-8 bytes/);
  });

  it('a kid at exactly the bound is accepted by routing', () => {
    const kid = 'a'.repeat(MAX_KID_UTF8_BYTES);
    expect(readProtectedKidForRouting(headerWithKid(kid))).toBe(kid);
  });
});

describe('the fail-closed backstop is live code, not a dead check', () => {
  /**
   * With the unit divergence closed at source, no KNOWN input reaches this branch. That is exactly
   * why it must be proven to work: an untriggerable safety net is indistinguishable from none.
   *
   * The trigger is simulated by making routing fail on a record the canonical verifier still
   * accepts -- which is precisely the shape of any FUTURE divergence, whatever its cause.
   */
  it('fails closed rather than reporting a kid mismatch it never evaluated', async () => {
    const f = await makeFixture('k1');
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });

    const spy = vi
      .spyOn(await import('../src/lib/protected-kid.js'), 'readProtectedKidForRouting')
      .mockImplementation(() => {
        throw new VerifierError('E_VERIFIER_KID_INVALID', 'simulated future divergence');
      });

    try {
      const result = await verifier.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        contextDocument: JSON.stringify({
          contextVersion: '1',
          constraints: { allowedKids: ['k1'] },
        }),
        evaluationTimeUnixSeconds: f.evaluationTime,
      });

      // The kid genuinely DOES match. A verifier that reported `mismatched` here would be asserting
      // an inequality it never evaluated, so the only honest outcome is a fail-closed internal error.
      // The failure code must be one the report schema ADMITS. A dedicated inconsistency code was
      // used here at first; it is a forbidden term in the machine contract and absent from the
      // schema enum, so the backstop was emitting a schema-invalid report. The divergence is now
      // carried as a bounded app-local diagnostic instead.
      expect(result).toMatchObject({
        ok: false,
        failureStage: 'internal_error',
        code: 'E_VERIFIER_INTERNAL_ERROR',
        diagnostic: 'D_ROUTING_CANONICAL_DIVERGENCE',
        signature: 'not_evaluated',
        recordValidation: 'not_evaluated',
      });
      expect(result).not.toMatchObject({ kidConstraint: 'mismatched' });

      // The report must VALIDATE against the schema, not merely have the right TypeScript shape.
      const report = (result as { report?: Record<string, unknown> }).report;
      expect(report).toBeDefined();
      assertReportValid(report, 'routing/canonical divergence backstop');
      assertReportHash(report as Record<string, unknown>, 'routing/canonical divergence backstop');
    } finally {
      spy.mockRestore();
    }
  });

  it('is NOT triggered when no kid constraint was supplied', async () => {
    const f = await makeFixture('k1');
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    const result = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(result.ok).toBe(true);
  });
});
