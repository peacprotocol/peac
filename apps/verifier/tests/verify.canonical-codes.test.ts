/**
 * Canonical codes reach the report, and an unmapped code fails CLOSED.
 */
import { describe, it, expect } from 'vitest';
import { initializeLocalVerifier } from '../src/verify.js';
import { makeFixture, withProtectedHeader, BASE_HEADER } from './helpers/fixtures.js';

describe('canonical codes are preserved', () => {
  it('a post-signature validation failure keeps its canonical code and reports signature valid', async () => {
    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    // Evaluate far in the past: the record is not yet valid -> a POST-signature canonical code.
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: 1,
    });
    expect('failureStage' in r && r.failureStage).toBe('record_validation_post_signature');
    expect('code' in r && r.code).toBe('E_NOT_YET_VALID');
    expect('signature' in r && r.signature).toBe('valid_under_supplied_key');
    expect(r.report?.failureCode).toBe('E_NOT_YET_VALID');
    expect(r.report?.signatureResult).toBe('valid_under_supplied_key');
  });

  it('a pre-signature failure reports signature not_evaluated', async () => {
    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    const r = await verifier.verify({
      record: withProtectedHeader(f.record, { ...BASE_HEADER, crit: ['x'] }),
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect('failureStage' in r && r.failureStage).toBe('record_validation_pre_signature');
    expect('signature' in r && r.signature).toBe('not_evaluated');
    expect(r.report?.signatureResult).toBe('not_evaluated');
    expect(r.report?.recordValidationResult).toBe('invalid');
  });
});

describe('unmapped canonical code fails closed', () => {
  it('never implies the signature was valid', async () => {
    const f = await makeFixture();
    // Inject a canonical verifier that returns a code outside the union.
    const verifier = await initializeLocalVerifier({
      verifierBuild: 'test-build',
      verifyLocal: (async () => ({
        valid: false,
        code: 'E_FUTURE_CODE_NOT_YET_MAPPED',
        message: 'from a newer protocol package',
      })) as never,
    });
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect('failureStage' in r && r.failureStage).toBe('internal_error');
    expect('code' in r && r.code).toBe('E_VERIFIER_UNMAPPED_CANONICAL_CODE');
    expect('signature' in r && r.signature).toBe('not_evaluated');
    expect('recordValidation' in r && r.recordValidation).toBe('not_evaluated');
    expect('claims' in r).toBe(false);
    expect(r.report?.signatureResult).toBe('not_evaluated');
    // the original code survives as a local diagnostic
    expect('diagnostic' in r && r.diagnostic).toBe('E_FUTURE_CODE_NOT_YET_MAPPED');
  });

  it('E_INTERNAL from the canonical verifier is an internal error, not a validation verdict', async () => {
    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({
      verifierBuild: 'test-build',
      verifyLocal: (async () => ({
        valid: false,
        code: 'E_INTERNAL',
        message: 'internal',
      })) as never,
    });
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect('failureStage' in r && r.failureStage).toBe('internal_error');
    expect('code' in r && r.code).toBe('E_VERIFIER_INTERNAL_ERROR');
  });
});

describe('the canonical verifier is called exactly once', () => {
  it('one call per verification, after key selection', async () => {
    const f = await makeFixture();
    let calls = 0;
    const { verifyLocal } = await import('@peac/protocol/verify-local');
    const verifier = await initializeLocalVerifier({
      verifierBuild: 'test-build',
      verifyLocal: (async (...args: Parameters<typeof verifyLocal>) => {
        calls++;
        return verifyLocal(...args);
      }) as never,
    });
    await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(calls).toBe(1);
  });

  it('is not called at all when key selection fails', async () => {
    const f = await makeFixture();
    let calls = 0;
    const verifier = await initializeLocalVerifier({
      verifierBuild: 'test-build',
      verifyLocal: (async () => {
        calls++;
        return { valid: false, code: 'E_INTERNAL', message: '' };
      }) as never,
    });
    await verifier.verify({
      record: f.record,
      keyDocument: '{"keys":[]}',
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(calls).toBe(0);
  });
});
