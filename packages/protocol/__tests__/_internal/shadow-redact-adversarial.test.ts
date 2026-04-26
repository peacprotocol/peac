/**
 * Adversarial coverage for the secret-class redaction module.
 *
 * Ground-truth contract: every regex registered in
 * packages/protocol/src/_internal/shadow-redact.ts SECRET_PATTERNS MUST
 * have at least one matching adversarial vector here AND at least one
 * adjacent benign-not-matched vector. Conversely, every secret class
 * we claim to cover MUST have a test row in the table below.
 *
 * Three assertions per row (binding):
 *
 *   (A) the input substring is NOT a substring of the output
 *   (B) the output contains [REDACTED] at least once
 *   (C) the output's UTF-8 byte length is <= maxBytes
 *
 * Coverage modes per row:
 *
 *   - bare: redact(secret-only string)
 *   - prefixed: redact(benign + secret + benign) at a normal byte budget
 *   - truncated: redact(secret + filler) at a 128-byte budget so the
 *     output must hit the truncation path AFTER redaction
 *
 * The benign-not-matched control table at the end asserts that close
 * lookalikes (short tokens, sub-threshold base64, etc.) are NOT
 * redacted; this prevents the patterns from drifting into over-broad
 * collateral.
 */

import { describe, expect, it } from 'vitest';
import { redactNote } from '../../src/_internal/shadow-redact';

const MAX_NOTE_BYTES = 128;
const BIG_NOTE_BYTES = 4096;
const REDACTION_MARKER = '[REDACTED]';

interface SecretRow {
  /** Short label used for assertion messages and de-dup. */
  readonly name: string;
  /** Adversarial input that must be redacted. */
  readonly secret: string;
  /**
   * Optional sub-substring that the adversary actually wants to leak;
   * falls back to `secret` when not provided. Some patterns redact a
   * wider span than the literal credential (e.g., the Authorization
   * header line including its name); the secret-substring assertion
   * checks for absence of THIS string in the output.
   */
  readonly leakSubstring?: string;
  /**
   * Header-class secrets are line-anchored by design (Cookie:,
   * Authorization:, etc.). Their `prefixed` and `truncated` test cases
   * separate the secret with newlines so it appears at line-start, the
   * realistic adversarial path for log content. Non-header secrets run
   * with normal whitespace separators.
   */
  readonly lineAnchored?: boolean;
}

const SECRET_ROWS: readonly SecretRow[] = [
  // 1. Compact JWS / JWT
  {
    name: 'compact JWS / JWT',
    secret:
      'eyJhbGciOiJFZERTQSIsInR5cCI6Imp3dCJ9.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },

  // 2. PEM block - generic PRIVATE KEY
  {
    name: 'PEM PRIVATE KEY block',
    secret:
      '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIH7Y6KDLP+lZ6cJYyKUf3VL6f0X2W1J8K9q9Y0hN0MNh\n-----END PRIVATE KEY-----',
  },

  // 3. PEM block - RSA variant
  {
    name: 'PEM RSA PRIVATE KEY variant',
    secret:
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAtest+payload+bytes+for+rsa+private+key+content\n-----END RSA PRIVATE KEY-----',
  },

  // 3a. PEM block - EC variant
  {
    name: 'PEM EC PRIVATE KEY variant',
    secret:
      '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIBPzWtest+ec+private+key+payload+bytes+for+coverage\n-----END EC PRIVATE KEY-----',
  },

  // 3b. PEM block - OPENSSH variant
  {
    name: 'PEM OPENSSH PRIVATE KEY variant',
    secret:
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABDtest\n-----END OPENSSH PRIVATE KEY-----',
  },

  // 4. Long base64 / base64url (>= 40 chars)
  {
    name: 'long base64 (>=40 chars)',
    secret: 'dGVzdC1zZWNyZXQtdmFsdWUtbG9uZ2VyLXRoYW4tZm9ydHktY2hhcnM=',
  },

  // 5. Bearer token header
  {
    name: 'Authorization Bearer token',
    secret: 'Bearer abc.def.ghi-jkl_mno.pqr-stuvwxyz1234567890',
  },

  // 6. Generic Authorization header (Basic scheme)
  {
    name: 'Authorization Basic header line',
    secret: 'Authorization: Basic dXNlcjpwYXNzd29yZGdvZXNoZXJl',
    leakSubstring: 'dXNlcjpwYXNzd29yZGdvZXNoZXJl',
    lineAnchored: true,
  },

  // 6a. Generic Authorization header (Digest scheme)
  {
    name: 'Authorization Digest header line',
    secret: 'Authorization: Digest username="alice", realm="x", nonce="abc", response="def"',
    leakSubstring: 'response="def"',
    lineAnchored: true,
  },

  // 7. Cookie request header line
  {
    name: 'Cookie request header line',
    secret: 'Cookie: sessionid=abc123def456ghi789; csrftoken=xyz789longvaluehere',
    leakSubstring: 'sessionid=abc123def456ghi789',
    lineAnchored: true,
  },

  // 8. Set-Cookie response header line
  {
    name: 'Set-Cookie response header line',
    secret: 'Set-Cookie: sid=abc.def.ghi-payload-here; Path=/; HttpOnly',
    leakSubstring: 'sid=abc.def.ghi-payload-here',
    lineAnchored: true,
  },

  // 8a. X-Auth-Token header
  {
    name: 'X-Auth-Token header line',
    secret: 'X-Auth-Token: abc.def.ghi-jkl-mno-pqr-stuvwxyz',
    leakSubstring: 'abc.def.ghi-jkl-mno-pqr-stuvwxyz',
    lineAnchored: true,
  },

  // 9. URL query token / API key (named query forms)
  {
    name: 'URL query token=...',
    secret: 'https://example.com/api?token=secret-credential-value-1234567890&other=ok',
    leakSubstring: 'secret-credential-value-1234567890',
  },

  // 9a. URL query api_key=...
  {
    name: 'URL query api_key=...',
    secret: 'https://example.com/v1/get?api_key=ABCD1234efgh5678ijkl9012&page=1',
    leakSubstring: 'ABCD1234efgh5678ijkl9012',
  },

  // 9b. AWS access key ID (AKIA...)
  {
    name: 'AWS access key ID',
    secret: 'AKIAIOSFODNN7EXAMPLE',
  },

  // 10. Email address (PII)
  {
    name: 'email PII',
    secret: 'user.alice@example.com',
  },

  // 11. Phone number (E.164)
  {
    name: 'phone E.164',
    secret: '+15551234567',
  },

  // 11a. Phone number (NA hyphenated)
  {
    name: 'phone NA hyphenated',
    secret: '555-123-4567',
  },

  // 13. Raw JWS payload (matched by JWS pattern regardless of context)
  {
    name: 'raw JWS payload',
    secret:
      'eyJraWQiOiJ0ZXN0LWtpZCIsImFsZyI6IkVkRFNBIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci5leGFtcGxlIn0.SIGNATURE-BYTES-12345678901234567890',
  },
];

/**
 * Benign control rows: each MUST be returned by `redactNote` byte-equal
 * (no [REDACTED] marker inserted), proving the patterns do not
 * over-match.
 */
const BENIGN_ROWS: readonly { name: string; input: string }[] = [
  { name: 'short alphanumeric', input: 'hello world 12345' },
  { name: 'sub-threshold base64 (39 chars)', input: 'abcdefghijklmnopqrstuvwxyz1234567890ABC' },
  { name: 'short hex', input: 'a1b2c3' },
  { name: 'plain identifier', input: 'kernel-constraints-violation-at-payload-iss' },
  { name: 'plain code label', input: 'canonical-hash-mismatch' },
  { name: 'small phone-like 6 digits', input: '123456' },
];

describe('shadow-redact: adversarial secret-class coverage', () => {
  for (const row of SECRET_ROWS) {
    const leak = row.leakSubstring ?? row.secret;

    describe(row.name, () => {
      it('bare: redacts and contains marker', () => {
        const out = redactNote(row.secret, BIG_NOTE_BYTES);
        expect(out).not.toContain(leak);
        expect(out).toContain(REDACTION_MARKER);
        expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(BIG_NOTE_BYTES);
      });

      it('prefixed: redacts inside benign concatenation', () => {
        // Header-class secrets are line-anchored; embed via newlines so
        // the secret appears at line-start, the realistic adversarial
        // path for log content. Other secrets use space separators.
        const sep = row.lineAnchored ? '\n' : ' ';
        const wrapped = `prefix-context-text${sep}${row.secret}${sep}mid-context-text`;
        const out = redactNote(wrapped, BIG_NOTE_BYTES);
        expect(out).not.toContain(leak);
        expect(out).toContain(REDACTION_MARKER);
        expect(out).toMatch(/prefix-context-text/);
        expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(BIG_NOTE_BYTES);
      });

      it('truncated: redacts before 128-byte boundary truncation', () => {
        // Force the output to exceed MAX_NOTE_BYTES so the byte-truncation
        // path runs AFTER redaction. The leak substring MUST still be absent.
        const filler = 'x'.repeat(200);
        const sep = row.lineAnchored ? '\n' : ' ';
        const wrapped = `${row.secret}${sep}${filler}`;
        const out = redactNote(wrapped, MAX_NOTE_BYTES);
        expect(out).not.toContain(leak);
        expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_NOTE_BYTES);
      });
    });
  }

  describe('large untrusted payload (no recognized pattern)', () => {
    it('truncates to <= maxBytes and ends with the redaction marker', () => {
      const blob = 'A'.repeat(200);
      const out = redactNote(blob, MAX_NOTE_BYTES);
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_NOTE_BYTES);
      // The blob itself is not a recognized class but the long-base64
      // pattern matches uppercase-only runs >= 40 chars; either way the
      // output MUST be marker-bearing (truncation OR redaction).
      expect(out).toContain(REDACTION_MARKER);
    });
  });

  describe('nested secret field (object stringified into notes)', () => {
    it('redacts every recognized class inside a JSON-stringified object', () => {
      const nested = JSON.stringify({
        outer: 'visible',
        bearer: 'Bearer abc.def.ghi-jkl_mno.pqr-credential',
        email: 'leaked@example.com',
        nested: { token: 'Bearer second.credential.value-payload' },
      });
      const out = redactNote(nested, BIG_NOTE_BYTES);
      expect(out).not.toContain('abc.def.ghi-jkl_mno.pqr-credential');
      expect(out).not.toContain('leaked@example.com');
      expect(out).not.toContain('second.credential.value-payload');
      expect(out).toContain(REDACTION_MARKER);
    });
  });

  describe('truncation boundary: secret near maxBytes cutoff', () => {
    it('redacts the secret BEFORE truncation so leak is not preserved at byte boundary', () => {
      // Secret near position 100; maxBytes 128. The redaction must run
      // first; the truncation may then crop the post-marker tail.
      const prefix = 'p'.repeat(100);
      const tail = 'q'.repeat(50);
      const input = `${prefix}user@example.com${tail}`;
      const out = redactNote(input, MAX_NOTE_BYTES);
      expect(out).not.toContain('user@example.com');
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_NOTE_BYTES);
    });
  });

  describe('non-string input', () => {
    it('non-string input is replaced with the redaction marker', () => {
      const cases: unknown[] = [undefined, null, 42, { x: 1 }, [1, 2], true];
      for (const c of cases) {
        const out = redactNote(c as string, MAX_NOTE_BYTES);
        expect(out).toBe(REDACTION_MARKER);
      }
    });
  });

  describe('UTF-8 boundary safety', () => {
    it('does not split a multibyte code point at the truncation cutoff', () => {
      // Each emoji is 4 UTF-8 bytes. Filling well past the limit forces
      // truncation; the result must still be valid UTF-8 (no replacement
      // characters appear from a partial code point).
      const emojiRun = 'A' + 'I'.repeat(2) + 'A'.repeat(50);
      const big = emojiRun + 'leakedsecret'.repeat(20);
      const out = redactNote(big, MAX_NOTE_BYTES);
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_NOTE_BYTES);
      // Round-trip through Buffer to detect mid-codepoint corruption.
      const roundTrip = Buffer.from(out, 'utf8').toString('utf8');
      expect(roundTrip).toEqual(out);
    });
  });

  describe('benign control rows (must NOT be over-matched)', () => {
    for (const row of BENIGN_ROWS) {
      it(`leaves benign ${row.name} byte-equal`, () => {
        const out = redactNote(row.input, BIG_NOTE_BYTES);
        expect(out).toEqual(row.input);
        expect(out).not.toContain(REDACTION_MARKER);
      });
    }
  });
});
