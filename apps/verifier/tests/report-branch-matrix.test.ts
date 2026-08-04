/**
 * Every report-bearing branch, validated against the JSON Schema.
 *
 * WHY THIS FILE EXISTS
 *
 * A test that checks the TypeScript object shape proves almost nothing here. TypeScript cannot
 * express "a rejected report at the signature stage must not claim the signature was valid", or
 * "an accepted report requires a record type and a reported issuer". The schema can, and does, via
 * code-bound `oneOf` branches -- so the schema is the thing every produced report must satisfy.
 *
 * Each row below drives the real orchestrator to one branch, then asserts four things:
 *
 *   1. the report validates against the TRACKED schema snapshot;
 *   2. `reportSha256` recomputes as SHA-256(JCS(core without reportSha256));
 *   3. success-only fields are absent on failures;
 *   4. no claims exist on any failure variant;
 *
 * and the stage/result tuple is asserted explicitly against what the machine contract permits.
 */
import { describe, it, expect } from 'vitest';
import { initializeLocalVerifier } from '../src/verify.js';
import type {
  BrowserVerificationResult,
  VerificationReportCoreV1,
} from '../src/lib/verifier-types.js';
import { assertReportValid, assertReportHash } from './helpers/report-schema.js';
import {
  makeFixture,
  makeUnrelatedKeyDocument,
  tamperSignature,
  withProtectedHeader,
  BASE_HEADER,
} from './helpers/fixtures.js';

const BUILD = 'test-build';

interface Expectation {
  outcome: 'accepted' | 'rejected';
  failureStage?: string;
  failureCode?: string;
  signatureResult: VerificationReportCoreV1['signatureResult'];
  recordValidationResult: VerificationReportCoreV1['recordValidationResult'];
}

interface Row {
  name: string;
  /** Returns the result to inspect, or null when this branch is defined to produce NO report. */
  run: () => Promise<BrowserVerificationResult>;
  expect: Expectation;
}

const rows: Row[] = [
  {
    name: 'accepted',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({ verifierBuild: BUILD });
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'accepted',
      signatureResult: 'valid_under_supplied_key',
      recordValidationResult: 'valid',
    },
  },
  {
    name: 'signature failure',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({ verifierBuild: BUILD });
      return v.verify({
        record: tamperSignature(f.record),
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'signature',
      failureCode: 'E_INVALID_SIGNATURE',
      signatureResult: 'invalid_under_supplied_key',
      recordValidationResult: 'not_evaluated',
    },
  },
  {
    name: 'pre-signature record-validation failure',
    run: async () => {
      const f = await makeFixture();
      // `crit` is a JOSE-policy rejection that the canonical verifier makes BEFORE the Ed25519 check.
      const record = withProtectedHeader(f.record, { ...BASE_HEADER, crit: ['exp'] });
      const v = await initializeLocalVerifier({ verifierBuild: BUILD });
      return v.verify({
        record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'record_validation_pre_signature',
      signatureResult: 'not_evaluated',
      recordValidationResult: 'invalid',
    },
  },
  {
    name: 'post-signature record-validation failure',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({ verifierBuild: BUILD });
      // The fixture carries occurred_at 2026-04-01 and no exp, so "evaluate in the future" does not
      // expire it. Evaluating BEFORE occurred_at does reach a post-signature rejection: the
      // signature verifies, then the record fails PEAC validation. This is the branch that must
      // never report a false signature state.
      const beforeOccurredAt =
        Math.floor(Date.parse('2026-04-01T00:00:00Z') / 1000) - 10 * 24 * 3600;
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: beforeOccurredAt,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'record_validation_post_signature',
      signatureResult: 'valid_under_supplied_key',
      recordValidationResult: 'invalid',
    },
  },
  {
    name: 'trusted-key mismatch',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({ verifierBuild: BUILD });
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        contextDocument: JSON.stringify({
          contextVersion: '1',
          trust: { trustedJwkThumbprints: ['A'.repeat(43)] },
        }),
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'trusted_key',
      failureCode: 'E_VERIFIER_TRUSTED_KEY_MISMATCH',
      signatureResult: 'valid_under_supplied_key',
      recordValidationResult: 'valid',
    },
  },
  {
    name: 'issuer mismatch',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({ verifierBuild: BUILD });
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        contextDocument: JSON.stringify({
          contextVersion: '1',
          constraints: { expectedIssuer: 'https://other.example' },
        }),
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'constraints',
      failureCode: 'E_VERIFIER_ISSUER_MISMATCH',
      signatureResult: 'valid_under_supplied_key',
      recordValidationResult: 'valid',
    },
  },
  {
    name: 'kid mismatch',
    run: async () => {
      const f = await makeFixture('k1');
      const v = await initializeLocalVerifier({ verifierBuild: BUILD });
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        contextDocument: JSON.stringify({
          contextVersion: '1',
          constraints: { allowedKids: ['not-k1'] },
        }),
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'constraints',
      failureCode: 'E_VERIFIER_KID_MISMATCH',
      signatureResult: 'valid_under_supplied_key',
      recordValidationResult: 'valid',
    },
  },
  {
    name: 'record-type mismatch',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({ verifierBuild: BUILD });
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        contextDocument: JSON.stringify({
          contextVersion: '1',
          constraints: { allowedRecordTypes: ['org.example/something-else'] },
        }),
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'constraints',
      failureCode: 'E_VERIFIER_RECORD_TYPE_MISMATCH',
      signatureResult: 'valid_under_supplied_key',
      recordValidationResult: 'valid',
    },
  },
  {
    name: 'canonical internal error',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({
        verifierBuild: BUILD,
        verifyLocal: (async () => ({ valid: false, code: 'E_INTERNAL', reason: 'x' })) as never,
      });
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'internal_error',
      failureCode: 'E_VERIFIER_INTERNAL_ERROR',
      signatureResult: 'not_evaluated',
      recordValidationResult: 'not_evaluated',
    },
  },
  {
    name: 'unmapped canonical code',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({
        verifierBuild: BUILD,
        verifyLocal: (async () => ({
          valid: false,
          code: 'E_FROM_THE_FUTURE',
          reason: 'x',
        })) as never,
      });
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'internal_error',
      failureCode: 'E_VERIFIER_UNMAPPED_CANONICAL_CODE',
      signatureResult: 'not_evaluated',
      recordValidationResult: 'not_evaluated',
    },
  },
  {
    name: 'unexpected canonical-verifier throw',
    run: async () => {
      const f = await makeFixture();
      const v = await initializeLocalVerifier({
        verifierBuild: BUILD,
        verifyLocal: (() => {
          throw new Error('injected');
        }) as never,
      });
      return v.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    },
    expect: {
      outcome: 'rejected',
      failureStage: 'internal_error',
      failureCode: 'E_VERIFIER_INTERNAL_ERROR',
      signatureResult: 'not_evaluated',
      recordValidationResult: 'not_evaluated',
    },
  },
];

describe('every report-bearing branch validates against the schema', () => {
  it.each(rows.map((r) => [r.name, r] as const))('%s', async (_name, row) => {
    const result = await row.run();
    const report = (result as { report?: Record<string, unknown> }).report;

    expect(report, `${row.name}: expected a report`).toBeDefined();
    const r = report as Record<string, unknown>;

    // 1 + 2: the schema is the authority, and the hash must be self-consistent.
    assertReportValid(r, row.name);
    assertReportHash(r, row.name);

    // Stage/result tuple exactly as the machine contract permits.
    expect({
      outcome: r.outcome,
      failureStage: r.failureStage,
      signatureResult: r.signatureResult,
      recordValidationResult: r.recordValidationResult,
    }).toEqual({
      outcome: row.expect.outcome,
      failureStage: row.expect.failureStage,
      signatureResult: row.expect.signatureResult,
      recordValidationResult: row.expect.recordValidationResult,
    });
    if (row.expect.failureCode) expect(r.failureCode).toBe(row.expect.failureCode);

    // 3: success-only fields must not appear on a failure.
    if (row.expect.outcome === 'rejected') {
      expect(r.recordType, `${row.name}: recordType leaked onto a rejected report`).toBeUndefined();
      expect(
        r.reportedIssuer,
        `${row.name}: reportedIssuer leaked onto a rejected report`
      ).toBeUndefined();
    } else {
      expect(r.recordType).toBeDefined();
      expect(r.reportedIssuer).toBeDefined();
    }

    // 4: no claims on any failure result variant.
    if (!result.ok) {
      expect(result, `${row.name}: claims present on a failure`).not.toHaveProperty('claims');
    }
  });

  it('covers every report-bearing branch named in the contract', () => {
    expect(rows.map((r) => r.name).sort()).toEqual(
      [
        'accepted',
        'canonical internal error',
        'issuer mismatch',
        'kid mismatch',
        'post-signature record-validation failure',
        'pre-signature record-validation failure',
        'record-type mismatch',
        'signature failure',
        'trusted-key mismatch',
        'unexpected canonical-verifier throw',
        'unmapped canonical code',
      ].sort()
    );
  });
});

describe('branches that are defined to produce NO report', () => {
  const noReport: Array<[string, () => Promise<BrowserVerificationResult>]> = [
    [
      'input failure (empty record)',
      async () => {
        const f = await makeFixture();
        const v = await initializeLocalVerifier({ verifierBuild: BUILD });
        return v.verify({
          record: '',
          keyDocument: f.keyDocument,
          evaluationTimeUnixSeconds: f.evaluationTime,
        });
      },
    ],
    [
      'key-selection failure (no key matches the record kid)',
      async () => {
        const f = await makeFixture('k1');
        const a = await makeUnrelatedKeyDocument('x1');
        const b = await makeUnrelatedKeyDocument('x2');
        const jwks = JSON.stringify({
          keys: [JSON.parse(a), JSON.parse(b)],
        });
        const v = await initializeLocalVerifier({ verifierBuild: BUILD });
        return v.verify({
          record: f.record,
          keyDocument: jwks,
          evaluationTimeUnixSeconds: f.evaluationTime,
        });
      },
    ],
  ];

  it.each(noReport)('%s produces no report and no claims', async (_name, run) => {
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('report');
    expect(result).not.toHaveProperty('claims');
  });
});

describe('the routing/canonical divergence branch', () => {
  it('is covered by routing-kid-consistency.test.ts, which schema-validates its report', () => {
    // Kept as an explicit pointer so the matrix above is not read as the complete branch list.
    expect(true).toBe(true);
  });
});
