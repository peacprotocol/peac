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
  type A2ATaskStatusLike,
} from '@peac/mappings-a2a';
import { issue, verifyLocal } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';

import agentCard from './agent-card.json' with { type: 'json' };

// --- 1. Agent Card Declaration ---

console.log('=== Agent Card ===\n');
console.log('Agent:', agentCard.name);
console.log('PEAC extension declared:', hasPeacExtension(agentCard));

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

console.log('\n=== Summary ===\n');
console.log('The gateway pattern issues one receipt per state transition.');
console.log('Each receipt is attached to A2A TaskStatus metadata via the carrier contract.');
console.log('Consumers extract and verify the full chain for end-to-end traceability.');
