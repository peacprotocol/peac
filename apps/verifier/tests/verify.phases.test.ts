/**
 * Phase-legal states, one test per variant, asserting the FULL assessment tuple and report shape.
 */
import { describe, it, expect } from 'vitest';
import { initializeLocalVerifier } from '../src/verify.js';
import { makeFixture, makeUnrelatedKeyDocument, tamperSignature } from './helpers/fixtures.js';

const BUILD = 'test-build';
const verifier = await initializeLocalVerifier({ verifierBuild: BUILD });

const ctx = (o: unknown) => JSON.stringify(o);

describe('input failures (no report)', () => {
  it('rejects surrounding whitespace without trimming', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: ` ${f.record} `,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(r.ok).toBe(false);
    expect('failureStage' in r && r.failureStage).toBe('input');
    expect(r.report).toBeUndefined();
    expect('code' in r && r.code).toBe('E_VERIFIER_RECORD_WHITESPACE');
  });

  it('rejects an empty record', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: '',
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect('code' in r && r.code).toBe('E_VERIFIER_INPUT_EMPTY');
    expect(r.report).toBeUndefined();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['fractional', 1.5],
    ['negative', -1],
  ])('rejects %s evaluation time', async (_label, value) => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: value as number,
    });
    expect('code' in r && r.code).toBe('E_VERIFIER_TIME_INVALID');
    expect(r.report).toBeUndefined();
  });

  it('rejects skew above the locked ceiling', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      maxClockSkewSeconds: 3601,
    });
    expect('code' in r && r.code).toBe('E_VERIFIER_SKEW_INVALID');
  });

  it('accepts skew exactly at the ceiling', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      maxClockSkewSeconds: 3600,
    });
    expect(r.ok).toBe(true);
  });
});

describe('signature failure', () => {
  it('classifies a same-length tamper, with no claims and all expectations not_evaluated', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: tamperSignature(f.record),
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(r.ok).toBe(false);
    expect('failureStage' in r && r.failureStage).toBe('signature');
    expect('signature' in r && r.signature).toBe('invalid_under_supplied_key');
    expect('recordValidation' in r && r.recordValidation).toBe('not_evaluated');
    expect('trustedKey' in r && r.trustedKey).toBe('not_evaluated');
    expect('claims' in r).toBe(false);
    expect(r.report?.outcome).toBe('rejected');
    expect(r.report?.failureCode).toBe('E_INVALID_SIGNATURE');
    expect(r.report?.recordType).toBeUndefined();
    expect(r.report?.reportedIssuer).toBeUndefined();
  });

  it('classifies a wrong (but valid) key as a signature failure', async () => {
    const f = await makeFixture();
    const other = await makeUnrelatedKeyDocument('k1');
    const r = await verifier.verify({
      record: f.record,
      keyDocument: other,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect('failureStage' in r && r.failureStage).toBe('signature');
    expect('claims' in r).toBe(false);
  });
});

describe('success', () => {
  it('integrity-only with no context', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mode).toBe('integrity-only');
    expect(r.signature).toBe('valid_under_supplied_key');
    expect(r.recordValidation).toBe('valid');
    expect(r.trustedKey).toBe('not_provided');
    expect(r.claimTruth).toBe('not_evaluated');
    expect(r.report.recordType).toBe(f.recordType);
    expect(r.report.reportedIssuer).toBe(f.issuer);
    expect(r.report.verifierBuild).toBe(BUILD);
  });

  it('trusted-key when a supplied thumbprint matches', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: ctx({
        contextVersion: '1',
        trust: { trustedJwkThumbprints: [f.thumbprint] },
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mode).toBe('trusted-key');
    expect(r.trustedKey).toBe('matched');
  });

  it('constraints-checked when constraints match but no thumbprint is supplied', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: ctx({ contextVersion: '1', constraints: { expectedIssuer: f.issuer } }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mode).toBe('constraints-checked');
    expect(r.trustedKey).toBe('not_provided');
    expect(r.issuerConstraint).toBe('matched');
  });
});

describe('expectation failures and precedence', () => {
  it('trusted-key mismatch, no claims', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: ctx({
        contextVersion: '1',
        trust: { trustedJwkThumbprints: ['A'.repeat(43)] },
      }),
    });
    expect('failureStage' in r && r.failureStage).toBe('trusted_key');
    expect(r.report?.failureCode).toBe('E_VERIFIER_TRUSTED_KEY_MISMATCH');
    expect('claims' in r).toBe(false);
  });

  it.each([
    ['issuer', { expectedIssuer: 'https://other.example' }, 'E_VERIFIER_ISSUER_MISMATCH'],
    ['kid', { allowedKids: ['nope'] }, 'E_VERIFIER_KID_MISMATCH'],
    [
      'record type',
      { allowedRecordTypes: ['org.example/other'] },
      'E_VERIFIER_RECORD_TYPE_MISMATCH',
    ],
  ])('%s constraint mismatch', async (_l, constraints, code) => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: ctx({ contextVersion: '1', constraints }),
    });
    expect('failureStage' in r && r.failureStage).toBe('constraints');
    expect(r.report?.failureCode).toBe(code);
  });

  it('applies precedence: trusted key wins over every constraint', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: ctx({
        contextVersion: '1',
        trust: { trustedJwkThumbprints: ['A'.repeat(43)] },
        constraints: { expectedIssuer: 'https://other.example', allowedKids: ['nope'] },
      }),
    });
    expect('failureStage' in r && r.failureStage).toBe('trusted_key');
    expect(r.report?.failureCode).toBe('E_VERIFIER_TRUSTED_KEY_MISMATCH');
    // every evaluated mismatch is still reported
    expect(r.report?.issuerConstraintResult).toBe('mismatched');
    expect(r.report?.kidConstraintResult).toBe('mismatched');
  });

  it('applies precedence: issuer wins over kid and record type', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: ctx({
        contextVersion: '1',
        constraints: {
          expectedIssuer: 'https://other.example',
          allowedKids: ['nope'],
          allowedRecordTypes: ['org.example/other'],
        },
      }),
    });
    expect(r.report?.failureCode).toBe('E_VERIFIER_ISSUER_MISMATCH');
    expect(r.report?.kidConstraintResult).toBe('mismatched');
    expect(r.report?.recordTypeConstraintResult).toBe('mismatched');
  });
});
