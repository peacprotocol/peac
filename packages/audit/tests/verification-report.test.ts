/**
 * Tests for Verification Report (v0.9.30+)
 *
 * These tests use real Ed25519 cryptographic operations for proper signature verification.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { sign, generateKeypair } from '@peac/crypto';
import { createDisputeBundle } from '../src/dispute-bundle.js';
import { verifyBundle, serializeReport, formatReportText } from '../src/verification-report.js';
import type { JsonWebKey, JsonWebKeySet, VerificationReport } from '../src/dispute-bundle-types.js';

// Test keypairs - generated once and reused
let key1: { privateKey: Uint8Array; publicKey: Uint8Array };
let key2: { privateKey: Uint8Array; publicKey: Uint8Array };
let testJwks: JsonWebKeySet;

/** Convert Uint8Array to base64url */
function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** Create a real signed JWS receipt */
async function createSignedReceipt(
  jti: string,
  iat: number,
  privateKey: Uint8Array,
  kid: string
): Promise<string> {
  const payload = { jti, iat, iss: 'https://issuer.example.com' };
  return sign(payload, privateKey, kid);
}

/** Create a real signed JWS receipt with expiry */
async function createSignedReceiptWithExp(
  jti: string,
  iat: number,
  exp: number,
  privateKey: Uint8Array,
  kid: string
): Promise<string> {
  const payload = { jti, iat, exp, iss: 'https://issuer.example.com' };
  return sign(payload, privateKey, kid);
}

/** Create JWK from Ed25519 public key */
function publicKeyToJwk(publicKey: Uint8Array, kid: string): JsonWebKey {
  return {
    kty: 'OKP',
    kid,
    alg: 'EdDSA',
    crv: 'Ed25519',
    x: base64urlEncode(publicKey),
    use: 'sig',
  };
}

// Initialize test keys before all tests
beforeAll(async () => {
  key1 = await generateKeypair();
  key2 = await generateKeypair();

  testJwks = {
    keys: [publicKeyToJwk(key1.publicKey, 'key-001'), publicKeyToJwk(key2.publicKey, 'key-002')],
  };
});

describe('verifyBundle', () => {
  let validBundle: Buffer;

  beforeAll(async () => {
    const receipts = [
      await createSignedReceipt('receipt-001', 1704067200, key1.privateKey, 'key-001'),
      await createSignedReceipt('receipt-002', 1704153600, key2.privateKey, 'key-002'),
    ];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
    });

    if (!result.ok) {
      throw new Error('Failed to create test bundle');
    }
    validBundle = result.value;
  });

  it('should verify a valid bundle', async () => {
    const result = await verifyBundle(validBundle, { offline: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe('peac-verification-report/0.1');
      expect(result.value.summary.total_receipts).toBe(2);
      expect(result.value.summary.valid).toBe(2);
      expect(result.value.summary.invalid).toBe(0);
    }
  });

  it('should generate a deterministic report_hash', async () => {
    const result = await verifyBundle(validBundle, { offline: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.report_hash).toBeDefined();
      expect(result.value.report_hash.length).toBe(71); // sha256:<64 hex>
    }
  });

  it('should track key usage', async () => {
    const result = await verifyBundle(validBundle, { offline: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.keys_used.length).toBe(2);

      const key1 = result.value.keys_used.find((k) => k.kid === 'key-001');
      const key2 = result.value.keys_used.find((k) => k.kid === 'key-002');

      expect(key1).toBeDefined();
      expect(key1?.receipts_signed).toBe(1);
      expect(key2).toBeDefined();
      expect(key2?.receipts_signed).toBe(1);
    }
  });

  it('should generate auditor summary with recommendation', async () => {
    const result = await verifyBundle(validBundle, { offline: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.auditor_summary.headline).toBe('2/2 receipts valid');
      expect(result.value.auditor_summary.recommendation).toBe('valid');
      expect(result.value.auditor_summary.issues).toHaveLength(0);
    }
  });

  it('should include bundle content_hash', async () => {
    const result = await verifyBundle(validBundle, { offline: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bundle_content_hash).toBeDefined();
      expect(result.value.bundle_content_hash.length).toBe(71); // sha256:<64 hex>
    }
  });
});

describe('verification with missing keys', () => {
  it('should detect missing key in offline mode', async () => {
    // Generate a separate keypair for the unknown key
    const unknownKey = await generateKeypair();

    // Create receipt signed with unknown key
    const receipts = [
      await createSignedReceipt('receipt-001', 1704067200, unknownKey.privateKey, 'key-unknown'),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks, // Does not contain 'key-unknown'
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const verifyResult = await verifyBundle(createResult.value, { offline: true });

    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.value.summary.invalid).toBe(1);
      expect(verifyResult.value.receipts[0].errors).toContain('E_BUNDLE_KEY_MISSING');
      expect(verifyResult.value.auditor_summary.recommendation).toBe('invalid');
    }
  });
});

describe('verification with expired receipts', () => {
  it('should detect expired receipts', async () => {
    const now = new Date();
    const pastTime = Math.floor(now.getTime() / 1000) - 7200; // 2 hours ago
    const expiredTime = Math.floor(now.getTime() / 1000) - 3600; // 1 hour ago

    const receipts = [
      await createSignedReceiptWithExp(
        'receipt-expired',
        pastTime,
        expiredTime,
        key1.privateKey,
        'key-001'
      ),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const verifyResult = await verifyBundle(createResult.value, { offline: true, now });

    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.value.summary.invalid).toBe(1);
      expect(verifyResult.value.receipts[0].errors).toContain('E_RECEIPT_EXPIRED');
      expect(verifyResult.value.auditor_summary.recommendation).toBe('invalid');
    }
  });
});

describe('verification with mixed results', () => {
  it('should recommend needs_review for partial validity', async () => {
    const now = new Date();
    const recentTime = Math.floor(now.getTime() / 1000) - 60; // 1 minute ago
    const pastTime = Math.floor(now.getTime() / 1000) - 7200; // 2 hours ago
    const expiredTime = Math.floor(now.getTime() / 1000) - 3600; // 1 hour ago

    const receipts = [
      await createSignedReceipt('receipt-valid', recentTime, key1.privateKey, 'key-001'),
      await createSignedReceiptWithExp(
        'receipt-expired',
        pastTime,
        expiredTime,
        key1.privateKey,
        'key-001'
      ),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const verifyResult = await verifyBundle(createResult.value, { offline: true, now });

    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.value.summary.valid).toBe(1);
      expect(verifyResult.value.summary.invalid).toBe(1);
      expect(verifyResult.value.auditor_summary.recommendation).toBe('needs_review');
      expect(verifyResult.value.auditor_summary.issues.length).toBe(1);
    }
  });
});

describe('deterministic output', () => {
  it('should produce same report_hash for same inputs', async () => {
    const receipts = [
      await createSignedReceipt('receipt-001', 1704067200, key1.privateKey, 'key-001'),
      await createSignedReceipt('receipt-002', 1704153600, key2.privateKey, 'key-002'),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
      bundle_id: 'FIXED_BUNDLE_ID',
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    // Fixed timestamp for deterministic results
    const fixedNow = new Date('2024-01-15T00:00:00Z');

    const result1 = await verifyBundle(createResult.value, { offline: true, now: fixedNow });
    const result2 = await verifyBundle(createResult.value, { offline: true, now: fixedNow });

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      expect(result1.value.report_hash).toBe(result2.value.report_hash);
    }
  });

  it('should sort receipts by receipt_id', async () => {
    const receipts = [
      await createSignedReceipt('receipt-zzz', 1704067200, key1.privateKey, 'key-001'),
      await createSignedReceipt('receipt-aaa', 1704153600, key2.privateKey, 'key-002'),
      await createSignedReceipt('receipt-mmm', 1704240000, key1.privateKey, 'key-001'),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const verifyResult = await verifyBundle(createResult.value, { offline: true });

    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      const receiptIds = verifyResult.value.receipts.map((r) => r.receipt_id);
      expect(receiptIds).toEqual(['receipt-aaa', 'receipt-mmm', 'receipt-zzz']);
    }
  });

  it('should sort keys_used by kid', async () => {
    const receipts = [
      await createSignedReceipt('receipt-001', 1704067200, key2.privateKey, 'key-002'),
      await createSignedReceipt('receipt-002', 1704153600, key1.privateKey, 'key-001'),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const verifyResult = await verifyBundle(createResult.value, { offline: true });

    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      const kids = verifyResult.value.keys_used.map((k) => k.kid);
      expect(kids).toEqual(['key-001', 'key-002']);
    }
  });
});

describe('serializeReport', () => {
  let report: VerificationReport;

  beforeAll(async () => {
    const receipts = [
      await createSignedReceipt('receipt-001', 1704067200, key1.privateKey, 'key-001'),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
    });

    if (!createResult.ok) throw new Error('Failed to create bundle');

    const verifyResult = await verifyBundle(createResult.value, { offline: true });

    if (!verifyResult.ok) throw new Error('Failed to verify bundle');
    report = verifyResult.value;
  });

  it('should serialize to compact JSON', () => {
    const json = serializeReport(report);
    expect(json).not.toContain('\n');
    expect(JSON.parse(json)).toEqual(report);
  });

  it('should serialize to pretty JSON', () => {
    const json = serializeReport(report, true);
    expect(json).toContain('\n');
    expect(JSON.parse(json)).toEqual(report);
  });
});

describe('formatReportText', () => {
  it('should format valid bundle report', async () => {
    const receipts = [
      await createSignedReceipt('receipt-001', 1704067200, key1.privateKey, 'key-001'),
      await createSignedReceipt('receipt-002', 1704153600, key2.privateKey, 'key-002'),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const verifyResult = await verifyBundle(createResult.value, { offline: true });

    expect(verifyResult.ok).toBe(true);
    if (!verifyResult.ok) return;

    const text = formatReportText(verifyResult.value);

    expect(text).toContain('PEAC Dispute Bundle Verification Report');
    expect(text).toContain('Total receipts: 2');
    expect(text).toContain('Valid: 2');
    expect(text).toContain('Invalid: 0');
    expect(text).toContain('Recommendation: VALID');
    expect(text).toContain('receipt-001: VALID');
    expect(text).toContain('receipt-002: VALID');
  });

  it('should format report with issues', async () => {
    const now = new Date();
    const pastTime = Math.floor(now.getTime() / 1000) - 7200;
    const expiredTime = Math.floor(now.getTime() / 1000) - 3600;

    const receipts = [
      await createSignedReceiptWithExp(
        'receipt-expired',
        pastTime,
        expiredTime,
        key1.privateKey,
        'key-001'
      ),
    ];

    const createResult = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: testJwks,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const verifyResult = await verifyBundle(createResult.value, { offline: true, now });

    expect(verifyResult.ok).toBe(true);
    if (!verifyResult.ok) return;

    const text = formatReportText(verifyResult.value);

    expect(text).toContain('Issues');
    expect(text).toContain('E_RECEIPT_EXPIRED');
    expect(text).toContain('Recommendation: INVALID');
    expect(text).toContain('receipt-expired: INVALID');
  });
});
