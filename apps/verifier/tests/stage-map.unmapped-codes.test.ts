/**
 * End-to-end: every string the canonical stage map does not OWN reaches the fail-closed
 * internal-error path, with no positive signature or validation claim in the result or report.
 *
 * The canonical verifier is stubbed through the `verifyLocal` injection point so the orchestrator
 * sees a rejected result carrying an arbitrary code. Inherited Object member names are the cases
 * that used to escape: a plain object index resolved them to inherited functions, which the caller
 * accepted as a mapped stage and classified as a post-signature failure -- i.e. it asserted
 * "signature valid under supplied key" with no evidence.
 */
import { describe, it, expect } from 'vitest';
import { initializeLocalVerifier } from '../src/verify.js';
import { makeFixture } from './helpers/fixtures.js';

const BUILD = 'test-build';

describe('unmapped canonical codes fail closed end to end', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'E_FUTURE_CODE'])(
    'code %s -> internal_error / E_VERIFIER_UNMAPPED_CANONICAL_CODE, nothing evaluated',
    async (code) => {
      const verifier = await initializeLocalVerifier({
        verifierBuild: BUILD,
        verifyLocal: (async () => ({ valid: false, code, message: 'stubbed' })) as never,
      });
      const f = await makeFixture();
      const r = await verifier.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.failureStage).toBe('internal_error');
      expect(r.code).toBe('E_VERIFIER_UNMAPPED_CANONICAL_CODE');
      expect(r.signature).toBe('not_evaluated');
      expect(r.recordValidation).toBe('not_evaluated');
      expect(r.report.outcome).toBe('rejected');
      expect(r.report.failureStage).toBe('internal_error');
      expect(r.report.failureCode).toBe('E_VERIFIER_UNMAPPED_CANONICAL_CODE');
      expect(r.report.signatureResult).toBe('not_evaluated');
      expect(r.report.recordValidationResult).toBe('not_evaluated');
      expect((r.report as { recordType?: unknown }).recordType).toBeUndefined();
      expect((r.report as { reportedIssuer?: unknown }).reportedIssuer).toBeUndefined();
    }
  );
});
