/**
 * Cross-transport parity: A2A metadata carrier vs gRPC metadata carrier.
 *
 * Proves that the same receipt produces identical receipt_ref regardless
 * of transport. Also tests PKCE -> gRPC carrier -> extract -> verify flow.
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';
import type { PeacEvidenceCarrier } from '@peac/kernel';

// A2A carrier (HTTP transport)
import { attachReceiptToTaskStatus, extractReceiptFromTaskStatus } from '@peac/mappings-a2a';

// gRPC carrier
import {
  A2AGrpcCarrierAdapter,
  addReceiptToMetadata,
  extractReceiptFromMetadata,
  GrpcMetadataKeys,
} from '@peac/transport-grpc';

// PKCE auth
import { generatePKCEChallenge, computeS256Challenge, fromA2AAuthEvent } from '@peac/mappings-a2a';

// Cross-transport parity matters because verifiers must not depend on
// carrier-specific receipt identities. A receipt_ref computed from the
// same JWS must be identical regardless of whether the carrier used
// A2A metadata, gRPC metadata, or any other transport.

describe('cross-transport receipt_ref parity', () => {
  it('A2A metadata and gRPC metadata produce identical receipt_ref and JWS for same receipt', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: 'https://gateway.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '2500',
          currency: 'USD',
        },
      },
      privateKey,
      kid: 'cross-transport-kid',
    });

    const canonicalRef = await computeReceiptRef(jws);

    // --- A2A carrier path ---
    const a2aCarrier: PeacEvidenceCarrier = {
      receipt_ref: canonicalRef,
      receipt_jws: jws,
    };
    const taskStatus = attachReceiptToTaskStatus({ state: 'completed', metadata: {} }, [
      a2aCarrier,
    ]);
    const a2aExtracted = extractReceiptFromTaskStatus(taskStatus);
    expect(a2aExtracted).not.toBeNull();
    const a2aRef = a2aExtracted!.receipts[0].receipt_ref;

    // --- gRPC carrier path ---
    const grpcAdapter = new A2AGrpcCarrierAdapter();
    const grpcMetadata: Record<string, string | string[] | undefined> = {};
    grpcAdapter.attach(grpcMetadata, [a2aCarrier]);
    const grpcExtracted = grpcAdapter.extract(grpcMetadata);
    expect(grpcExtracted).not.toBeNull();
    const grpcRef = grpcExtracted!.receipts[0].receipt_ref;

    // --- Parity assertions: both ref and JWS must be identical ---
    expect(grpcRef).toBe(a2aRef);
    expect(grpcRef).toBe(canonicalRef);
    expect(grpcExtracted!.receipts[0].receipt_jws).toBe(a2aExtracted!.receipts[0].receipt_jws);

    // --- Both verify to the same claims ---
    const a2aResult = await verifyLocal(a2aExtracted!.receipts[0].receipt_jws!, publicKey);
    const grpcResult = await verifyLocal(grpcExtracted!.receipts[0].receipt_jws!, publicKey);
    expect(a2aResult.valid).toBe(true);
    expect(grpcResult.valid).toBe(true);
    if (a2aResult.valid && grpcResult.valid) {
      expect(a2aResult.claims.iss).toBe(grpcResult.claims.iss);
      expect(a2aResult.claims.jti).toBe(grpcResult.claims.jti);
    }
  });

  it('gRPC carrier preserves JWS byte-for-byte', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issueWire02({
      iss: 'https://gateway.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/access',
      extensions: {
        'org.peacprotocol/access': {
          resource: 'https://api.example.com/tasks',
          action: 'tasks/send',
          decision: 'allow',
        },
      },
      privateKey,
      kid: 'byte-parity-kid',
    });

    // Attach via low-level helper
    const metadata: Record<string, string | string[]> = {};
    addReceiptToMetadata(metadata, jws);

    // Extract raw
    const extracted = extractReceiptFromMetadata(metadata);
    expect(extracted).toBe(jws);

    // Extract via adapter
    const adapter = new A2AGrpcCarrierAdapter();
    const result = adapter.extract(metadata);
    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(jws);

    // Verify
    const verifyResult = await verifyLocal(jws, publicKey);
    expect(verifyResult.valid).toBe(true);
  });

  it('gRPC carrier defaults to Wire 0.2 receipt type', () => {
    const metadata: Record<string, string | string[]> = {};
    addReceiptToMetadata(metadata, 'test-jws');
    expect(metadata[GrpcMetadataKeys.RECEIPT_TYPE]).toBe('interaction-record+jwt');
  });
});

describe('PKCE -> gRPC carrier -> extract -> verify flow', () => {
  it('completes end-to-end: PKCE challenge, auth observation, receipt via gRPC', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Step 1: PKCE challenge generation
    const pkce = await generatePKCEChallenge();
    expect(pkce.method).toBe('S256');
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);

    // Step 2: Verify S256 challenge is correct
    const recomputed = await computeS256Challenge(pkce.verifier);
    expect(recomputed).toBe(pkce.challenge);

    // Step 3: Auth event observation
    const authEvidence = fromA2AAuthEvent({
      method: 'oauth2_pkce',
      resource: 'https://agent.example.com/tasks',
      action: 'tasks/send',
      grantedScopes: ['read', 'write'],
      authServer: 'https://auth.example.com',
    });
    expect(authEvidence.extension.decision).toBe('review');
    expect(authEvidence.evidence.auth_method).toBe('oauth2_pkce');

    // Step 4: Issue access evidence receipt
    const { jws } = await issueWire02({
      iss: 'https://gateway.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/access',
      pillars: ['access'],
      extensions: {
        [authEvidence.extensionKey]: authEvidence.extension,
      },
      privateKey,
      kid: 'pkce-flow-kid',
    });

    // Step 5: Attach to gRPC metadata via carrier adapter
    const adapter = new A2AGrpcCarrierAdapter();
    const receiptRef = await computeReceiptRef(jws);
    const carrier: PeacEvidenceCarrier = {
      receipt_ref: receiptRef,
      receipt_jws: jws,
    };

    const grpcMetadata: Record<string, string | string[] | undefined> = {};
    adapter.attach(grpcMetadata, [carrier]);
    expect(grpcMetadata[GrpcMetadataKeys.RECEIPT]).toBe(jws);

    // Step 6: Extract from gRPC metadata
    const extracted = adapter.extract(grpcMetadata);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts[0].receipt_ref).toBe(receiptRef);

    // Step 7: Verify the receipt
    const result = await verifyLocal(extracted!.receipts[0].receipt_jws!, publicKey);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.kind).toBe('evidence');
      expect(result.claims.type).toBe('org.peacprotocol/access');
      expect(result.claims.pillars).toEqual(['access']);
    }
  });
});
