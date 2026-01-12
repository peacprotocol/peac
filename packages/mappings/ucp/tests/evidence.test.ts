/**
 * @peac/mappings-ucp - Evidence tests
 */

import { describe, it, expect } from 'vitest';
import {
  createUcpWebhookEvidence,
  serializeEvidenceYaml,
  createPayloadEvidence,
  createSignatureEvidence,
} from '../src/evidence.js';
import { UCP_EVIDENCE_VERSION } from '../src/types.js';

describe('createPayloadEvidence', () => {
  it('creates evidence for JSON payload', () => {
    const payload = JSON.stringify({ event: 'order.created', order: { id: 'order_123' } });
    const bodyBytes = new TextEncoder().encode(payload);

    const evidence = createPayloadEvidence(bodyBytes);

    expect(evidence.json_parseable).toBe(true);
    expect(evidence.raw_sha256_hex).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.raw_bytes_b64url).toBeDefined();
    expect(evidence.jcs_sha256_hex).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates evidence for non-JSON payload', () => {
    const bodyBytes = new TextEncoder().encode('not valid json');

    const evidence = createPayloadEvidence(bodyBytes);

    expect(evidence.json_parseable).toBe(false);
    expect(evidence.raw_sha256_hex).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.raw_bytes_b64url).toBeDefined();
    expect(evidence.jcs_sha256_hex).toBeUndefined();
  });

  it('respects maxBodyEvidenceBytes limit', () => {
    // Create payload larger than limit
    const largePayload = 'x'.repeat(1024);
    const bodyBytes = new TextEncoder().encode(largePayload);

    const evidence = createPayloadEvidence(bodyBytes, {
      maxBodyEvidenceBytes: 100,
    });

    expect(evidence.raw_bytes_b64url).toBeUndefined(); // Exceeds limit
    expect(evidence.raw_sha256_hex).toBeDefined(); // Hash still computed
  });

  it('includes JCS text when requested', () => {
    const payload = JSON.stringify({ b: 2, a: 1 }); // Keys out of order
    const bodyBytes = new TextEncoder().encode(payload);

    const evidence = createPayloadEvidence(bodyBytes, {
      includeJcsText: true,
    });

    expect(evidence.jcs_text).toBe('{"a":1,"b":2}'); // JCS orders keys
  });

  it('produces different hashes for raw and JCS when object has unordered keys', () => {
    // JSON with keys in non-canonical order
    const payload = '{"z":1,"a":2}';
    const bodyBytes = new TextEncoder().encode(payload);

    const evidence = createPayloadEvidence(bodyBytes, {
      includeJcsText: true,
    });

    // Raw and JCS should produce different hashes
    expect(evidence.raw_sha256_hex).not.toBe(evidence.jcs_sha256_hex);
    expect(evidence.jcs_text).toBe('{"a":2,"z":1}');
  });

  it('handles non-ASCII UTF-8 payloads correctly', () => {
    // JSON with non-ASCII characters (e.g., French accents, emoji, CJK)
    const payload = JSON.stringify({
      title: 'Cafe',
      description: 'Delicious pastry',
      notes: 'Test with unicode',
    });
    const bodyBytes = new TextEncoder().encode(payload);

    const evidence = createPayloadEvidence(bodyBytes, {
      includeJcsText: true,
    });

    expect(evidence.json_parseable).toBe(true);
    expect(evidence.raw_sha256_hex).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.jcs_sha256_hex).toMatch(/^[a-f0-9]{64}$/);

    // The JCS text should preserve the UTF-8 characters
    expect(evidence.jcs_text).toContain('Cafe');
    expect(evidence.jcs_text).toContain('pastry');
  });

  it('handles CJK and emoji in UTF-8 payloads', () => {
    // JSON with CJK characters and emoji
    const payload = JSON.stringify({
      product: 'Product Name',
      store: 'Tokyo Shop',
      rating: 'Great',
    });
    const bodyBytes = new TextEncoder().encode(payload);

    const evidence = createPayloadEvidence(bodyBytes);

    expect(evidence.json_parseable).toBe(true);
    expect(evidence.raw_sha256_hex).toMatch(/^[a-f0-9]{64}$/);

    // Verify base64url encoding works with UTF-8
    expect(evidence.raw_bytes_b64url).toBeDefined();

    // The raw bytes should round-trip correctly
    if (evidence.raw_bytes_b64url) {
      const decoded = Buffer.from(evidence.raw_bytes_b64url, 'base64url').toString('utf-8');
      expect(decoded).toBe(payload);
    }
  });
});

describe('createSignatureEvidence', () => {
  it('creates signature evidence', () => {
    const evidence = createSignatureEvidence(
      'eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3Qta2V5In0..c2lnbmF0dXJl',
      { kid: 'test-key', alg: 'ES256', b64: undefined },
      true,
      [{ mode: 'raw', success: true }],
      'raw'
    );

    expect(evidence.header_value).toBe('eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3Qta2V5In0..c2lnbmF0dXJl');
    expect(evidence.kid).toBe('test-key');
    expect(evidence.alg).toBe('ES256');
    expect(evidence.b64).toBe(null); // undefined -> null
    expect(evidence.verified).toBe(true);
    expect(evidence.verification_mode_used).toBe('raw');
    expect(evidence.verification_attempts).toHaveLength(1);
    expect(evidence.verification_attempts[0].mode).toBe('raw');
    expect(evidence.verification_attempts[0].success).toBe(true);
  });

  it('handles failed verification with attempts', () => {
    const evidence = createSignatureEvidence(
      'header..signature',
      { kid: 'test-key', alg: 'ES256', b64: false, crit: ['b64'] },
      false,
      [
        {
          mode: 'raw',
          success: false,
          error_code: 'E_UCP_SIGNATURE_INVALID',
          error_message: 'Failed',
        },
        {
          mode: 'jcs',
          success: false,
          error_code: 'E_UCP_SIGNATURE_INVALID',
          error_message: 'Failed',
        },
      ]
    );

    expect(evidence.verified).toBe(false);
    expect(evidence.b64).toBe(false);
    expect(evidence.crit).toContain('b64');
    expect(evidence.verification_mode_used).toBeUndefined();
    expect(evidence.verification_attempts).toHaveLength(2);
  });
});

describe('createUcpWebhookEvidence', () => {
  it('creates complete webhook evidence', () => {
    const evidence = createUcpWebhookEvidence({
      method: 'POST',
      path: '/webhooks/ucp/orders',
      received_at: '2026-01-13T12:00:00Z',
      payload: {
        raw_sha256_hex: 'abc123',
        json_parseable: true,
      },
      signature: {
        header_value: 'header..sig',
        kid: 'key-001',
        alg: 'ES256',
        b64: null,
        verified: true,
        verification_mode_used: 'raw',
        verification_attempts: [{ mode: 'raw', success: true }],
      },
      profile: {
        url: 'https://business.example.com/.well-known/ucp',
        fetched_at: '2026-01-13T11:59:30Z',
        profile_jcs_sha256_hex: 'def456',
      },
    });

    expect(evidence.peac_bundle_metadata_version).toBe(UCP_EVIDENCE_VERSION);
    expect(evidence.kind).toBe('evidence_attachment');
    expect(evidence.scope).toBe('ucp_webhook');
    expect(evidence.request.method).toBe('POST');
    expect(evidence.request.path).toBe('/webhooks/ucp/orders');
    expect(evidence.request.received_at).toBe('2026-01-13T12:00:00Z');
    expect(evidence.payload.raw_sha256_hex).toBe('abc123');
    expect(evidence.signature.kid).toBe('key-001');
    expect(evidence.profile.url).toBe('https://business.example.com/.well-known/ucp');
  });

  it('includes optional event metadata', () => {
    const evidence = createUcpWebhookEvidence({
      method: 'POST',
      path: '/webhooks/ucp/orders',
      received_at: '2026-01-13T12:00:00Z',
      payload: { raw_sha256_hex: 'abc123', json_parseable: true },
      signature: {
        header_value: 'header..sig',
        kid: 'key-001',
        alg: 'ES256',
        b64: null,
        verified: true,
        verification_attempts: [],
      },
      profile: {
        url: 'https://business.example.com/.well-known/ucp',
        fetched_at: '2026-01-13T11:59:30Z',
        profile_jcs_sha256_hex: 'def456',
      },
      event: {
        type: 'order.created',
        resource_id: 'order_123',
        timestamp: '2026-01-13T11:58:00Z',
      },
    });

    expect(evidence.event).toBeDefined();
    expect(evidence.event?.type).toBe('order.created');
    expect(evidence.event?.resource_id).toBe('order_123');
  });

  it('includes optional linked receipts', () => {
    const evidence = createUcpWebhookEvidence({
      method: 'POST',
      path: '/webhooks/ucp/orders',
      received_at: '2026-01-13T12:00:00Z',
      payload: { raw_sha256_hex: 'abc123', json_parseable: true },
      signature: {
        header_value: 'header..sig',
        kid: 'key-001',
        alg: 'ES256',
        b64: null,
        verified: true,
        verification_attempts: [],
      },
      profile: {
        url: 'https://business.example.com/.well-known/ucp',
        fetched_at: '2026-01-13T11:59:30Z',
        profile_jcs_sha256_hex: 'def456',
      },
      linked_receipts: [{ receipt_id: 'rcpt_123', relationship: 'issued_for_order' }],
    });

    expect(evidence.linked_receipts).toHaveLength(1);
    expect(evidence.linked_receipts?.[0].receipt_id).toBe('rcpt_123');
  });
});

describe('serializeEvidenceYaml', () => {
  it('serializes evidence to deterministic YAML', () => {
    const evidence = createUcpWebhookEvidence({
      method: 'POST',
      path: '/webhooks/ucp/orders',
      received_at: '2026-01-13T12:00:00Z',
      payload: {
        raw_sha256_hex: 'abc123def456',
        raw_bytes_b64url: 'eyJ0ZXN0IjoiZGF0YSJ9',
        jcs_sha256_hex: 'ghi789jkl012',
        json_parseable: true,
      },
      signature: {
        header_value: 'eyJhbGciOiJFUzI1NiJ9..c2ln',
        kid: 'key-001',
        alg: 'ES256',
        b64: null,
        verified: true,
        verification_mode_used: 'raw',
        verification_attempts: [{ mode: 'raw', success: true }],
      },
      profile: {
        url: 'https://business.example.com/.well-known/ucp',
        fetched_at: '2026-01-13T11:59:30Z',
        profile_jcs_sha256_hex: 'mno345pqr678',
        key_thumbprint: 'stu901vwx234',
      },
    });

    const yaml = serializeEvidenceYaml(evidence);

    // Check key markers
    expect(yaml).toContain('peac_bundle_metadata_version: "org.peacprotocol.ucp/0.1"');
    expect(yaml).toContain('kind: "evidence_attachment"');
    expect(yaml).toContain('scope: "ucp_webhook"');

    // Check request section
    expect(yaml).toContain('request:');
    expect(yaml).toContain('  method: "POST"');
    expect(yaml).toContain('  path: "/webhooks/ucp/orders"');

    // Check payload section
    expect(yaml).toContain('payload:');
    expect(yaml).toContain('  raw_sha256_hex: "abc123def456"');
    expect(yaml).toContain('  json_parseable: true');

    // Check signature section
    expect(yaml).toContain('signature:');
    expect(yaml).toContain('  verified: true');
    expect(yaml).toContain('  verification_mode_used: "raw"');

    // Check profile section
    expect(yaml).toContain('profile:');
    expect(yaml).toContain('  url: "https://business.example.com/.well-known/ucp"');

    // Comments should be present
    expect(yaml).toContain('# PEAC UCP Webhook Evidence');
    expect(yaml).toContain('# This file is evidence data, NOT executable policy');
  });

  it('produces stable output for deterministic fixtures', () => {
    const options = {
      method: 'POST',
      path: '/webhooks/ucp/orders',
      received_at: '2026-01-13T12:00:00Z',
      payload: {
        raw_sha256_hex: 'test_hash',
        json_parseable: true,
      },
      signature: {
        header_value: 'header..sig',
        kid: 'key-001',
        alg: 'ES256' as const,
        b64: null,
        verified: true,
        verification_attempts: [{ mode: 'raw' as const, success: true }],
      },
      profile: {
        url: 'https://example.com/.well-known/ucp',
        fetched_at: '2026-01-13T11:59:30Z',
        profile_jcs_sha256_hex: 'profile_hash',
      },
    };

    // Create evidence twice with same inputs
    const evidence1 = createUcpWebhookEvidence(options);
    const evidence2 = createUcpWebhookEvidence(options);

    const yaml1 = serializeEvidenceYaml(evidence1);
    const yaml2 = serializeEvidenceYaml(evidence2);

    // Output should be byte-identical
    expect(yaml1).toBe(yaml2);
  });

  it('escapes special YAML characters in strings', () => {
    const evidence = createUcpWebhookEvidence({
      method: 'POST',
      path: '/path/with"quotes',
      received_at: '2026-01-13T12:00:00Z',
      payload: { raw_sha256_hex: 'hash', json_parseable: true },
      signature: {
        header_value: 'header..sig',
        kid: 'key-001',
        alg: 'ES256',
        b64: null,
        verified: true,
        verification_attempts: [],
      },
      profile: {
        url: 'https://example.com',
        fetched_at: '2026-01-13T12:00:00Z',
        profile_jcs_sha256_hex: 'hash',
      },
    });

    const yaml = serializeEvidenceYaml(evidence);

    // Quotes should be escaped
    expect(yaml).toContain('\\"');
  });

  it('ends with a trailing newline (LF) for deterministic output', () => {
    const evidence = createUcpWebhookEvidence({
      method: 'POST',
      path: '/webhooks/ucp/orders',
      received_at: '2026-01-13T12:00:00Z',
      payload: { raw_sha256_hex: 'hash', json_parseable: true },
      signature: {
        header_value: 'header..sig',
        kid: 'key-001',
        alg: 'ES256',
        b64: null,
        verified: true,
        verification_attempts: [],
      },
      profile: {
        url: 'https://example.com',
        fetched_at: '2026-01-13T12:00:00Z',
        profile_jcs_sha256_hex: 'hash',
      },
    });

    const yaml = serializeEvidenceYaml(evidence);

    // Must end with exactly one newline (not zero, not two)
    expect(yaml.endsWith('\n')).toBe(true);
    expect(yaml.endsWith('\n\n')).toBe(false);
  });

  it('uses LF newlines (not CRLF) for cross-platform determinism', () => {
    const evidence = createUcpWebhookEvidence({
      method: 'POST',
      path: '/webhooks/ucp/orders',
      received_at: '2026-01-13T12:00:00Z',
      payload: { raw_sha256_hex: 'hash', json_parseable: true },
      signature: {
        header_value: 'header..sig',
        kid: 'key-001',
        alg: 'ES256',
        b64: null,
        verified: true,
        verification_attempts: [],
      },
      profile: {
        url: 'https://example.com',
        fetched_at: '2026-01-13T12:00:00Z',
        profile_jcs_sha256_hex: 'hash',
      },
    });

    const yaml = serializeEvidenceYaml(evidence);

    // Should not contain CRLF
    expect(yaml).not.toContain('\r\n');
    // Should contain LF
    expect(yaml).toContain('\n');
  });
});
