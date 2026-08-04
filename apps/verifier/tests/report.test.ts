/** Deterministic report core, validated against the authoritative JSON Schema. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalize } from '@peac/crypto';
import { initializeLocalVerifier } from '../src/verify.js';
import { makeFixture, tamperSignature } from './helpers/fixtures.js';

// The TRACKED app-local snapshot -- never a sibling working copy, which does not exist in a clean
// clone or on a CI runner. tests/schema-parity.test.ts guards it against drift.
const schema = JSON.parse(
  readFileSync(resolve(__dirname, '../contracts/v0164-verification-report.schema.json'), 'utf8')
);
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });

function assertValid(report: unknown): void {
  const ok = validate(report);
  if (!ok) throw new Error('report failed schema: ' + JSON.stringify(validate.errors, null, 2));
  expect(ok).toBe(true);
}

describe('every produced report validates', () => {
  it('accepted', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(r.ok).toBe(true);
    assertValid(r.report);
    expect(r.report?.recordType).toBeDefined();
    expect(r.report?.reportedIssuer).toBeDefined();
  });

  it('signature rejection', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: tamperSignature(f.record),
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    assertValid(r.report);
  });

  it('post-signature record-validation rejection', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: 1,
    });
    assertValid(r.report);
  });

  it('constraint rejection', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: JSON.stringify({
        contextVersion: '1',
        constraints: { expectedIssuer: 'https://other.example' },
      }),
    });
    assertValid(r.report);
  });
});

describe('determinism', () => {
  it('the same input twice produces byte-identical core bytes', async () => {
    const f = await makeFixture();
    const call = () =>
      verifier.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
    const a = await call();
    const b = await call();
    expect(canonicalize(a.report)).toBe(canonicalize(b.report));
    expect(a.report?.reportSha256).toBe(b.report?.reportSha256);
  });

  it('a reordered context yields the same report hash', async () => {
    const f = await makeFixture();
    const one = JSON.stringify({
      contextVersion: '1',
      constraints: { allowedKids: [f.kid, 'zzz'] },
    });
    const two = JSON.stringify({
      contextVersion: '1',
      constraints: { allowedKids: ['zzz', f.kid] },
    });
    const a = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: one,
    });
    const b = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: two,
    });
    expect(a.report?.reportSha256).toBe(b.report?.reportSha256);
  });

  it('does not leak the wall clock: advancing time does not change the core', async () => {
    const f = await makeFixture();
    const real = Date.now;
    const a = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    Date.now = () => real() + 86_400_000;
    try {
      const b = await verifier.verify({
        record: f.record,
        keyDocument: f.keyDocument,
        evaluationTimeUnixSeconds: f.evaluationTime,
      });
      expect(canonicalize(a.report)).toBe(canonicalize(b.report));
    } finally {
      Date.now = real;
    }
  });

  it('the hash covers the core without the hash field', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    const { reportSha256, ...rest } = r.report!;
    const { sha256Hex } = await import('@peac/crypto');
    expect(reportSha256).toBe(`sha256:${await sha256Hex(canonicalize(rest))}`);
  });

  it('carries no environment or wall-clock fields', async () => {
    const f = await makeFixture();
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    const keys = Object.keys(r.report!);
    for (const forbidden of [
      'generatedAt',
      'userAgent',
      'locale',
      'filename',
      'path',
      'manifestDigest',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
