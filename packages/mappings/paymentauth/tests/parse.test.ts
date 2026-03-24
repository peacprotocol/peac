/**
 * Tests for paymentauth header parsing and normalization.
 *
 * Covers: challenge parsing, credential parsing, receipt parsing,
 * normalization, redaction, parser limits, edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePaymentauthChallenges,
  parsePaymentauthCredential,
  parsePaymentauthReceipt,
  normalizeChallenge,
  normalizeCredential,
  normalizeReceipt,
  redactPaymentauthHeader,
  PaymentauthError,
  MAX_HEADER_BYTES,
  MAX_AUTH_PARAMS,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a JSON object as base64url without padding */
function toBase64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_REQUEST = { amount: '1000', currency: 'usd', recipient: 'acct_123' };
const SAMPLE_REQUEST_B64 = toBase64url(SAMPLE_REQUEST);

const SAMPLE_CHALLENGE_HEADER =
  `Payment id="x7Tg2pLqR9mKvNwY3hBcZa", realm="api.example.com", ` +
  `method="example", intent="charge", expires="2025-01-15T12:05:00Z", ` +
  `request="${SAMPLE_REQUEST_B64}"`;

const SAMPLE_CREDENTIAL_JSON = {
  challenge: {
    id: 'x7Tg2pLqR9mKvNwY3hBcZa',
    realm: 'api.example.com',
    method: 'example',
    intent: 'charge',
    request: SAMPLE_REQUEST_B64,
    expires: '2025-01-15T12:05:00Z',
  },
  payload: { proof: '0xabc123' },
};
const SAMPLE_CREDENTIAL_B64 = toBase64url(SAMPLE_CREDENTIAL_JSON);

const SAMPLE_RECEIPT_JSON = {
  status: 'success',
  method: 'example',
  timestamp: '2025-01-15T12:00:00Z',
  reference: 'inv_12345',
};
const SAMPLE_RECEIPT_B64 = toBase64url(SAMPLE_RECEIPT_JSON);

// ---------------------------------------------------------------------------
// redactPaymentauthHeader
// ---------------------------------------------------------------------------

describe('redactPaymentauthHeader', () => {
  it('should preserve scheme and id, redact rest', () => {
    const result = redactPaymentauthHeader(SAMPLE_CHALLENGE_HEADER);
    expect(result).toContain('Payment');
    expect(result).toContain('x7Tg2pLqR9mKvNwY3hBcZa');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('api.example.com');
  });

  it('should redact credential header', () => {
    const result = redactPaymentauthHeader(`Payment ${SAMPLE_CREDENTIAL_B64}`);
    expect(result).toBe('Payment [REDACTED]');
    expect(result).not.toContain(SAMPLE_CREDENTIAL_B64);
  });

  it('should handle empty input', () => {
    expect(redactPaymentauthHeader('')).toBe('[empty]');
  });

  it('should handle scheme-only input', () => {
    expect(redactPaymentauthHeader('Payment')).toBe('Payment');
  });
});

// ---------------------------------------------------------------------------
// parsePaymentauthChallenges
// ---------------------------------------------------------------------------

describe('parsePaymentauthChallenges', () => {
  it('should parse a single challenge', () => {
    const challenges = parsePaymentauthChallenges(SAMPLE_CHALLENGE_HEADER);

    expect(challenges).toHaveLength(1);
    expect(challenges[0].params.id).toBe('x7Tg2pLqR9mKvNwY3hBcZa');
    expect(challenges[0].params.realm).toBe('api.example.com');
    expect(challenges[0].params.method).toBe('example');
    expect(challenges[0].params.intent).toBe('charge');
    expect(challenges[0].params.request).toBe(SAMPLE_REQUEST_B64);
    expect(challenges[0].params.expires).toBe('2025-01-15T12:05:00Z');
  });

  it('should preserve raw header string', () => {
    const challenges = parsePaymentauthChallenges(SAMPLE_CHALLENGE_HEADER);
    expect(challenges[0].rawHeader).toBe(SAMPLE_CHALLENGE_HEADER);
  });

  it('should handle case-insensitive scheme matching', () => {
    const header = SAMPLE_CHALLENGE_HEADER.replace('Payment', 'payment');
    const challenges = parsePaymentauthChallenges(header);
    expect(challenges).toHaveLength(1);
  });

  it('should return empty array for non-Payment scheme', () => {
    const challenges = parsePaymentauthChallenges('Bearer token123');
    expect(challenges).toHaveLength(0);
  });

  it('should parse first challenge from header (multi-challenge not fully supported)', () => {
    // Current parser extracts the first Payment challenge only.
    // For multiple challenges, use separate WWW-Authenticate lines.
    const header =
      'Payment id="abc", realm="a.com", method="m1", intent="charge", request="ewo"' +
      ', Payment id="def", realm="b.com", method="m2", intent="authorize", request="ewo"';
    const challenges = parsePaymentauthChallenges(header);
    expect(challenges).toHaveLength(1);
    expect(challenges[0].params.id).toBe('abc');
  });

  it('should preserve rawSegment for the parsed challenge', () => {
    const challenges = parsePaymentauthChallenges(SAMPLE_CHALLENGE_HEADER);
    expect(challenges[0].rawSegment).toBeTruthy();
    expect(challenges[0].rawSegment).toContain('x7Tg2pLqR9mKvNwY3hBcZa');
  });

  it('should parse quoted-string values with escaping', () => {
    const header =
      'Payment id="test\\"val", realm="example.com", method="m", intent="i", request="ewo"';
    const challenges = parsePaymentauthChallenges(header);
    expect(challenges).toHaveLength(1);
    expect(challenges[0].params.id).toBe('test"val');
  });

  it('should reject oversized headers', () => {
    const huge = 'Payment id="x", realm="' + 'a'.repeat(MAX_HEADER_BYTES) + '"';
    expect(() => parsePaymentauthChallenges(huge)).toThrow(PaymentauthError);
    expect(() => parsePaymentauthChallenges(huge)).toThrow(/exceeds/);
  });

  it('should reject too many params', () => {
    const params = Array.from({ length: MAX_AUTH_PARAMS + 1 }, (_, i) => `p${i}="v"`).join(', ');
    const header = `Payment ${params}`;
    expect(() => parsePaymentauthChallenges(header)).toThrow(PaymentauthError);
    expect(() => parsePaymentauthChallenges(header)).toThrow(/param count/);
  });

  it('should reject duplicate params', () => {
    const header = 'Payment id="a", id="b", realm="x", method="m", intent="i", request="r"';
    expect(() => parsePaymentauthChallenges(header)).toThrow(PaymentauthError);
    expect(() => parsePaymentauthChallenges(header)).toThrow(/Duplicate/);
  });

  it('should lowercase param keys', () => {
    const header = 'Payment ID="test", Realm="example.com", Method="m", Intent="i", Request="ewo"';
    const challenges = parsePaymentauthChallenges(header);
    expect(challenges[0].params.id).toBe('test');
    expect(challenges[0].params.realm).toBe('example.com');
  });

  it('should preserve unknown params', () => {
    const header =
      'Payment id="x", realm="y", method="m", intent="i", request="r", custom_field="val"';
    const challenges = parsePaymentauthChallenges(header);
    expect(challenges[0].params.custom_field).toBe('val');
  });
});

// ---------------------------------------------------------------------------
// parsePaymentauthCredential
// ---------------------------------------------------------------------------

describe('parsePaymentauthCredential', () => {
  it('should parse a valid credential', () => {
    const raw = parsePaymentauthCredential(`Payment ${SAMPLE_CREDENTIAL_B64}`);

    expect(raw.rawValue).toBe(SAMPLE_CREDENTIAL_B64);
    expect(raw.decodedBytes).toBeInstanceOf(Uint8Array);
    expect(raw.decodedString).toBeTruthy();
    expect(raw.parsedJson).toEqual(SAMPLE_CREDENTIAL_JSON);
  });

  it('should preserve decoded bytes', () => {
    const raw = parsePaymentauthCredential(`Payment ${SAMPLE_CREDENTIAL_B64}`);
    expect(raw.decodedBytes.length).toBeGreaterThan(0);
  });

  it('should accept case-insensitive scheme per RFC 9110', () => {
    const lower = parsePaymentauthCredential(`payment ${SAMPLE_CREDENTIAL_B64}`);
    expect(lower.parsedJson).toEqual(SAMPLE_CREDENTIAL_JSON);

    const upper = parsePaymentauthCredential(`PAYMENT ${SAMPLE_CREDENTIAL_B64}`);
    expect(upper.parsedJson).toEqual(SAMPLE_CREDENTIAL_JSON);

    const mixed = parsePaymentauthCredential(`pAyMeNt ${SAMPLE_CREDENTIAL_B64}`);
    expect(mixed.parsedJson).toEqual(SAMPLE_CREDENTIAL_JSON);
  });

  it('should reject missing scheme prefix', () => {
    expect(() => parsePaymentauthCredential(`Bearer ${SAMPLE_CREDENTIAL_B64}`)).toThrow(
      /scheme prefix/
    );
  });

  it('should reject empty credential value', () => {
    expect(() => parsePaymentauthCredential('Payment ')).toThrow(/Empty/);
  });

  it('should reject invalid base64url', () => {
    expect(() => parsePaymentauthCredential('Payment !!!invalid!!!')).toThrow(/base64url/);
  });

  it('should reject oversized header', () => {
    const huge = 'Payment ' + 'a'.repeat(MAX_HEADER_BYTES);
    expect(() => parsePaymentauthCredential(huge)).toThrow(/exceeds/);
  });

  it('should handle non-JSON decoded payload gracefully', () => {
    const notJson = toBase64url('not json at all');
    // This will decode to a string but won't parse as JSON
    const raw = parsePaymentauthCredential(`Payment ${notJson}`);
    expect(raw.decodedString).toBeTruthy();
    // parsedJson may be a string literal or undefined depending on JSON.parse behavior
  });

  it('should never include raw value in error messages', () => {
    try {
      parsePaymentauthCredential('Payment !!!');
    } catch (e: unknown) {
      expect((e as Error).message).not.toContain('!!!');
    }
  });
});

// ---------------------------------------------------------------------------
// parsePaymentauthReceipt
// ---------------------------------------------------------------------------

describe('parsePaymentauthReceipt', () => {
  it('should parse a valid receipt', () => {
    const raw = parsePaymentauthReceipt(SAMPLE_RECEIPT_B64);

    expect(raw.rawValue).toBe(SAMPLE_RECEIPT_B64);
    expect(raw.decodedBytes).toBeInstanceOf(Uint8Array);
    expect(raw.decodedString).toBeTruthy();
    expect(raw.parsedJson).toEqual(SAMPLE_RECEIPT_JSON);
  });

  it('should reject empty value', () => {
    expect(() => parsePaymentauthReceipt('')).toThrow(/Empty/);
  });
});

// ---------------------------------------------------------------------------
// normalizeChallenge
// ---------------------------------------------------------------------------

describe('normalizeChallenge', () => {
  it('should normalize a valid challenge', () => {
    const challenges = parsePaymentauthChallenges(SAMPLE_CHALLENGE_HEADER);
    const normalized = normalizeChallenge(challenges[0]);

    expect(normalized.id).toBe('x7Tg2pLqR9mKvNwY3hBcZa');
    expect(normalized.realm).toBe('api.example.com');
    expect(normalized.method).toBe('example');
    expect(normalized.intent).toBe('charge');
    expect(normalized.requestRaw).toBe(SAMPLE_REQUEST_B64);
    expect(normalized.decodedRequest).toEqual(SAMPLE_REQUEST);
    expect(normalized.expires).toBe('2025-01-15T12:05:00Z');
    expect(normalized._raw).toBe(challenges[0]);
  });

  it('should reject missing required fields', () => {
    const raw = { rawHeader: 'test', rawSegment: 'test', params: { id: 'x' } };
    expect(() => normalizeChallenge(raw)).toThrow(/Missing required/);
  });

  it('should handle invalid base64url in request gracefully', () => {
    const raw = {
      rawHeader: 'test',
      rawSegment: 'test',
      params: { id: 'x', realm: 'y', method: 'm', intent: 'i', request: '!!invalid!!' },
    };
    const normalized = normalizeChallenge(raw);
    expect(normalized.decodedRequest).toBeUndefined();
    expect(normalized.requestRaw).toBe('!!invalid!!');
  });

  it('should preserve optional fields', () => {
    const raw = {
      rawHeader: 'test',
      rawSegment: 'test',
      params: {
        id: 'x',
        realm: 'y',
        method: 'm',
        intent: 'i',
        request: SAMPLE_REQUEST_B64,
        description: 'test payment',
        opaque: 'abc',
      },
    };
    const normalized = normalizeChallenge(raw);
    expect(normalized.description).toBe('test payment');
    expect(normalized.opaque).toBe('abc');
  });
});

// ---------------------------------------------------------------------------
// normalizeCredential
// ---------------------------------------------------------------------------

describe('normalizeCredential', () => {
  it('should normalize a valid credential', () => {
    const raw = parsePaymentauthCredential(`Payment ${SAMPLE_CREDENTIAL_B64}`);
    const normalized = normalizeCredential(raw);

    expect(normalized.challengeId).toBe('x7Tg2pLqR9mKvNwY3hBcZa');
    expect(normalized.method).toBe('example');
    expect(normalized.intent).toBe('charge');
    expect(normalized.payload).toEqual({ proof: '0xabc123' });
    expect(normalized._raw).toBe(raw);
  });

  it('should extract source (DID) when present', () => {
    const credJson = { ...SAMPLE_CREDENTIAL_JSON, source: 'did:key:z6MkhaXgBZ...' };
    const b64 = toBase64url(credJson);
    const raw = parsePaymentauthCredential(`Payment ${b64}`);
    const normalized = normalizeCredential(raw);
    expect(normalized.source).toBe('did:key:z6MkhaXgBZ...');
  });

  it('should reject non-object decoded JSON', () => {
    const b64 = toBase64url('just a string');
    const raw = parsePaymentauthCredential(`Payment ${b64}`);
    expect(() => normalizeCredential(raw)).toThrow(/not an object/);
  });

  it('should reject credential with missing challenge.id', () => {
    const credJson = {
      challenge: { method: 'x', intent: 'charge', request: 'r' },
      payload: {},
    };
    const b64 = toBase64url(credJson);
    const raw = parsePaymentauthCredential(`Payment ${b64}`);
    expect(() => normalizeCredential(raw)).toThrow(/challenge.id/);
  });

  it('should reject credential with missing challenge.method', () => {
    const credJson = {
      challenge: { id: 'x', intent: 'charge', request: 'r' },
      payload: {},
    };
    const b64 = toBase64url(credJson);
    const raw = parsePaymentauthCredential(`Payment ${b64}`);
    expect(() => normalizeCredential(raw)).toThrow(/challenge.method/);
  });
});

// ---------------------------------------------------------------------------
// normalizeReceipt
// ---------------------------------------------------------------------------

describe('normalizeReceipt', () => {
  it('should normalize a valid receipt', () => {
    const raw = parsePaymentauthReceipt(SAMPLE_RECEIPT_B64);
    const normalized = normalizeReceipt(raw);

    expect(normalized.status).toBe('success');
    expect(normalized.method).toBe('example');
    expect(normalized.timestamp).toBe('2025-01-15T12:00:00Z');
    expect(normalized.reference).toBe('inv_12345');
    expect(normalized.extras).toEqual({});
    expect(normalized._raw).toBe(raw);
  });

  it('should put unknown fields in extras', () => {
    const receiptJson = { ...SAMPLE_RECEIPT_JSON, custom_field: 'val', tx_hash: '0xabc' };
    const b64 = toBase64url(receiptJson);
    const raw = parsePaymentauthReceipt(b64);
    const normalized = normalizeReceipt(raw);

    expect(normalized.extras.custom_field).toBe('val');
    expect(normalized.extras.tx_hash).toBe('0xabc');
  });

  it('should reject receipt with missing status', () => {
    const receiptJson = { method: 'example', timestamp: '2025-01-15T12:00:00Z' };
    const b64 = toBase64url(receiptJson);
    const raw = parsePaymentauthReceipt(b64);
    expect(() => normalizeReceipt(raw)).toThrow(/status/);
  });

  it('should reject receipt with missing method', () => {
    const receiptJson = { status: 'success', timestamp: '2025-01-15T12:00:00Z' };
    const b64 = toBase64url(receiptJson);
    const raw = parsePaymentauthReceipt(b64);
    expect(() => normalizeReceipt(raw)).toThrow(/method/);
  });
});
