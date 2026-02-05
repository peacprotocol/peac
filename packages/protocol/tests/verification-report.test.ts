/**
 * Verification Report Tests
 *
 * Tests for verification report builder, especially deterministic mode
 */

import { describe, it, expect } from 'vitest';
import {
  createReportBuilder,
  computeReceiptDigest,
  buildFailureReport,
  buildSuccessReport,
} from '../src/verification-report.js';
import type { VerifierPolicy } from '../src/verifier-types.js';

describe('VerificationReportBuilder', () => {
  const testPolicy: VerifierPolicy = {
    mode: 'online',
    trust: { issuers: ['https://example.com'] },
  };

  describe('Deterministic Mode Regression Tests', () => {
    /**
     * P0-6: Deterministic report regression test
     *
     * Verifies that buildDeterministic():
     * 1. Excludes meta field
     * 2. Excludes non-deterministic artifacts (issuer_jwks_digest)
     * 3. Produces identical output for identical inputs
     */

    it('should exclude meta field in deterministic mode', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';
      const digestHex = await computeReceiptDigest(receipt);

      const builder = createReportBuilder(testPolicy)
        .setInputWithDigest(digestHex)
        .pass('jws.parse')
        .pass('limits.receipt_bytes')
        .pass('jws.protected_header')
        .pass('claims.schema_unverified')
        .pass('issuer.trust_policy')
        .pass('issuer.discovery')
        .pass('key.resolve')
        .pass('jws.signature')
        .pass('claims.time_window')
        .pass('extensions.limits')
        .success('https://example.com', 'key-1')
        .setMeta({
          generated_at: '2026-02-05T10:00:00Z',
          verifier: { name: 'test', version: '1.0.0' },
        });

      const fullReport = builder.build();
      const deterministicReport = builder.buildDeterministic();

      // Full report has meta
      expect(fullReport.meta).toBeDefined();
      expect(fullReport.meta?.generated_at).toBe('2026-02-05T10:00:00Z');

      // Deterministic report excludes meta
      expect('meta' in deterministicReport).toBe(false);
    });

    it('should exclude issuer_jwks_digest artifact in deterministic mode', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';
      const digestHex = await computeReceiptDigest(receipt);

      const builder = createReportBuilder(testPolicy)
        .setInputWithDigest(digestHex)
        .pass('jws.parse')
        .pass('limits.receipt_bytes')
        .pass('jws.protected_header')
        .pass('claims.schema_unverified')
        .pass('issuer.trust_policy')
        .pass('issuer.discovery')
        .pass('key.resolve')
        .pass('jws.signature')
        .pass('claims.time_window')
        .pass('extensions.limits')
        .success('https://example.com', 'key-1')
        .addArtifact('receipt_digest', { alg: 'sha256', hex: digestHex })
        .addArtifact('issuer_jwks_digest', { alg: 'sha256', hex: 'abc123' });

      const fullReport = builder.build();
      const deterministicReport = builder.buildDeterministic();

      // Full report has both artifacts
      expect(fullReport.artifacts?.receipt_digest).toBeDefined();
      expect(fullReport.artifacts?.issuer_jwks_digest).toBeDefined();

      // Deterministic report excludes non-deterministic artifact
      expect(deterministicReport.artifacts?.receipt_digest).toBeDefined();
      expect(deterministicReport.artifacts?.issuer_jwks_digest).toBeUndefined();
    });

    it('should remove artifacts object entirely if only non-deterministic artifacts present', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';
      const digestHex = await computeReceiptDigest(receipt);

      const builder = createReportBuilder(testPolicy)
        .setInputWithDigest(digestHex)
        .pass('jws.parse')
        .pass('limits.receipt_bytes')
        .pass('jws.protected_header')
        .pass('claims.schema_unverified')
        .pass('issuer.trust_policy')
        .pass('issuer.discovery')
        .pass('key.resolve')
        .pass('jws.signature')
        .pass('claims.time_window')
        .pass('extensions.limits')
        .success('https://example.com', 'key-1')
        .addArtifact('issuer_jwks_digest', { alg: 'sha256', hex: 'abc123' });

      const fullReport = builder.build();
      const deterministicReport = builder.buildDeterministic();

      // Full report has artifacts
      expect(fullReport.artifacts).toBeDefined();
      expect(fullReport.artifacts?.issuer_jwks_digest).toBeDefined();

      // Deterministic report has no artifacts (removed entirely)
      expect(deterministicReport.artifacts).toBeUndefined();
    });

    it('should produce identical output for identical inputs (idempotency)', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';
      const digestHex = await computeReceiptDigest(receipt);

      const createBuilder = () =>
        createReportBuilder(testPolicy)
          .setInputWithDigest(digestHex)
          .pass('jws.parse')
          .pass('limits.receipt_bytes')
          .pass('jws.protected_header')
          .pass('claims.schema_unverified')
          .pass('issuer.trust_policy')
          .pass('issuer.discovery')
          .pass('key.resolve')
          .pass('jws.signature')
          .pass('claims.time_window')
          .pass('extensions.limits')
          .success('https://example.com', 'key-1')
          .addArtifact('receipt_digest', { alg: 'sha256', hex: digestHex });

      // Build deterministic reports at different times
      const report1 = createBuilder()
        .setMeta({ generated_at: '2026-02-05T10:00:00Z' })
        .buildDeterministic();

      const report2 = createBuilder()
        .setMeta({ generated_at: '2026-02-05T11:00:00Z' }) // Different time
        .buildDeterministic();

      // Reports should be identical (meta excluded, timestamps don't matter)
      // Use toEqual for deep structural equality, not JSON.stringify
      expect(report1).toEqual(report2);
    });

    it('should preserve deterministic artifacts', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';
      const digestHex = await computeReceiptDigest(receipt);

      const builder = createReportBuilder(testPolicy)
        .setInputWithDigest(digestHex)
        .pass('jws.parse')
        .pass('limits.receipt_bytes')
        .pass('jws.protected_header')
        .pass('claims.schema_unverified')
        .pass('issuer.trust_policy')
        .pass('issuer.discovery')
        .pass('key.resolve')
        .pass('jws.signature')
        .pass('claims.time_window')
        .pass('extensions.limits')
        .success('https://example.com', 'key-1')
        .addArtifact('receipt_digest', { alg: 'sha256', hex: digestHex })
        .addArtifact('issuer_discovery_url', 'https://example.com/.well-known/peac.json');

      const deterministicReport = builder.buildDeterministic();

      // Deterministic artifacts are preserved
      expect(deterministicReport.artifacts?.receipt_digest).toBeDefined();
      expect(deterministicReport.artifacts?.issuer_discovery_url).toBe(
        'https://example.com/.well-known/peac.json'
      );
    });
  });

  describe('Shape Stability', () => {
    it('should always produce all check IDs in order', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';
      const digestHex = await computeReceiptDigest(receipt);

      const builder = createReportBuilder(testPolicy)
        .setInputWithDigest(digestHex)
        .fail('jws.parse', 'E_VERIFY_MALFORMED_RECEIPT')
        .failure('malformed_receipt');

      const report = builder.build();

      // All checks present (11 checks total)
      expect(report.checks.length).toBe(11);

      // Check IDs in expected order
      const checkIds = report.checks.map((c) => c.id);
      expect(checkIds).toEqual([
        'jws.parse',
        'limits.receipt_bytes',
        'jws.protected_header',
        'claims.schema_unverified',
        'issuer.trust_policy',
        'issuer.discovery',
        'key.resolve',
        'jws.signature',
        'claims.time_window',
        'extensions.limits',
        'transport.profile_binding',
      ]);

      // First check failed, rest skipped
      expect(report.checks[0].status).toBe('fail');
      for (let i = 1; i < report.checks.length; i++) {
        expect(report.checks[i].status).toBe('skip');
      }
    });
  });

  describe('Convenience Functions', () => {
    it('buildFailureReport should create proper failure report', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';

      const report = await buildFailureReport(
        testPolicy,
        receipt,
        'signature_invalid',
        'jws.signature',
        'E_VERIFY_SIGNATURE_INVALID',
        { reason: 'Ed25519 verification failed' }
      );

      expect(report.result.valid).toBe(false);
      expect(report.result.reason).toBe('signature_invalid');

      // Checks before jws.signature passed
      expect(report.checks.find((c) => c.id === 'jws.parse')?.status).toBe('pass');
      expect(report.checks.find((c) => c.id === 'jws.protected_header')?.status).toBe('pass');
      expect(report.checks.find((c) => c.id === 'key.resolve')?.status).toBe('pass');

      // Signature check failed
      expect(report.checks.find((c) => c.id === 'jws.signature')?.status).toBe('fail');
    });

    it('buildSuccessReport should create proper success report', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';

      const report = await buildSuccessReport(testPolicy, receipt, 'https://example.com', 'key-1');

      expect(report.result.valid).toBe(true);
      expect(report.result.reason).toBe('ok');
      expect(report.result.issuer).toBe('https://example.com');
      expect(report.result.kid).toBe('key-1');

      // All checks passed (except optional transport.profile_binding)
      for (const check of report.checks) {
        if (check.id === 'transport.profile_binding') {
          continue; // Optional, may be skip
        }
        expect(check.status).toBe('pass');
      }
    });
  });
});
