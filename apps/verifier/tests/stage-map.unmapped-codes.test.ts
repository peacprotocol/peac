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
      // Narrow past the `ok: false` union: CapabilityFailure carries no `failureStage` at all, so
      // an `in` check (rather than a bare property read) is required before the discriminant read
      // below is safe. Once `failureStage` is known to be present, its value is the discriminant
      // that narrows the remaining variants down to exactly `InternalError`.
      if (!('failureStage' in r)) throw new Error('expected a failureStage-bearing failure');
      expect(r.failureStage).toBe('internal_error');
      if (r.failureStage !== 'internal_error') return;
      expect(r.code).toBe('E_VERIFIER_UNMAPPED_CANONICAL_CODE');
      expect(r.signature).toBe('not_evaluated');
      expect(r.recordValidation).toBe('not_evaluated');
      // `InternalError.report` is optional (an internal error before a report could be built has
      // none); this path always produces one, so require it explicitly rather than reading through
      // a possibly-undefined value.
      expect(r.report).toBeDefined();
      if (!r.report) return;
      expect(r.report).toMatchObject({
        outcome: 'rejected',
        failureStage: 'internal_error',
        failureCode: 'E_VERIFIER_UNMAPPED_CANONICAL_CODE',
        signatureResult: 'not_evaluated',
        recordValidationResult: 'not_evaluated',
      });
      expect(r.report.recordType).toBeUndefined();
      expect(r.report.reportedIssuer).toBeUndefined();
    }
  );
});
