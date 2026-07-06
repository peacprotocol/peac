/**
 * Runtime smoke test for examples/mcp-paid-tool-records.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here, not just its types. This imports the demo's exported runDemo(),
 * recordPaidToolCall(), and buildToolPaymentFixtures() in-process (vitest
 * aliases @peac/* to source, so no build or example install is required) and
 * asserts:
 *   - the signed org.peacprotocol/payment record, read back out of the MCP
 *     _meta carrier, verifies offline and its tool-args, tool-result, and
 *     settlement-receipt digests re-bind
 *   - a mismatched settlement receipt (wrong resource) fails offer/receipt
 *     consistency verification and refuses issuance
 *   - the raw tool call arguments are never logged, and the raw tool call
 *     arguments, the raw tool result, and the raw settlement receipt JWS
 *     artifact are never embedded in the signed payload or in _meta (the
 *     carried receipt JWS itself is expected there, not a leak)
 *   - tampering with the returned tool result after signing breaks the
 *     tool-result digest re-bind, independent of the signature tamper
 *   - tampering with the _meta-carried record payload fails with E_INVALID_SIGNATURE
 *   - issuance refuses to proceed without an observed settlement artifact
 *   - the commerce extension is strict: network has no home there
 *
 * No network, no subprocess.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateKeypair, sign as signJws } from '@peac/crypto';
import { issue } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';
import { attachReceiptToMeta } from '@peac/mappings-mcp';
import { extractSignedReceiptFromSettlement } from '@peac/adapter-x402';
import {
  runDemo,
  recordPaidToolCall,
  buildToolPaymentFixtures,
} from '../../examples/mcp-paid-tool-records/demo';

function decodePayload(jws: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'));
}

describe('mcp-paid-tool-records example', () => {
  it('records, carries in _meta, verifies offline, and re-binds the tool-args, tool-result, and settlement digests', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.signatureValid).toBe(true);
    expect(r.receiptInMeta).toBe(true);
    expect(r.metaReceiptVerifies).toBe(true);
    expect(r.toolArgsDigestMatches).toBe(true);
    expect(r.toolResultDigestMatches).toBe(true);
    expect(r.signedReceiptArtifactDigestMatches).toBe(true);
    expect(r.settlementReceiptPayloadDigestMatches).toBe(true);
    expect(r.upstreamArtifactDigestMatches).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('binds payment_rail = x402 and the tool_name / tool_args_digest / tool_result_digest', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { challengeBody, settlementBody } = await buildToolPaymentFixtures(facilitatorPrivateKey);
    const toolArgs = { symbol: 'ACME', depth: 'full' };
    const toolResult = {
      content: [{ type: 'text', text: 'market_data.premium_quote completed (paid).' }],
      structuredContent: { symbol: 'ACME', price: '198.42' },
    };
    const rec = await recordPaidToolCall(
      'market_data.premium_quote',
      toolArgs,
      toolResult,
      challengeBody,
      settlementBody,
      issuerPrivateKey
    );
    const exts = decodePayload(rec.jws).extensions as Record<string, Record<string, unknown>>;
    expect(exts['org.peacprotocol/commerce'].payment_rail).toBe('x402');
    expect(exts['org.peacprotocol/commerce'].amount_minor).toBe('500000');
    // network has no home in the strict org.peacprotocol/commerce schema.
    expect(exts['org.peacprotocol/commerce'].network).toBeUndefined();
    expect(exts['com.example/mcp_paid_tool'].tool_name).toBe('market_data.premium_quote');
    expect(exts['com.example/mcp_paid_tool'].tool_args_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(exts['com.example/mcp_paid_tool'].tool_result_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(exts['com.example/mcp_paid_tool'].signed_receipt_artifact_digest).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    expect(exts['com.example/mcp_paid_tool'].settlement_receipt_payload_digest).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    // upstream_artifact_digest binds the SIGNED receipt artifact, not the normalized payload.
    expect(exts['com.example/mcp_paid_tool'].upstream_artifact_digest).toBe(
      rec.signedReceiptArtifactDigest
    );
    expect(exts['com.example/mcp_paid_tool'].upstream_artifact_digest).not.toBe(
      rec.settlementReceiptPayloadDigest
    );
  });

  it('never logs the raw tool arguments; only the tool name and a digest', async () => {
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
    expect(out).not.toContain('ACME');
    expect(out).not.toContain('full');
    // A compact JWS or a base64url token is a long unbroken base64url run;
    // the demo only ever prints short sliced digest previews.
    expect(out).not.toMatch(/[A-Za-z0-9_-]{80,}/);
  });

  it('never embeds the raw tool arguments or the raw settlement receipt JWS in the signed payload or _meta', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.rawLeak).toBe(false);
  });

  it('never embeds the raw tool call arguments, the raw tool result, or the raw settlement receipt JWS in the signed payload or _meta (the carried receipt JWS itself is expected there, not a leak)', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { challengeBody, settlementBody } = await buildToolPaymentFixtures(facilitatorPrivateKey);
    const toolArgs = { symbol: 'ACME', depth: 'full' };
    const toolResult = {
      content: [{ type: 'text' as const, text: 'market_data.premium_quote completed (paid).' }],
      structuredContent: { symbol: 'ACME', price: '198.42' },
    };
    const rec = await recordPaidToolCall(
      'market_data.premium_quote',
      toolArgs,
      toolResult,
      challengeBody,
      settlementBody,
      issuerPrivateKey
    );
    const withReceipt = attachReceiptToMeta(
      { ...toolResult },
      { receipt_ref: await computeReceiptRef(rec.jws), receipt_jws: rec.jws }
    ) as { _meta?: Record<string, unknown> };
    const settledReceipt = extractSignedReceiptFromSettlement(settlementBody)!;

    const payloadStr = JSON.stringify(decodePayload(rec.jws));
    const metaStr = JSON.stringify(withReceipt._meta);

    expect(payloadStr).not.toContain('ACME');
    expect(payloadStr).not.toContain('full');
    expect(payloadStr).not.toContain(settledReceipt.signature);
    expect(metaStr).not.toContain('ACME');
    expect(metaStr).not.toContain('full');
    expect(metaStr).not.toContain(settledReceipt.signature);
    // The _meta carrier legitimately contains the PEAC receipt JWS itself
    // (org.peacprotocol/receipt_jws) by design; that is not a leak.
    expect(metaStr).toContain(rec.jws);
  });

  it('detects a tool-result content tamper as a digest mismatch, independent of the signature tamper', async () => {
    const r = await runDemo({ tamper: true, quiet: true });
    expect(r.tamper?.toolResultDigestMatchesAfterTamper).toBe(false);
  });

  it('detects _meta-carried record tampering with an invalid signature', async () => {
    const r = await runDemo({ tamper: true, quiet: true });
    expect(r.tamper?.payloadTamperValid).toBe(false);
    expect(r.tamper?.payloadTamperCode).toBe('E_INVALID_SIGNATURE');
  });

  it('reports an overall ok verdict with tamper checks enabled', async () => {
    const r = await runDemo({ tamper: true, quiet: true });
    expect(r.ok).toBe(true);
  });

  it('refuses to record a paid tool call without an observed settlement artifact', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { challengeBody } = await buildToolPaymentFixtures(facilitatorPrivateKey);
    const offerOnlySettlementBody = {
      success: true,
      resourceUrl: 'https://api.example.com/v1/tools/market_data.premium_quote',
    };
    await expect(
      recordPaidToolCall(
        'market_data.premium_quote',
        { symbol: 'ACME' },
        { content: [], structuredContent: {} },
        challengeBody,
        offerOnlySettlementBody,
        issuerPrivateKey
      )
    ).rejects.toThrow(/settlement artifact/);
  });

  it('refuses to record when there is no x402 payment challenge for the tool call', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { settlementBody } = await buildToolPaymentFixtures(facilitatorPrivateKey);
    const noOfferChallenge = {
      resourceUrl: 'https://api.example.com/v1/tools/market_data.premium_quote',
    };
    await expect(
      recordPaidToolCall(
        'market_data.premium_quote',
        { symbol: 'ACME' },
        { content: [], structuredContent: {} },
        noOfferChallenge,
        settlementBody,
        issuerPrivateKey
      )
    ).rejects.toThrow(/no x402 payment challenge/);
  });

  it('refuses to record when the settlement receipt resource does not match the offer (mismatched resource; consistency check)', async () => {
    const { privateKey: facilitatorPrivateKey } = await generateKeypair();
    const { privateKey: issuerPrivateKey } = await generateKeypair();
    const { challengeBody } = await buildToolPaymentFixtures(facilitatorPrivateKey);

    // A settlement receipt for a DIFFERENT resource than the offer: passes
    // wire validation but fails offer/receipt consistency
    // (receipt_resource_mismatch).
    const mismatchedReceiptJws = await signJws(
      {
        version: 1,
        network: 'eip155:8453',
        resourceUrl: 'https://api.example.com/v1/tools/other-tool',
        payer: '0x1230456789abcdef1234567890abcdef12345678',
        issuedAt: Math.floor(Date.now() / 1000),
        transaction: '0xfeedface1234567890abcdef1234567890abcdef1234567890abcdef1234ab',
      },
      facilitatorPrivateKey,
      'x402-facilitator-key-2026'
    );
    const mismatchedSettlementBody = {
      success: true,
      resourceUrl: 'https://api.example.com/v1/tools/market_data.premium_quote',
      extensions: {
        'offer-receipt': { info: { receipt: { format: 'jws', signature: mismatchedReceiptJws } } },
      },
    };

    await expect(
      recordPaidToolCall(
        'market_data.premium_quote',
        { symbol: 'ACME' },
        { content: [], structuredContent: {} },
        challengeBody,
        mismatchedSettlementBody,
        issuerPrivateKey
      )
    ).rejects.toThrow(/offer and receipt are inconsistent/);
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
            amount_minor: '500000',
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
