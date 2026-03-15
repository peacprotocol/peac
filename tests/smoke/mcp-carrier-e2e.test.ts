/**
 * MCP Carrier E2E Smoke Test
 *
 * Validates the most adoption-critical surface: the full round-trip from
 * receipt issuance through MCP _meta carrier attachment, extraction, and
 * offline verification.
 *
 * No network calls, no clock dependencies. Random keypair per run;
 * failures are reproducible by re-running (no external state).
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';
import type { PeacEvidenceCarrier } from '@peac/kernel';
import {
  attachReceiptToMeta,
  extractReceiptFromMeta,
  extractReceiptFromMetaAsync,
  META_KEY_RECEIPT_REF,
  META_KEY_RECEIPT_JWS,
  META_KEY_LEGACY_RECEIPT,
} from '@peac/mappings-mcp';

/**
 * Issue a test receipt with fixed claim parameters (random keypair).
 * Returns the JWS and the keypair used for verification.
 */
async function issueTestReceipt(opts?: { reference?: string }) {
  const { privateKey, publicKey } = await generateKeypair();
  const kid = '2026-02-24T00:00:00.000Z';

  const { jws } = await issueWire02({
    iss: 'https://api.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'stripe',
        amount_minor: '1000',
        currency: 'USD',
      },
    },
    privateKey,
    kid,
  });

  return { jws, publicKey, kid };
}

describe('MCP carrier e2e round-trip', () => {
  it('issue -> computeReceiptRef -> attach -> extractAsync -> verifyLocal', async () => {
    const { jws, publicKey, kid } = await issueTestReceipt();

    // Compute receipt reference (canonical, shared helper)
    const receiptRef = await computeReceiptRef(jws);
    expect(receiptRef).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Attach to MCP _meta
    const carrier: PeacEvidenceCarrier = {
      receipt_ref: receiptRef,
      receipt_jws: jws,
    };
    const mcpResult: Record<string, unknown> = { content: [{ type: 'text', text: 'ok' }] };
    attachReceiptToMeta(mcpResult, carrier);

    // Verify _meta keys are set
    const meta = mcpResult._meta as Record<string, unknown>;
    expect(meta[META_KEY_RECEIPT_REF]).toBe(receiptRef);
    expect(meta[META_KEY_RECEIPT_JWS]).toBe(jws);

    // Extract with async validation (DD-129 consistency check)
    const extracted = await extractReceiptFromMetaAsync(mcpResult);
    expect(extracted).not.toBeNull();
    expect(extracted!.violations).toHaveLength(0);
    expect(extracted!.receipts).toHaveLength(1);
    expect(extracted!.receipts[0].receipt_ref).toBe(receiptRef);
    expect(extracted!.receipts[0].receipt_jws).toBe(jws);
    expect(extracted!.meta.transport).toBe('mcp');

    // Verify receipt offline
    const result = await verifyLocal(jws, publicKey, {
      issuer: 'https://api.example.com',
      audience: 'https://client.example.com',
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.variant).toBe('wire-02');
      expect(result.kid).toBe(kid);
    }
  });

  it('rejects tampered receipt_ref with specific violation (DD-129)', async () => {
    const { jws } = await issueTestReceipt({ reference: 'tx_tamper' });

    // Attach with intentionally wrong receipt_ref
    const mcpResult: Record<string, unknown> = {
      _meta: {
        [META_KEY_RECEIPT_REF]:
          'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        [META_KEY_RECEIPT_JWS]: jws,
      },
    };

    const extracted = await extractReceiptFromMetaAsync(mcpResult);
    expect(extracted).not.toBeNull();
    expect(extracted!.violations.length).toBeGreaterThan(0);
    expect(extracted!.violations[0]).toContain('receipt_ref');
  });

  it('extracts legacy org.peacprotocol/receipt and computes receipt_ref (Polish B)', async () => {
    const { jws } = await issueTestReceipt({ reference: 'tx_legacy' });

    // Legacy v0.10.13 format: single receipt key
    const mcpResult: Record<string, unknown> = {
      _meta: {
        [META_KEY_LEGACY_RECEIPT]: jws,
      },
    };

    // Async extraction computes receipt_ref from JWS
    const extracted = await extractReceiptFromMetaAsync(mcpResult);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts).toHaveLength(1);
    expect(extracted!.receipts[0].receipt_jws).toBe(jws);
    expect(extracted!.receipts[0].receipt_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(extracted!.violations).toHaveLength(0);

    // Verify the computed receipt_ref matches canonical computation
    const expectedRef = await computeReceiptRef(jws);
    expect(extracted!.receipts[0].receipt_ref).toBe(expectedRef);
  });

  it('round-trip preserves receipt_ref and receipt_jws exactly', async () => {
    const { jws } = await issueTestReceipt({ reference: 'tx_roundtrip' });
    const receiptRef = await computeReceiptRef(jws);

    const carrier: PeacEvidenceCarrier = {
      receipt_ref: receiptRef,
      receipt_jws: jws,
    };

    const mcpResult: Record<string, unknown> = { content: [] };
    attachReceiptToMeta(mcpResult, carrier);

    // Sync extraction (structural only)
    const extracted = extractReceiptFromMeta(mcpResult);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts[0].receipt_ref).toBe(carrier.receipt_ref);
    expect(extracted!.receipts[0].receipt_jws).toBe(carrier.receipt_jws);
  });

  it('sync extract returns null for missing _meta', () => {
    const mcpResult: Record<string, unknown> = { content: [] };
    const extracted = extractReceiptFromMeta(mcpResult);
    expect(extracted).toBeNull();
  });
});
