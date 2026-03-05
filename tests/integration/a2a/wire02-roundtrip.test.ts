/**
 * A2A Wire 0.2 integration test: issueWire02 -> A2A carrier -> extract -> verifyLocal
 *
 * Verifies that Wire 0.2 receipts round-trip through the A2A metadata carrier
 * without loss or corruption. The carrier is wire-version agnostic (it transports
 * opaque JWS strings); this test confirms that property holds for Wire 0.2.
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';
import { attachReceiptToTaskStatus, extractReceiptFromTaskStatus } from '@peac/mappings-a2a';
import type { PeacEvidenceCarrier } from '@peac/kernel';

describe('A2A Wire 0.2 round-trip', () => {
  it('evidence receipt with commerce extension round-trips through A2A metadata', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'x402',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid: 'test-kid-001',
    });

    // Build carrier
    const receiptRef = await computeReceiptRef(jws);
    const carrier: PeacEvidenceCarrier = {
      receipt_ref: receiptRef,
      receipt_jws: jws,
    };

    // Attach to A2A TaskStatus
    const taskStatus = attachReceiptToTaskStatus({ id: 'task-001', status: 'completed' }, [
      carrier,
    ]);

    // Extract from A2A TaskStatus
    const extracted = extractReceiptFromTaskStatus(taskStatus);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts).toHaveLength(1);
    expect(extracted!.receipts[0].receipt_jws).toBe(jws);
    expect(extracted!.receipts[0].receipt_ref).toBe(receiptRef);

    // Verify the extracted JWS
    const result = await verifyLocal(extracted!.receipts[0].receipt_jws!, publicKey);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.variant).toBe('wire-02');
      expect(result.claims.kind).toBe('evidence');
      expect(result.claims.type).toBe('org.peacprotocol/payment');
      expect(result.claims.pillars).toEqual(['commerce']);
    }
  });

  it('evidence receipt with identity extension round-trips', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/identity_verified',
      pillars: ['identity'],
      extensions: {
        'org.peacprotocol/identity': {
          proof_ref: 'oidc-session-abc123',
        },
      },
      privateKey,
      kid: 'test-kid-002',
    });

    const receiptRef = await computeReceiptRef(jws);
    const carrier: PeacEvidenceCarrier = {
      receipt_ref: receiptRef,
      receipt_jws: jws,
    };

    const taskStatus = attachReceiptToTaskStatus({ id: 'task-002', status: 'completed' }, [
      carrier,
    ]);

    const extracted = extractReceiptFromTaskStatus(taskStatus);
    expect(extracted).not.toBeNull();

    const result = await verifyLocal(extracted!.receipts[0].receipt_jws!, publicKey);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.variant).toBe('wire-02');
      expect(result.claims.type).toBe('org.peacprotocol/identity_verified');
    }
  });

  it('evidence receipt with correlation extension round-trips', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws: parentJws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: 'test-kid-003',
    });

    // Issue a child receipt that correlates to the parent
    const parentRef = await computeReceiptRef(parentJws);
    const { jws: childJws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/consent',
      pillars: ['consent'],
      extensions: {
        'org.peacprotocol/correlation': {
          workflow_id: 'workflow-xyz',
          parent_jti: 'parent-jti-value',
        },
      },
      privateKey,
      kid: 'test-kid-003',
    });

    const childRef = await computeReceiptRef(childJws);

    // Bundle both carriers in a single A2A TaskStatus
    const carriers: PeacEvidenceCarrier[] = [
      { receipt_ref: parentRef, receipt_jws: parentJws },
      { receipt_ref: childRef, receipt_jws: childJws },
    ];

    const taskStatus = attachReceiptToTaskStatus({ id: 'task-003', status: 'completed' }, carriers);

    const extracted = extractReceiptFromTaskStatus(taskStatus);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts).toHaveLength(2);

    // Verify both
    for (const receipt of extracted!.receipts) {
      const result = await verifyLocal(receipt.receipt_jws!, publicKey);
      expect(result.valid).toBe(true);
    }
  });

  it('carrier handles both wire versions transparently (Wire 0.2 only verified)', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Issue Wire 0.2 receipt
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: 'test-kid-004',
    });

    const receiptRef = await computeReceiptRef(jws);
    const carrier: PeacEvidenceCarrier = {
      receipt_ref: receiptRef,
      receipt_jws: jws,
    };

    // Attach and extract
    const taskStatus = attachReceiptToTaskStatus({ id: 'task-004', status: 'completed' }, [
      carrier,
    ]);

    const extracted = extractReceiptFromTaskStatus(taskStatus);
    expect(extracted).not.toBeNull();

    // The JWS string is preserved byte-for-byte
    expect(extracted!.receipts[0].receipt_jws).toBe(jws);

    // Verify with verifyLocal (Wire 0.2 only)
    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.wireVersion).toBe('0.2');
    }
  });
});
