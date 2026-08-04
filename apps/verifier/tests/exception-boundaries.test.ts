/**
 * Exception boundaries.
 *
 * The orchestrator distinguishes two kinds of failure:
 *
 *   BOUNDED    a `VerifierError` raised by validation, key parsing or routing. The operator's input
 *              is genuinely at fault, and the stage that names it is meaningful.
 *   UNKNOWN    a programmer error, an invariant violation or a dependency defect. The operator's
 *              input may be perfectly valid, so reporting it as an input or key-selection failure
 *              would send them to fix something that is not broken.
 *
 * Only the first kind may be reported at a user-facing stage. The second must reach the total
 * boundary and be reported as an internal error, with the whole assessment `not_evaluated`.
 *
 * These rules are invisible to type checking and to any test that only exercises valid inputs, so
 * each is asserted directly here. Injection is done with module spies and the existing bounded
 * `verifyLocal` seam; the public runtime API gains no test-only hook.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { initializeLocalVerifier } from '../src/verify.js';
import { VerifierError } from '../src/lib/errors.js';
import { assertReportValid, assertReportHash } from './helpers/report-schema.js';
import { makeFixture } from './helpers/fixtures.js';

const BUILD = 'test-build';

afterEach(() => {
  vi.restoreAllMocks();
});

async function verifier(overrides: Record<string, unknown> = {}) {
  return initializeLocalVerifier({ verifierBuild: BUILD, ...overrides });
}

describe('1. an unknown exception during input parsing is never an input failure', () => {
  it('is reported as internal_error with the whole assessment not_evaluated', async () => {
    const f = await makeFixture();
    const mod = await import('../src/lib/public-key.js');
    vi.spyOn(mod, 'parseKeyDocument').mockImplementation(() => {
      throw new TypeError('programmer error inside key parsing');
    });

    const result = await (
      await verifier()
    ).verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });

    expect(result).toMatchObject({
      ok: false,
      failureStage: 'internal_error',
      code: 'E_VERIFIER_INTERNAL_ERROR',
      signature: 'not_evaluated',
      recordValidation: 'not_evaluated',
    });
    expect(result).not.toMatchObject({ failureStage: 'input' });
    // Before key selection there is nothing to identify a verification, so no report may exist.
    expect(result).not.toHaveProperty('report');
  });

  it('a BOUNDED input error is still reported at the input stage', async () => {
    const f = await makeFixture();
    const result = await (
      await verifier()
    ).verify({
      record: '',
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(result).toMatchObject({ ok: false, failureStage: 'input' });
  });
});

describe('2. an unknown exception during single-key routing is rethrown, never swallowed', () => {
  it('reaches the total boundary instead of degrading the verification silently', async () => {
    const f = await makeFixture();
    const mod = await import('../src/lib/protected-kid.js');
    vi.spyOn(mod, 'readProtectedKidForRouting').mockImplementation(() => {
      throw new RangeError('invariant violation inside routing');
    });

    const result = await (
      await verifier()
    ).verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });

    // Swallowing this would produce a confident ACCEPTED result from a verifier that hit a defect.
    expect(result).toMatchObject({
      ok: false,
      failureStage: 'internal_error',
      code: 'E_VERIFIER_INTERNAL_ERROR',
    });
    expect(result.ok).toBe(false);
  });
});

describe('3. a documented routing failure remains swallowable on the single-key path', () => {
  it('verification still succeeds, because the sole key needs no routing to be selected', async () => {
    const f = await makeFixture();
    const mod = await import('../src/lib/protected-kid.js');
    vi.spyOn(mod, 'readProtectedKidForRouting').mockImplementation(() => {
      throw new VerifierError('E_VERIFIER_RECORD_MALFORMED', 'bounded routing failure');
    });

    const result = await (
      await verifier()
    ).verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });

    expect(result.ok).toBe(true);
  });

  it('an undocumented VerifierError code is NOT swallowed', async () => {
    const f = await makeFixture();
    const mod = await import('../src/lib/protected-kid.js');
    vi.spyOn(mod, 'readProtectedKidForRouting').mockImplementation(() => {
      // A real VerifierError, but not one routing is documented to raise.
      throw new VerifierError('E_VERIFIER_INTERNAL_ERROR', 'not a routing failure');
    });

    const result = await (
      await verifier()
    ).verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });

    expect(result).toMatchObject({ ok: false, failureStage: 'internal_error' });
  });
});

describe('4. an unknown key-selection exception is never a key_selection failure', () => {
  it('is reported as internal_error', async () => {
    const f = await makeFixture();
    const mod = await import('../src/lib/public-key.js');
    vi.spyOn(mod, 'selectSoleKey').mockImplementation(() => {
      throw new Error('programmer error inside key selection');
    });

    const result = await (
      await verifier()
    ).verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });

    expect(result).toMatchObject({ ok: false, failureStage: 'internal_error' });
    expect(result).not.toMatchObject({ failureStage: 'key_selection' });
  });
});

describe('5. an unexpected canonical-verifier throw produces a schema-valid rejected report', () => {
  it('the report exists because key selection had already succeeded', async () => {
    const f = await makeFixture();
    const result = await (
      await verifier({
        verifyLocal: () => {
          throw new Error('canonical verifier defect');
        },
      })
    ).verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });

    expect(result).toMatchObject({
      ok: false,
      failureStage: 'internal_error',
      code: 'E_VERIFIER_INTERNAL_ERROR',
      signature: 'not_evaluated',
      recordValidation: 'not_evaluated',
    });

    const report = (result as { report?: Record<string, unknown> }).report;
    expect(report).toBeDefined();
    assertReportValid(report, 'canonical-verifier throw');
    assertReportHash(report as Record<string, unknown>, 'canonical-verifier throw');
    expect((report as Record<string, unknown>).outcome).toBe('rejected');
    expect((report as Record<string, unknown>).recordType).toBeUndefined();
  });

  it('does not leak the internal message', async () => {
    const f = await makeFixture();
    const result = await (
      await verifier({
        verifyLocal: () => {
          throw new Error('internal detail 0xDEADBEEF');
        },
      })
    ).verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(JSON.stringify(result)).not.toContain('0xDEADBEEF');
  });
});

describe('6. report-construction failure yields the catastrophic internal result', () => {
  it('no report, no claims, and the report-construction diagnostic', async () => {
    const f = await makeFixture();
    const reportMod = await import('../src/lib/report.js');
    // Fail report construction itself, AFTER a report base exists. An approximate or partial report
    // would be worse than none: it would be a deterministic artifact that is not what it claims.
    vi.spyOn(reportMod, 'buildReportCore').mockImplementation(() => {
      throw new Error('report construction failed');
    });

    const result = await (
      await verifier({
        verifyLocal: () => {
          throw new Error('canonical verifier defect');
        },
      })
    ).verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });

    expect(result).toMatchObject({
      ok: false,
      failureStage: 'internal_error',
      code: 'E_VERIFIER_INTERNAL_ERROR',
      diagnostic: 'D_REPORT_CONSTRUCTION_FAILED',
      signature: 'not_evaluated',
      recordValidation: 'not_evaluated',
    });
    expect(result).not.toHaveProperty('report');
    expect(result).not.toHaveProperty('claims');
  });
});
