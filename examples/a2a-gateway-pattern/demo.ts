/**
 * A2A Gateway Pattern Demo
 *
 * Demonstrates receipt issuance per A2A task state transition:
 * 1. Declare PEAC support in Agent Card
 * 2. Issue a receipt at each state transition (submitted, working, completed)
 * 3. Attach receipts to A2A TaskStatus metadata via carrier contract
 * 4. Extract and verify the full receipt chain
 *
 * Run: pnpm demo
 */

import { generateKeypair } from '@peac/crypto';
import type { PeacEvidenceCarrier } from '@peac/kernel';
import {
  attachReceiptToTaskStatus,
  extractReceiptFromTaskStatusAsync,
  hasPeacExtension,
  normalizeAgentCard,
  type A2ATaskStatusLike,
} from '@peac/mappings-a2a';
import { issue, verifyLocal } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';
import { A2AGrpcCarrierAdapter, GrpcMetadataKeys } from '@peac/transport-grpc';

import agentCard from './agent-card.json' with { type: 'json' };

// --- 1. Agent Card Declaration ---

console.log('=== Agent Card ===\n');
console.log('Agent:', agentCard.name);

const normalizedCard = normalizeAgentCard(agentCard);
if (!normalizedCard) {
  throw new Error(
    'Agent Card does not conform to A2A v1.0.0 shape (supportedInterfaces[] required)'
  );
}
console.log('Selected interface URL:', normalizedCard.url);
console.log('PEAC extension declared:', hasPeacExtension(normalizedCard.original));

// --- 2. Gateway keypair ---

const { publicKey, privateKey } = await generateKeypair();

// --- 3. Simulate A2A task state transitions ---

const taskId = 'task-2026-03-001';
const gateway = 'https://gateway.example.com';

const transitions: Array<{ state: string; reference: string }> = [
  { state: 'submitted', reference: `${taskId}/submitted` },
  { state: 'working', reference: `${taskId}/working` },
  { state: 'completed', reference: `${taskId}/completed` },
];

console.log('\n=== State Transitions ===\n');

const taskStatus: A2ATaskStatusLike = {
  state: 'submitted',
  metadata: {},
};

// Accumulate carriers across transitions for chain verification
const allCarriers: PeacEvidenceCarrier[] = [];

for (const transition of transitions) {
  taskStatus.state = transition.state;

  // Issue receipt for this transition
  const { jws } = await issue({
    iss: gateway,
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
    kid: 'gateway-key-2026-03',
  });

  const receiptRef = await computeReceiptRef(jws);
  console.log(`  ${transition.state}: receipt ${receiptRef.slice(0, 30)}...`);

  // Accumulate and attach all carriers to TaskStatus metadata
  allCarriers.push({ receipt_ref: receiptRef, receipt_jws: jws });
  attachReceiptToTaskStatus(taskStatus, allCarriers);
}

// --- 4. Consumer: extract and verify receipt chain ---

console.log('\n=== Receipt Extraction and Verification ===\n');

const extracted = await extractReceiptFromTaskStatusAsync(taskStatus);
if (!extracted) {
  console.error('No receipts found in TaskStatus metadata');
  process.exitCode = 1;
} else {
  console.log(`Found ${extracted.receipts.length} receipt(s)`);
  if (extracted.violations.length > 0) {
    console.log('Violations:', extracted.violations);
  }

  for (const carrier of extracted.receipts) {
    if (!carrier.receipt_jws) continue;

    const result = await verifyLocal(carrier.receipt_jws, publicKey);
    if (result.valid) {
      console.log(`  Verified: ref=${carrier.receipt_ref.slice(0, 30)}...`);
      console.log(`    issuer=${result.claims.iss}`);
      console.log(`    kind=${result.claims.kind}`);
    } else {
      console.log(`  Failed: ${result.code} ${result.message}`);
    }
  }
}

// --- 5. gRPC metadata-carrier transport: same receipt, different carrier ---
// This demonstrates metadata-carrier usage, not a full gRPC server/client.
// The same receipt attached via A2A metadata or gRPC metadata produces
// identical receipt_ref, proving transport-independent verification.

console.log('\n=== gRPC Metadata-Carrier Parity ===\n');

const grpcAdapter = new A2AGrpcCarrierAdapter();
const lastCarrier = allCarriers[allCarriers.length - 1];

// Attach the last receipt to gRPC metadata (metadata-carrier transport)
const grpcMetadata: Record<string, string | string[] | undefined> = {};
grpcAdapter.attach(grpcMetadata, [lastCarrier]);
console.log('gRPC metadata key:', GrpcMetadataKeys.RECEIPT);
console.log('gRPC receipt type:', grpcMetadata[GrpcMetadataKeys.RECEIPT_TYPE]);

// Extract from gRPC and verify identical receipt_ref
const grpcExtracted = grpcAdapter.extract(grpcMetadata);
if (grpcExtracted) {
  console.log(`gRPC receipt_ref: ${grpcExtracted.receipts[0].receipt_ref.slice(0, 30)}...`);
  console.log(`A2A  receipt_ref: ${lastCarrier.receipt_ref.slice(0, 30)}...`);
  console.log(
    'Cross-transport parity:',
    grpcExtracted.receipts[0].receipt_ref === lastCarrier.receipt_ref ? 'PASS' : 'FAIL'
  );

  // Verify the gRPC-extracted receipt
  const grpcResult = await verifyLocal(grpcExtracted.receipts[0].receipt_jws!, publicKey);
  console.log('gRPC-extracted receipt valid:', grpcResult.valid);
}

console.log('\n=== Summary ===\n');
console.log('The gateway pattern issues one receipt per state transition.');
console.log('Each receipt is attached to A2A TaskStatus metadata via the carrier contract.');
console.log(
  'The same receipt produces identical receipt_ref through both A2A and gRPC transports.'
);
console.log('Consumers extract and verify the full chain for end-to-end traceability.');
