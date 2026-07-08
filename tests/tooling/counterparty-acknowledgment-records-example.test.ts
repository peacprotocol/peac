/**
 * Runtime smoke test for examples/counterparty-acknowledgment-records.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here (vitest aliases @peac/* to source, so no build/install is needed).
 * Asserts the happy path plus every fail-closed beat:
 *   - the linked pair verifies offline and P's receipt_ref re-binds
 *   - byte-flipping P breaks the link
 *   - a valid-but-misrepresenting Q (wrong acknowledged_iss/jti) fails
 *   - a valid Q with a wrong acknowledged_record_ref fails (digest mismatch)
 *   - a valid Q with a wrong role/scope fails (acknowledgment guard)
 *   - a valid Q with a wrong parent_jti/workflow_id fails (correlation guard)
 *   - a valid Q that mirrors mismatched commerce (amount / payment_rail / env) fails
 *   - a provider record with no acknowledgment extension is "not linked"
 *   - the demo logs no raw JWS payload or key material
 *
 * No network, no subprocess.
 */

import { describe, it, expect, vi } from 'vitest';
import { issue } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import {
  runDemo,
  issuePaymentRecordP,
  issueAcknowledgmentRecordQ,
  verifyLinkedPair,
  COMMERCE_EXT,
  CORRELATION_EXT,
  PAYER_ISS,
  PROVIDER_ISS,
  type CommerceFields,
} from '../../examples/counterparty-acknowledgment-records/demo';

const COMMERCE: CommerceFields = {
  payment_rail: 'x402',
  amount_minor: '1250',
  currency: 'USD',
  reference: 'ord_7f3a9c2e',
  env: 'test',
};
const WORKFLOW = 'wf_test_ack';

async function fixture() {
  const payer = await generateKeypair();
  const provider = await generateKeypair();
  const p = await issuePaymentRecordP({
    privateKey: payer.privateKey,
    publicKey: payer.publicKey,
    commerce: COMMERCE,
    workflowId: WORKFLOW,
  });
  return { payer, provider, p };
}

function flipPayload(jws: string): string {
  const [h, p, s] = jws.split('.');
  const bytes = Buffer.from(p, 'base64url');
  bytes[0] ^= 0x01;
  return `${h}.${bytes.toString('base64url')}.${s}`;
}

describe('counterparty-acknowledgment-records example', () => {
  it('runDemo links the pair and re-binds P receipt_ref', async () => {
    const r = await runDemo();
    expect(r.ok).toBe(true);
    expect(r.link.linked).toBe(true);
    expect(r.pReceiptRef).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('runDemo tamper beat breaks the link', async () => {
    const r = await runDemo({ tamper: true });
    expect(r.link.linked).toBe(true);
    expect(r.tamper?.linked).toBe(false);
  });

  it('honest Q links to P', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({ privateKey: provider.privateKey, p });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(true);
  });

  it('byte-flipping P breaks the link', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({ privateKey: provider.privateKey, p });
    const link = await verifyLinkedPair({
      pJws: flipPayload(p.jws),
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(['p-invalid', 'digest-mismatch']).toContain(link.reason);
  });

  it('misrepresentation guard: valid Q with wrong acknowledged_iss fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      acknowledgedIss: 'https://evil.example',
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('identity-mismatch');
  });

  it('misrepresentation guard: valid Q with wrong acknowledged_jti fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      acknowledgedJti: '01HZZZZZZZZZZZZZZZZZZZZZZZZ',
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('identity-mismatch');
  });

  it('digest mismatch: valid Q with wrong acknowledged_record_ref fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      acknowledgedRecordRef: `sha256:${'0'.repeat(64)}`,
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('digest-mismatch');
  });

  it('commerce-field guard: valid Q mirroring a mismatched amount fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      commerce: { ...COMMERCE, amount_minor: '9999' },
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('commerce-mismatch');
  });

  it('acknowledgment guard: valid Q with wrong role fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      acknowledgingRole: 'payer',
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('acknowledgment-mismatch');
  });

  it('acknowledgment guard: valid Q with wrong scope fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      acknowledgmentScope: 'unexpected-scope',
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('acknowledgment-mismatch');
  });

  it('commerce-field guard: valid Q mirroring a mismatched payment_rail fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      commerce: { ...COMMERCE, payment_rail: 'paymentauth' },
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('commerce-mismatch');
  });

  it('commerce-field guard: valid Q mirroring a mismatched env fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      commerce: { ...COMMERCE, env: 'live' },
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('commerce-mismatch');
  });

  it('correlation guard: valid Q with wrong parent_jti fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      parentJti: '01HWRONGWRONGWRONGWRONGWRO',
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('correlation-mismatch');
  });

  it('correlation guard: valid Q with wrong workflow_id fails', async () => {
    const { payer, provider, p } = await fixture();
    const q = await issueAcknowledgmentRecordQ({
      privateKey: provider.privateKey,
      p,
      workflowId: 'wf_a_different_workflow',
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('correlation-mismatch');
  });

  it('a provider record with no acknowledgment extension is not linked', async () => {
    const { payer, provider, p } = await fixture();
    // A plain provider payment record: valid, but carries no acknowledgment.
    const { jws: plainQ } = await issue({
      iss: PROVIDER_ISS,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        [COMMERCE_EXT]: COMMERCE,
        [CORRELATION_EXT]: { workflow_id: WORKFLOW },
      },
      privateKey: provider.privateKey,
      kid: 'provider-key-2026',
    });
    const link = await verifyLinkedPair({
      pJws: p.jws,
      qJws: plainQ,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    expect(link.linked).toBe(false);
    expect(link.reason).toBe('not-linked');
  });

  it('P and Q have distinct issuers (single issuer signature each)', async () => {
    const { p } = await fixture();
    expect(p.iss).toBe(PAYER_ISS);
    expect(PROVIDER_ISS).not.toBe(PAYER_ISS);
  });

  it('the demo logs no raw JWS payload or key material', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runDemo();
      const out = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(out).not.toMatch(/privateKey|BEGIN [A-Z ]*PRIVATE KEY/);
      // a compact JWS has three base64url segments joined by dots; the demo
      // prints digests and identity claims, never a full record JWS.
      expect(out).not.toMatch(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/);
    } finally {
      spy.mockRestore();
    }
  });
});
