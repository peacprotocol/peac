/**
 * x402 v1/v2 dual-header read example.
 *
 * Demonstrates the priority fallback: PEAC-Receipt > PAYMENT-RESPONSE (v2) >
 * X-PAYMENT-RESPONSE (v1). Shows artifact metadata and isPeacReceipt flag.
 *
 * Run: npx tsx examples/x402-dual-header-read/demo.ts
 */

import { extractReceiptArtifactFromHeaders } from '@peac/adapter-x402';

// ---------------------------------------------------------------------------
// Mock headers (inline, no network)
// ---------------------------------------------------------------------------

const SAMPLE_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.c2lnbmF0dXJl';

const SAMPLE_V2_JSON = JSON.stringify({
  format: 'eip712',
  signature: '0xabc123',
  payload: { version: 1 },
});

const SAMPLE_V1_JSON = JSON.stringify({
  format: 'jws',
  signature: '0xdef456',
});

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

console.log('=== x402 v1/v2 Dual-Header Read Demo ===\n');

// 1. PEAC-Receipt (highest priority)
console.log('--- Scenario 1: PEAC-Receipt present ---');
const r1 = extractReceiptArtifactFromHeaders({ 'PEAC-Receipt': SAMPLE_JWS });
console.log('Source:', r1?.source);
console.log('Format:', r1?.artifactFormat);
console.log('Is PEAC receipt:', r1?.isPeacReceipt);
console.log();

// 2. PAYMENT-RESPONSE v2 (second priority)
console.log('--- Scenario 2: v2 header only ---');
const r2 = extractReceiptArtifactFromHeaders({ 'Payment-Response': SAMPLE_V2_JSON });
console.log('Source:', r2?.source);
console.log('Format:', r2?.artifactFormat);
console.log('Is PEAC receipt:', r2?.isPeacReceipt);
console.log();

// 3. X-PAYMENT-RESPONSE v1 (third priority)
console.log('--- Scenario 3: v1 header only ---');
const r3 = extractReceiptArtifactFromHeaders({ 'X-Payment-Response': SAMPLE_V1_JSON });
console.log('Source:', r3?.source);
console.log('Format:', r3?.artifactFormat);
console.log('Is PEAC receipt:', r3?.isPeacReceipt);
console.log();

// 4. PEAC-Receipt takes precedence over v2
console.log('--- Scenario 4: PEAC + v2 both present ---');
const r4 = extractReceiptArtifactFromHeaders({
  'PEAC-Receipt': SAMPLE_JWS,
  'Payment-Response': SAMPLE_V2_JSON,
});
console.log('Source:', r4?.source, '(PEAC wins)');
console.log();

// 5. v2 takes precedence over v1
console.log('--- Scenario 5: v2 + v1 both present ---');
const r5 = extractReceiptArtifactFromHeaders({
  'Payment-Response': SAMPLE_V2_JSON,
  'X-Payment-Response': SAMPLE_V1_JSON,
});
console.log('Source:', r5?.source, '(v2 wins)');
console.log();

// 6. PAYMENT-REQUIRED not in receipt path
console.log('--- Scenario 6: PAYMENT-REQUIRED only (not a receipt) ---');
const r6 = extractReceiptArtifactFromHeaders({ 'Payment-Required': '{"amount":"1000"}' });
console.log('Result:', r6 === null ? 'null (correctly excluded)' : 'unexpected');
console.log();

console.log('=== Done ===');
