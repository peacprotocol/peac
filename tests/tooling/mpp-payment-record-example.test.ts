/**
 * Runtime smoke test for examples/mpp-payment-record.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here, not just its types. This imports the demo's exported runDemo()
 * and recordPaymentReceipt() in-process (vitest aliases @peac/* to source, so
 * no build or example install is required) and asserts:
 *   - the signed org.peacprotocol/payment record verifies offline and its
 *     upstream-receipt digest and 402-challenge digest re-bind
 *   - payment_rail is the paymentauth rail (not the receipt method)
 *   - the raw Payment-Receipt is never logged or embedded in the signed payload
 *   - the PEAC receipt coexists with payment metadata in an MCP _meta tree
 *   - tampering with the record payload fails with E_INVALID_SIGNATURE
 *   - malformed and non-success receipts are rejected
 *
 * No network, no subprocess.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateKeypair, jcsHash, canonicalize } from '@peac/crypto';
import { runDemo, recordPaymentReceipt } from '../../examples/mpp-payment-record/demo';

/** base64url of plain JSON (Payment-Receipt header). */
function b64u(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

/** base64url of RFC 8785 JCS JSON (the 402 challenge `request`, per the draft). */
function b64uJcs(obj: unknown): string {
  return Buffer.from(canonicalize(obj), 'utf8').toString('base64url');
}

// A valid 402 "Payment" challenge header (paymentauth form) for the negative tests.
const CHALLENGE_HEADER =
  `Payment id="ch_test", realm="api.example.com", method="example", intent="charge", ` +
  `expires="2026-06-15T12:05:00Z", ` +
  `request="${b64uJcs({ amount: '500', currency: 'USD', recipient: 'acct', resource: 'tool:test' })}"`;

// The canonical binding the record commits to for CHALLENGE_HEADER (mirrors
// challengeBindingForDigest in the demo): normalized challenge identity + decoded request.
const CHALLENGE_BINDING = {
  id: 'ch_test',
  realm: 'api.example.com',
  method: 'example',
  intent: 'charge',
  expires: '2026-06-15T12:05:00Z',
  request: { amount: '500', currency: 'USD', recipient: 'acct', resource: 'tool:test' },
};

function decodePayload(jws: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'));
}

describe('mpp-payment-record example', () => {
  it('records, verifies offline, and re-binds the upstream and challenge digests', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.signatureValid).toBe(true);
    expect(r.amountMinor).toBe('500');
    expect(r.currency).toBe('USD');
    expect(r.digestMatches).toBe(true);
    expect(r.challengeDigestMatches).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('uses the paymentauth rail for payment_rail (not the receipt method)', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.paymentRail).toBe('paymentauth');

    const { privateKey } = await generateKeypair();
    const header = b64u({ status: 'success', method: 'example', reference: 'pay_1' });
    const rec = await recordPaymentReceipt(CHALLENGE_HEADER, header, privateKey);
    const exts = decodePayload(rec.jws).extensions as Record<string, Record<string, unknown>>;
    expect(exts['org.peacprotocol/commerce'].payment_rail).toBe('paymentauth');
    expect(exts['org.peacprotocol/commerce'].env).toBe('live');
    expect(exts['org.peacprotocol/commerce'].method).toBeUndefined();
    expect(exts['com.example/mpp'].method).toBe('example');
  });

  it('binds the normalized 402 challenge identity and request payload into the digest', async () => {
    const { privateKey } = await generateKeypair();
    const header = b64u({ status: 'success', method: 'example', reference: 'pay_1' });
    const rec = await recordPaymentReceipt(CHALLENGE_HEADER, header, privateKey);
    const exts = decodePayload(rec.jws).extensions as Record<string, Record<string, unknown>>;
    expect(exts['com.example/mpp'].payment_challenge_digest).toBe(rec.challengeDigest);
    // The digest binds the normalized challenge identity and decoded request (RFC 8785 JCS),
    // self-describing as sha256:<hex>.
    expect(`sha256:${await jcsHash(CHALLENGE_BINDING)}`).toBe(rec.challengeDigest);
  });

  it('records a challenge without expires and binds expires as null', async () => {
    const { privateKey } = await generateKeypair();
    const noExpiresHeader =
      `Payment id="ch_noexp", realm="api.example.com", method="example", intent="charge", ` +
      `request="${b64uJcs({ amount: '500', currency: 'USD', recipient: 'acct', resource: 'tool:test' })}"`;
    const header = b64u({ status: 'success', method: 'example', reference: 'pay_1' });
    const rec = await recordPaymentReceipt(noExpiresHeader, header, privateKey);
    // expires absent -> bound as null (deterministic, cross-language-safe).
    const binding = {
      id: 'ch_noexp',
      realm: 'api.example.com',
      method: 'example',
      intent: 'charge',
      expires: null,
      request: { amount: '500', currency: 'USD', recipient: 'acct', resource: 'tool:test' },
    };
    expect(`sha256:${await jcsHash(binding)}`).toBe(rec.challengeDigest);
  });

  it('detects a 402 challenge mismatch for amount, id, method, and expires', async () => {
    const { privateKey } = await generateKeypair();
    const header = b64u({ status: 'success', method: 'example', reference: 'pay_1' });
    const rec = await recordPaymentReceipt(CHALLENGE_HEADER, header, privateKey);
    const changedAmount = {
      ...CHALLENGE_BINDING,
      request: { ...CHALLENGE_BINDING.request, amount: '999' },
    };
    const changedId = { ...CHALLENGE_BINDING, id: 'ch_other' };
    const changedMethod = { ...CHALLENGE_BINDING, method: 'other' };
    const changedExpires = { ...CHALLENGE_BINDING, expires: '2030-01-01T00:00:00Z' };
    expect(`sha256:${await jcsHash(changedAmount)}`).not.toBe(rec.challengeDigest);
    expect(`sha256:${await jcsHash(changedId)}`).not.toBe(rec.challengeDigest);
    expect(`sha256:${await jcsHash(changedMethod)}`).not.toBe(rec.challengeDigest);
    expect(`sha256:${await jcsHash(changedExpires)}`).not.toBe(rec.challengeDigest);
  });

  it('encodes the 402 challenge request with JCS before base64url', () => {
    // Deliberately unordered keys: JCS must reorder them, so JCS != JSON.stringify.
    const unordered = {
      resource: 'tool:test',
      recipient: 'acct',
      currency: 'USD',
      amount: '500',
    };
    expect(b64uJcs(unordered)).not.toBe(b64u(unordered));
    expect(Buffer.from(b64uJcs(unordered), 'base64url').toString('utf8')).toBe(
      canonicalize(unordered)
    );
  });

  it('never logs the raw Payment-Receipt header', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      lines.push(String(msg ?? ''));
    });
    try {
      await runDemo({ quiet: false });
    } finally {
      spy.mockRestore();
    }
    const out = lines.join('\n');
    // The deterministic raw header the demo's server emits must not appear.
    const rawHeader = b64u({
      status: 'success',
      method: 'example',
      timestamp: '2026-06-15T12:00:00Z',
      reference: 'pay_ch_4f9a21',
    });
    expect(out).toContain('[redacted Payment-Receipt; sha256:');
    expect(out).not.toContain(rawHeader);
    // No long base64url run (raw receipt is long; digests are sliced short).
    expect(out).not.toMatch(/[A-Za-z0-9_-]{50,}/);
  });

  it('never embeds the raw Payment-Receipt in the signed payload', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.rawReceiptLeak).toBe(false);
  });

  it('carries the PEAC receipt alongside payment metadata in MCP _meta', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.mcpMeta.receiptInMeta).toBe(true);
    expect(r.mcpMeta.paymentMetaCoexists).toBe(true);
    expect(r.mcpMeta.metaReceiptVerifies).toBe(true);
    // The _meta payment metadata mirrors the non-sensitive signed commerce fields.
    expect(r.mcpMeta.payment?.challenge_id).toBe('ch_4f9a21');
    expect(r.mcpMeta.payment?.payment_rail).toBe('paymentauth');
    expect(r.mcpMeta.payment?.amount_minor).toBe('500');
    expect(r.mcpMeta.payment?.currency).toBe('USD');
    expect(r.mcpMeta.payment?.reference).toBe('pay_ch_4f9a21');
    expect(r.mcpMeta.payment?.env).toBe('live');
  });

  it('detects record tampering with an invalid signature', async () => {
    const r = await runDemo({ tamper: true, quiet: true });
    expect(r.tamper?.payloadTamperValid).toBe(false);
    expect(r.tamper?.payloadTamperCode).toBe('E_INVALID_SIGNATURE');
  });

  it('reports an overall ok verdict with tamper checks enabled', async () => {
    const r = await runDemo({ tamper: true, quiet: true });
    expect(r.ok).toBe(true);
  });

  it('rejects an invalid base64url receipt', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      recordPaymentReceipt(CHALLENGE_HEADER, '!!!not-base64url!!!', privateKey)
    ).rejects.toThrow();
  });

  it('rejects a receipt whose decoded body is not a JSON object', async () => {
    const { privateKey } = await generateKeypair();
    const notJson = Buffer.from('not json', 'utf8').toString('base64url');
    await expect(recordPaymentReceipt(CHALLENGE_HEADER, notJson, privateKey)).rejects.toThrow();
  });

  it('refuses to record a non-success payment receipt', async () => {
    const { privateKey } = await generateKeypair();
    const failed = b64u({ status: 'failed', method: 'example' });
    await expect(recordPaymentReceipt(CHALLENGE_HEADER, failed, privateKey)).rejects.toThrow(
      /non-success/
    );
  });

  it('rejects a header with no Payment challenge', async () => {
    const { privateKey } = await generateKeypair();
    const receipt = b64u({ status: 'success', method: 'example', reference: 'pay_1' });
    await expect(recordPaymentReceipt('Bearer realm="x"', receipt, privateKey)).rejects.toThrow(
      /no Payment challenge/
    );
    await expect(recordPaymentReceipt('', receipt, privateKey)).rejects.toThrow(
      /no Payment challenge/
    );
  });
});
