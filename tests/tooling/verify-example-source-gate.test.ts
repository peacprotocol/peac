/**
 * Unit gate for scripts/verify-example-source-gate.mjs.
 *
 * Exercises the pure `scanContent()` scanner directly (no filesystem): the
 * positive detectors (live-shaped secrets, JWK private scalars, bearer JWTs,
 * keyword-anchored hex keys, base64url-encoded payment credentials) and the
 * locked false-positive traps (sha256 digests, non-JWT Bearer challenges,
 * `pi_...` placeholders, demo tx hashes, PEAC JWS payload segments, and very
 * long non-secret tokens).
 *
 * Importing the module must be side-effect-free: `main()` runs only when the
 * script is invoked directly, so this test never touches the repo tree.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  scanContent,
  SCAN_TARGETS,
  PAYMENT_CREDENTIAL_KEYS,
  MAX_DECODE_CANDIDATE_LEN,
} from '../../scripts/verify-example-source-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'verify-example-source-gate.mjs');

/** base64url-encode a JSON value (matches how examples inline encoded payloads). */
function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

const patternsOf = (text: string): string[] => scanContent(text).map((f) => f.pattern);

describe('scanContent - purity and shape', () => {
  it('returns an array and never throws on empty or benign text', () => {
    expect(scanContent('')).toEqual([]);
    expect(scanContent('const amount = 100; // just a comment\n')).toEqual([]);
  });

  it('does not mutate its input string', () => {
    const input = 'harmless line\n';
    const copy = String(input);
    scanContent(input);
    expect(input).toBe(copy);
  });

  it('reports 1-indexed line numbers', () => {
    // build the live-key value at runtime so the scanned text is contiguous
    // while this source file holds no contiguous secret literal
    const skLive = 'sk_live_' + 'x'.repeat(24);
    const text = ['line one', 'const k = "' + skLive + '";'].join('\n');
    const findings = scanContent(text);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
  });
});

describe('scanContent - positive detectors (must flag)', () => {
  it('flags a live-shaped Stripe secret key', () => {
    const skLive = 'sk_live_' + 'a'.repeat(24);
    const text = 'const key = "' + skLive + '";';
    expect(patternsOf(text)).toContain('stripe-secret-live');
  });

  it('flags a JWK private scalar ("d")', () => {
    const text = `{ "kty": "OKP", "crv": "Ed25519", "d": "${'A'.repeat(43)}" }`;
    expect(patternsOf(text)).toContain('jwk-private-scalar');
  });

  it('flags a bearer JWT', () => {
    const jwt = ['eyJ' + 'a'.repeat(8), 'b'.repeat(10), 'c'.repeat(10)].join('.');
    expect(patternsOf(`Authorization: Bearer ${jwt}`)).toContain('bearer-jwt');
  });

  it('flags a keyword-anchored private hex key', () => {
    const text = `secret_key = 0x${'a'.repeat(64)}`;
    expect(patternsOf(text)).toContain('keyword-anchored-hex-key');
  });

  it('flags a base64url payload carrying raw payment credential fields', () => {
    const blob = b64urlJson({ pan: '4111111111111111', cvv: '123', brand: 'visa' });
    const findings = scanContent(`const payload = "${blob}";`);
    expect(findings.map((f) => f.pattern)).toContain('decoded-payment-credential');
    const cred = findings.find((f) => f.pattern === 'decoded-payment-credential');
    expect(cred?.match).toContain('cvv');
    expect(cred?.match).toContain('pan');
  });

  it('flags a base64url payload matching a raw Payment-Receipt shape (nested credentials)', () => {
    const blob = b64urlJson({
      payment_receipt: { account_number: '000123456789', routing_number: '021000021' },
    });
    const patterns = patternsOf(`receipt = "${blob}"`);
    expect(patterns).toContain('decoded-payment-credential');
  });

  it('flags a raw Payment-Receipt shape even with NO credential keys (object-valued)', () => {
    const blob = b64urlJson({
      payment_receipt: { amount_minor: 100, currency: 'USD', transaction_id: 'txn_abc123' },
    });
    const hit = scanContent(`receipt = "${blob}"`).find(
      (f) => f.pattern === 'decoded-payment-credential'
    );
    expect(hit).toBeDefined();
    expect(hit?.match).toContain('payment_receipt');
  });

  it('does NOT flag a string payment_receipt_digest reference (safe PEAC proof field)', () => {
    // a PEAC record legitimately binds a receipt by digest / signed-JWS string;
    // these are object-key-shaped but string-valued -> must not fire
    const blob = b64urlJson({
      type: 'org.peacprotocol/payment',
      proofs: {
        payment_receipt_digest: 'sha256:' + 'a'.repeat(64),
        payment_receipt_jws: 'eyJhbGc',
      },
    });
    expect(scanContent(`rec = "${blob}"`)).toEqual([]);
  });
});

describe('scanContent - locked false-positive traps (must NOT flag)', () => {
  it('does not flag a sha256 digest', () => {
    expect(scanContent(`digest: sha256:${'a'.repeat(64)}`)).toEqual([]);
  });

  it('does not flag a non-JWT Bearer challenge', () => {
    expect(scanContent('WWW-Authenticate: Bearer realm="payment", error="invalid_token"')).toEqual(
      []
    );
  });

  it('does not flag a pi_ placeholder id', () => {
    expect(scanContent('const id = "pi_3QxYz1234567890abc";')).toEqual([]);
  });

  it('does not flag a demo 0x transaction hash', () => {
    const txHash = '0x' + 'deadbeef'.repeat(8);
    expect(scanContent(`tx_hash: "${txHash}"`)).toEqual([]);
  });

  it('does not flag a PEAC JWS payload segment', () => {
    const payload = b64urlJson({
      iss: 'https://issuer.example',
      sub: 'agent-1',
      type: 'org.peacprotocol/payment',
      pillars: ['Commerce'],
      iat: 1700000000,
      jti: '018f...uuid',
    });
    // full compact JWS shape: header.payload.signature
    const jws = ['eyJhbGciOiJFZERTQSJ9', payload, 'c'.repeat(86)].join('.');
    expect(scanContent(`receipt: "${jws}"`)).toEqual([]);
  });

  it('does not flag (or blow up on) a very long non-secret token', () => {
    // >MAX_DECODE_CANDIDATE_LEN, non-hex so it exercises the length bound,
    // not the pure-hex guard.
    const longToken = 'Zz9_'.repeat(6000); // 24000 chars, well over the bound
    expect(longToken.length).toBeGreaterThan(MAX_DECODE_CANDIDATE_LEN);
    const start = Date.now();
    const findings = scanContent(`blob = "${longToken}"`);
    expect(findings).toEqual([]);
    // sanity: the bound keeps this cheap (no per-token decode of a huge blob)
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('scanContent - output redaction (no secret material in findings)', () => {
  it('redacts a literal live-secret match (never echoes the full key)', () => {
    const skLive = 'sk_live_' + 'a'.repeat(24);
    const [finding] = scanContent('const key = "' + skLive + '";');
    expect(finding.pattern).toBe('stripe-secret-live');
    expect(finding.match).not.toContain(skLive);
    expect(finding.match).toContain('<redacted');
  });

  it('redacts a JWK private scalar match', () => {
    const d = 'A'.repeat(43);
    const [finding] = scanContent(`{ "kty": "OKP", "d": "${d}" }`);
    expect(finding.pattern).toBe('jwk-private-scalar');
    expect(finding.match).not.toContain(d);
    expect(finding.match).toContain('<redacted');
  });

  it('reports decoded credential KEY NAMES only, never the values', () => {
    const blob = b64urlJson({ pan: '4111111111111111', cvv: '123' });
    const finding = scanContent(`payload="${blob}"`).find(
      (f) => f.pattern === 'decoded-payment-credential'
    );
    expect(finding?.match).toContain('pan');
    expect(finding?.match).not.toContain('4111111111111111');
    expect(finding?.match).not.toContain('123');
  });

  it('shows retired-vocabulary matches verbatim (not secret material)', () => {
    const [finding] = scanContent('const x = "stripe_secret";');
    expect(finding.pattern).toBe('retired-vendor-secret');
    expect(finding.match).toBe('stripe_secret');
  });
});

describe('CLI', () => {
  it('runs as a CLI and reports clean (import guard keeps main() off on import)', () => {
    const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    expect(out).toContain('verify-example-source-gate: clean');
  });
});

describe('module exports', () => {
  it('scans both the provisioning and commerce example surface', () => {
    const paths = SCAN_TARGETS.map((t: { path: string }) => t.path);
    expect(paths).toContain('examples/provisioning-lifecycle');
    expect(paths).toContain('examples/stripe-spt-evidence');
    expect(paths).toContain('examples/commerce-evidence-bundle');
    // every commerce target is required (fail-closed)
    const commerce = SCAN_TARGETS.filter((t: { path: string }) => t.path.startsWith('examples/'));
    expect(commerce.every((t: { required: boolean }) => t.required)).toBe(true);
  });

  it('exposes the payment-credential key set used by decode-and-inspect', () => {
    expect(PAYMENT_CREDENTIAL_KEYS.has('pan')).toBe(true);
    expect(PAYMENT_CREDENTIAL_KEYS.has('account_number')).toBe(true);
    expect(PAYMENT_CREDENTIAL_KEYS.has('iss')).toBe(false);
  });
});
