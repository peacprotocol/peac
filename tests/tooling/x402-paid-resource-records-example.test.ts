/**
 * Runtime smoke test for examples/x402-paid-resource-records.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here, not just its types. This imports the demo's exported runDemo(),
 * recordX402Settlement(), and buildX402Fixtures() in-process (vitest aliases
 * @peac/* to source, so no build or example install is required) and asserts:
 *   - the signed org.peacprotocol/payment record verifies offline and its
 *     offer-terms, signed-offer-artifact, signed-receipt-artifact,
 *     settlement-header, settlement-receipt-payload, and upstream-artifact
 *     digests all re-bind
 *   - the settlement is observed via both the header path and the
 *     offer-receipt body path, and the two channels are dual-channel consistent
 *   - a dual-channel mismatch (the header and body report different
 *     settlement artifacts) is rejected before issuance (fail closed)
 *   - the raw x402 offer/receipt JWS artifacts and the raw settlement header
 *     value are never logged or embedded in the signed payload
 *   - tampering with the record payload fails with E_INVALID_SIGNATURE, and
 *     tampering with the settlement receipt content after digesting breaks
 *     the digest re-bind
 *   - issuance refuses to proceed without an observed settlement artifact
 *     (offer-only data is not settlement evidence)
 *   - the commerce extension is strict: putting `network` inside
 *     org.peacprotocol/commerce (instead of the example-local extension)
 *     is rejected by issue()
 *
 * No network, no subprocess.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateKeypair, sign as signJws } from '@peac/crypto';
import { issue } from '@peac/protocol';
import { extractExtensionInfo, extractSignedReceiptFromSettlement } from '@peac/adapter-x402';
import {
  runDemo,
  recordX402Settlement,
  buildX402Fixtures,
} from '../../examples/x402-paid-resource-records/demo';

function decodePayload(jws: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'));
}

describe('x402-paid-resource-records example', () => {
  it('records, verifies offline, and re-binds the offer/settlement digests', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.signatureValid).toBe(true);
    expect(r.dualChannelConsistent).toBe(true);
    expect(r.offerTermsDigestMatches).toBe(true);
    expect(r.signedOfferArtifactDigestMatches).toBe(true);
    expect(r.signedReceiptArtifactDigestMatches).toBe(true);
    expect(r.settlementHeaderDigestMatches).toBe(true);
    expect(r.settlementReceiptPayloadDigestMatches).toBe(true);
    expect(r.upstreamArtifactDigestMatches).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('binds payment_rail = x402 and the settled amount/currency/network', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { challengeBody, settlementBody, settlementHeaders } =
      await buildX402Fixtures(facilitatorPrivateKey);
    const rec = await recordX402Settlement(
      challengeBody,
      settlementHeaders,
      settlementBody,
      issuerPrivateKey
    );
    const exts = decodePayload(rec.jws).extensions as Record<string, Record<string, unknown>>;
    expect(exts['org.peacprotocol/commerce'].payment_rail).toBe('x402');
    expect(exts['org.peacprotocol/commerce'].amount_minor).toBe('250000');
    expect(exts['org.peacprotocol/commerce'].currency).toBe('USDC');
    expect(exts['org.peacprotocol/commerce'].env).toBe('test');
    // network has no home in the strict org.peacprotocol/commerce schema.
    expect(exts['org.peacprotocol/commerce'].network).toBeUndefined();
    expect(exts['com.example/paid_resource'].network).toBe('eip155:8453');
    expect(exts['com.example/paid_resource'].offer_terms_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(exts['com.example/paid_resource'].signed_offer_artifact_digest).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    expect(exts['com.example/paid_resource'].signed_receipt_artifact_digest).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    expect(exts['com.example/paid_resource'].settlement_header_digest).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    expect(exts['com.example/paid_resource'].settlement_receipt_payload_digest).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    expect(exts['com.example/paid_resource'].upstream_artifact_digest).toBe(
      exts['com.example/paid_resource'].signed_receipt_artifact_digest
    );
  });

  it('never logs the raw x402 offer/receipt JWS or the raw settlement header', async () => {
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
    // A compact JWS or a base64url token is a long unbroken base64url run;
    // the demo only ever prints short sliced digest previews.
    expect(out).not.toMatch(/[A-Za-z0-9_-]{80,}/);
  });

  it('never embeds the raw offer/receipt JWS or the raw settlement header in the signed payload', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.rawArtifactLeak).toBe(false);
  });

  it('never embeds the known raw signed-offer JWS, signed-receipt JWS, or settlement header value in the signed record payload, and carries every digest field', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { challengeBody, settlementBody, settlementHeaders } =
      await buildX402Fixtures(facilitatorPrivateKey);
    const rec = await recordX402Settlement(
      challengeBody,
      settlementHeaders,
      settlementBody,
      issuerPrivateKey
    );

    const offerSignature = extractExtensionInfo(challengeBody)!.offers[0].signature;
    const receiptSignature = extractSignedReceiptFromSettlement(settlementBody)!.signature;
    const headerRawValue = String(
      (settlementHeaders as Record<string, string>)['PAYMENT-RESPONSE']
    );

    const payload = decodePayload(rec.jws);
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain(offerSignature);
    expect(payloadStr).not.toContain(receiptSignature);
    expect(payloadStr).not.toContain(headerRawValue);

    const ext = (payload.extensions as Record<string, Record<string, unknown>>)[
      'com.example/paid_resource'
    ];
    expect(ext.offer_terms_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ext.signed_offer_artifact_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ext.signed_receipt_artifact_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ext.settlement_header_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ext.settlement_receipt_payload_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ext.upstream_artifact_digest).toBe(ext.signed_receipt_artifact_digest);
  });

  it('refuses to record when the settlement header and body receipt artifacts disagree (dual-channel mismatch)', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { challengeBody, settlementBody, settlementHeaders } =
      await buildX402Fixtures(facilitatorPrivateKey);

    // A different, otherwise well-formed settlement receipt JWS (same
    // facilitator key, different transaction), standing in for a gateway
    // that reported a different settlement artifact on the header channel
    // than on the offer-receipt body channel.
    const otherReceiptJws = await signJws(
      {
        version: 1,
        network: 'eip155:8453',
        resourceUrl: 'https://api.example.com/v1/market-data/quote',
        payer: '0xabc1234567890abcdef1234567890abcdef123456',
        issuedAt: Math.floor(Date.now() / 1000),
        transaction: `0x${'a'.repeat(64)}`,
      },
      facilitatorPrivateKey,
      'x402-facilitator-key-2026'
    );
    const tamperedHeaders = { ...settlementHeaders, 'PAYMENT-RESPONSE': otherReceiptJws };

    await expect(
      recordX402Settlement(challengeBody, tamperedHeaders, settlementBody, issuerPrivateKey)
    ).rejects.toThrow(/settlement header and body receipt differ/);
  });

  it('detects a settlement-receipt content tamper as a digest mismatch, independent of the signature tamper', async () => {
    const r = await runDemo({ tamper: true, quiet: true });
    expect(r.tamper?.settlementReceiptPayloadDigestMatchesAfterTamper).toBe(false);
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

  it('refuses to record without an observed settlement artifact (offer-only data)', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { challengeBody } = await buildX402Fixtures(facilitatorPrivateKey);
    // A settlement body/headers with no offer-receipt receipt at all: offer-only data.
    const offerOnlySettlementBody = {
      success: true,
      resourceUrl: 'https://api.example.com/v1/market-data/quote',
    };
    await expect(
      recordX402Settlement(challengeBody, {}, offerOnlySettlementBody, issuerPrivateKey)
    ).rejects.toThrow(/settlement artifact/);
  });

  it('refuses to record when the 402 challenge carries no x402 offer', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { settlementBody, settlementHeaders } = await buildX402Fixtures(facilitatorPrivateKey);
    const noOfferChallenge = {
      accepts: [],
      resourceUrl: 'https://api.example.com/v1/market-data/quote',
    };
    await expect(
      recordX402Settlement(noOfferChallenge, settlementHeaders, settlementBody, issuerPrivateKey)
    ).rejects.toThrow(/no x402 offer/);
  });

  it('rejects a naive commerce extension carrying network (strict schema; network has no commerce field)', async () => {
    const { privateKey } = await generateKeypair();
    await expect(
      issue({
        iss: 'https://api.example.com',
        kind: 'evidence',
        type: 'org.peacprotocol/payment',
        pillars: ['commerce'],
        extensions: {
          'org.peacprotocol/commerce': {
            payment_rail: 'x402',
            amount_minor: '250000',
            currency: 'USDC',
            network: 'eip155:8453',
          },
        },
        privateKey,
        kid: 'record-key-2026',
      })
    ).rejects.toThrow();
  });
});
