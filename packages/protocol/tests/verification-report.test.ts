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
import { CHECK_IDS } from '../src/verifier-types.js';
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

      // All checks present (12 checks total: 11 original + policy.binding DD-49)
      expect(report.checks.length).toBe(12);

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
        'policy.binding',
      ]);

      // First check failed, rest skipped
      expect(report.checks[0].status).toBe('fail');
      for (let i = 1; i < report.checks.length; i++) {
        expect(report.checks[i].status).toBe('skip');
      }
    });
  });

  describe('Append-Only CHECK_IDS Contract', () => {
    /**
     * Prefix-pinning test for the append-only CHECK_IDS contract.
     *
     * This test snapshots the first N check IDs known at a given version.
     * If someone reorders, renames, or removes an entry, this test breaks.
     * New entries MUST only be appended to the end.
     */

    // Frozen prefix: the 10 original check IDs (pre-DD-49, v0.10.9)
    const V0_10_9_PREFIX = [
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
    ] as const;

    // Frozen prefix: check IDs added in v0.10.10 (DD-49)
    const V0_10_10_SUFFIX = ['transport.profile_binding', 'policy.binding'] as const;

    it('should preserve v0.10.9 prefix (first 10 check IDs are frozen)', () => {
      expect(CHECK_IDS.slice(0, V0_10_9_PREFIX.length)).toEqual([...V0_10_9_PREFIX]);
    });

    it('should preserve v0.10.10 additions at correct indices', () => {
      const fullPrefix = [...V0_10_9_PREFIX, ...V0_10_10_SUFFIX];
      expect(CHECK_IDS.slice(0, fullPrefix.length)).toEqual(fullPrefix);
    });

    it('should never shrink (monotonically growing)', () => {
      // As of v0.10.10, there are 12 check IDs
      expect(CHECK_IDS.length).toBeGreaterThanOrEqual(12);
    });

    it('should have no duplicate check IDs', () => {
      const unique = new Set(CHECK_IDS);
      expect(unique.size).toBe(CHECK_IDS.length);
    });

    it('should match report builder output order exactly', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';
      const digestHex = await computeReceiptDigest(receipt);

      // Build a success report (all checks populated)
      const builder = createReportBuilder(testPolicy).setInputWithDigest(digestHex);

      for (const checkId of CHECK_IDS) {
        if (checkId === 'transport.profile_binding' || checkId === 'policy.binding') {
          continue; // Optional checks handled by build()
        }
        builder.pass(checkId);
      }
      builder.success('https://example.com', 'key-1');

      const report = builder.build();
      const reportCheckIds = report.checks.map((c) => c.id);

      // Report output order MUST match CHECK_IDS exactly
      expect(reportCheckIds).toEqual([...CHECK_IDS]);
    });
  });

  describe('Policy Binding (DD-49)', () => {
    it('should set policy_binding to unavailable on failure reports', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';

      const report = await buildFailureReport(
        testPolicy,
        receipt,
        'signature_invalid',
        'jws.signature',
        'E_VERIFY_SIGNATURE_INVALID',
        { reason: 'Ed25519 verification failed' }
      );

      // result.policy_binding MUST be present and 'unavailable' for Wire 0.1
      expect(report.result.policy_binding).toBe('unavailable');

      // policy.binding check MUST exist and be 'skip'
      const policyCheck = report.checks.find((c) => c.id === 'policy.binding');
      expect(policyCheck).toBeDefined();
      expect(policyCheck?.status).toBe('skip');
    });

    it('should set policy_binding to unavailable on success reports', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';

      const report = await buildSuccessReport(testPolicy, receipt, 'https://example.com', 'key-1');

      // result.policy_binding MUST be present and 'unavailable' for Wire 0.1
      expect(report.result.policy_binding).toBe('unavailable');

      // policy.binding check MUST exist as 'skip' with wire_01 reason
      const policyCheck = report.checks.find((c) => c.id === 'policy.binding');
      expect(policyCheck).toBeDefined();
      expect(policyCheck?.status).toBe('skip');
      expect(policyCheck?.detail).toEqual({ reason: 'wire_01_no_policy_digest' });
    });

    it('should include policy.binding check even on early failure (jws.parse)', async () => {
      const receipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';

      const report = await buildFailureReport(
        testPolicy,
        receipt,
        'malformed_receipt',
        'jws.parse',
        'E_VERIFY_MALFORMED_RECEIPT'
      );

      // All 12 checks must be present even on earliest failure
      expect(report.checks.length).toBe(CHECK_IDS.length);

      // policy.binding is the last check, should be skip (short-circuited)
      const lastCheck = report.checks[report.checks.length - 1];
      expect(lastCheck.id).toBe('policy.binding');
      expect(lastCheck.status).toBe('skip');

      // result.policy_binding is unavailable
      expect(report.result.policy_binding).toBe('unavailable');
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

      // All checks passed (except optional transport.profile_binding and policy.binding)
      for (const check of report.checks) {
        if (check.id === 'transport.profile_binding' || check.id === 'policy.binding') {
          continue; // Optional, may be skip
        }
        expect(check.status).toBe('pass');
      }
    });
  });
});
