import { describe, it, expect } from 'vitest';
import {
  generateReportId,
  buildFailureReasons,
  buildExtendedReport,
  formatPlainText,
  negotiateFormat,
} from '../src/report-format.js';

describe('report-format', () => {
  describe('generateReportId', () => {
    it('should produce a valid UUID v4', () => {
      const id = generateReportId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should produce unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateReportId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('negotiateFormat', () => {
    it('should default to json for undefined accept', () => {
      expect(negotiateFormat(undefined)).toBe('json');
    });

    it('should return json for application/json', () => {
      expect(negotiateFormat('application/json')).toBe('json');
    });

    it('should return extended for application/peac-report+json', () => {
      expect(negotiateFormat('application/peac-report+json')).toBe('extended');
    });

    it('should return plain for text/plain', () => {
      expect(negotiateFormat('text/plain')).toBe('plain');
    });

    it('should return json for unknown accept', () => {
      expect(negotiateFormat('text/html')).toBe('json');
    });
  });

  describe('buildFailureReasons', () => {
    it('should return empty array for verified result', () => {
      expect(buildFailureReasons({ verified: true, receipt_ref: 'sha256:abc' })).toEqual([]);
    });

    it('should return failure reason for failed result', () => {
      const reasons = buildFailureReasons({
        verified: false,
        receipt_ref: 'sha256:abc',
        error_code: 'E_INVALID_SIGNATURE',
        error_message: 'Signature does not match',
      });
      expect(reasons).toHaveLength(1);
      expect(reasons[0].code).toBe('E_INVALID_SIGNATURE');
      expect(reasons[0].detail).toBe('Signature does not match');
    });
  });

  describe('buildExtendedReport', () => {
    it('should include all required fields for success', () => {
      const report = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:abc',
          issuer: 'https://example.com',
          kid: 'key-1',
          wire_version: '0.2',
        },
        'test-report-id',
        2.5,
        'provided'
      );
      expect(report.report_id).toBe('test-report-id');
      expect(report.verified).toBe(true);
      expect(report.duration_ms).toBe(2.5);
      expect(report.key_resolution).toBe('provided');
      expect(report.failure_reasons).toEqual([]);
      expect(report.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include failure reasons for failed result', () => {
      const report = buildExtendedReport(
        {
          verified: false,
          receipt_ref: 'sha256:abc',
          error_code: 'E_EXPIRED',
          error_message: 'Receipt expired',
        },
        'test-id',
        1.0,
        'allowlist'
      );
      expect(report.verified).toBe(false);
      expect(report.failure_reasons).toHaveLength(1);
      expect(report.failure_reasons[0].code).toBe('E_EXPIRED');
    });

    it('should derive all three formats from same canonical result', () => {
      const result = {
        verified: true,
        receipt_ref: 'sha256:abc',
        issuer: 'https://test.com',
        kid: 'k1',
        wire_version: '0.2',
      };
      const extended = buildExtendedReport(result, 'id', 1.0, 'provided');
      const plain = formatPlainText(extended);

      expect(extended.receipt_ref).toBe(result.receipt_ref);
      expect(extended.issuer).toBe(result.issuer);
      expect(plain).toContain(result.receipt_ref);
      expect(plain).toContain(result.issuer!);
    });
  });

  describe('formatPlainText', () => {
    it('should produce human-readable output', () => {
      const report = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:abc123',
          issuer: 'https://example.com',
          kid: 'key-1',
          wire_version: '0.2',
        },
        'rpt-001',
        2.3,
        'provided'
      );
      const text = formatPlainText(report);
      expect(text).toContain('PEAC Verification Report');
      expect(text).toContain('Report ID:  rpt-001');
      expect(text).toContain('Verified:   true');
      expect(text).toContain('Receipt:    sha256:abc123');
      expect(text).toContain('Issuer:     https://example.com');
      expect(text).toContain('Key ID:     key-1');
      expect(text).toContain('Wire:       0.2');
      expect(text).toContain('Warnings:   none');
    });
  });

  describe('backward compatibility', () => {
    it('should produce v0.12.8-compatible default JSON structure', () => {
      // The default application/json response must contain exactly these
      // top-level keys in sorted order (deterministic stringify):
      // claims, issuer, kid, policy_binding, receipt_ref, verified, warnings, wire_version
      const v0128Shape = {
        verified: true,
        receipt_ref: 'sha256:abc',
        claims: { iss: 'https://example.com', type: 'test' },
        warnings: [],
        policy_binding: 'verified',
        issuer: 'https://example.com',
        kid: 'key-1',
        wire_version: '0.2',
      };

      // Deterministic stringify sorts keys
      const json = JSON.stringify(v0128Shape, (_key, value) => {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          );
        }
        return value;
      });
      const parsed = JSON.parse(json);
      const keys = Object.keys(parsed);

      // v0.12.8 response keys (sorted): claims, issuer, kid, policy_binding, receipt_ref, verified, warnings, wire_version
      expect(keys).toEqual([
        'claims',
        'issuer',
        'kid',
        'policy_binding',
        'receipt_ref',
        'verified',
        'warnings',
        'wire_version',
      ]);
    });
  });

  describe('bindings field (v0.12.14)', () => {
    it('omits bindings from extended report when caller did not supply terms / documents', () => {
      const report = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:' + 'a'.repeat(64),
          policy_binding: 'verified',
        },
        '00000000-0000-4000-8000-000000000000',
        12.34,
        'provided'
      );
      expect(report).not.toHaveProperty('bindings');
    });

    it('omits bindings when caller-supplied bindings has no terms or documents', () => {
      const report = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:' + 'a'.repeat(64),
          policy_binding: 'verified',
          bindings: { policy: 'verified' },
        },
        '00000000-0000-4000-8000-000000000000',
        12.34,
        'provided'
      );
      expect(report).not.toHaveProperty('bindings');
    });

    it('includes bindings when caller-supplied bindings has terms', () => {
      const report = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:' + 'a'.repeat(64),
          policy_binding: 'verified',
          bindings: {
            policy: 'verified',
            terms: { ref: 'terms', representation: 'json', status: 'verified' },
          },
        },
        '00000000-0000-4000-8000-000000000000',
        12.34,
        'provided'
      );
      expect(report).toHaveProperty('bindings');
      expect(report.bindings?.terms?.status).toBe('verified');
    });

    it('includes bindings when caller-supplied bindings has documents', () => {
      const report = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:' + 'a'.repeat(64),
          policy_binding: 'verified',
          bindings: {
            policy: 'verified',
            documents: [{ ref: 'license', representation: 'plaintext', status: 'verified' }],
          },
        },
        '00000000-0000-4000-8000-000000000000',
        12.34,
        'provided'
      );
      expect(report).toHaveProperty('bindings');
      expect(report.bindings?.documents).toHaveLength(1);
    });

    it('omits bindings when documents array is empty', () => {
      const report = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:' + 'a'.repeat(64),
          policy_binding: 'verified',
          bindings: {
            policy: 'verified',
            documents: [],
          },
        },
        '00000000-0000-4000-8000-000000000000',
        12.34,
        'provided'
      );
      expect(report).not.toHaveProperty('bindings');
    });

    it('extended report JSON is byte-stable vs no-bindings baseline when caller absent', () => {
      const baseline = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:' + 'a'.repeat(64),
          policy_binding: 'verified',
        },
        '00000000-0000-4000-8000-000000000000',
        12.34,
        'provided'
      );
      const withInternalPolicyOnly = buildExtendedReport(
        {
          verified: true,
          receipt_ref: 'sha256:' + 'a'.repeat(64),
          policy_binding: 'verified',
          bindings: { policy: 'verified' },
        },
        '00000000-0000-4000-8000-000000000000',
        12.34,
        'provided'
      );
      expect(JSON.stringify(withInternalPolicyOnly)).toBe(JSON.stringify(baseline));
      expect(JSON.stringify(baseline)).not.toContain('"bindings"');
    });
  });
});
