/**
 * ERC-8004 Feedback Demo
 *
 * Demonstrates how to use PEAC records as evidence behind
 * ERC-8004 reputation signals.
 *
 * Uses RFC 8785 JCS (JSON Canonicalization Scheme) for deterministic
 * byte representation, ensuring feedbackHash matches across implementations.
 */

import { keccak256 } from 'viem';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(__dirname, '..', 'generated');

// Use createRequire for ESM-safe import of CJS package
const require = createRequire(import.meta.url);
const { canonicalize } = require('@peac/crypto');

// ERC-8004 Contract Addresses (Example - REPLACE with actual addresses before production use)
// See: https://github.com/erc-8004/erc-8004-contracts for current deployments
// Using zero address as syntactically valid placeholder for tooling compatibility
const ERC8004_IDENTITY_REGISTRY = '0x0000000000000000000000000000000000000000';
const ERC8004_REPUTATION_REGISTRY = '0x0000000000000000000000000000000000000000';

// Example agent registered on ERC-8004
// In production, use actual registered agent ID and verified registry address
const EXAMPLE_AGENT = {
  agentRegistry: `eip155:1:${ERC8004_IDENTITY_REGISTRY}`,
  agentId: 1234, // Example tokenId
};

interface PeacReceipt {
  typ: string;
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp?: number;
  jti: string;
  amt: number;
  cur: string;
  payment: {
    rail: string;
    asset: string;
    env: string;
    reference: string;
    evidence: {
      network: string;
      payTo: string;
      fromAddress: string;
    };
  };
  purpose_declared: string[];
  purpose_enforced: string;
}

/**
 * On-chain transaction arguments for giveFeedback().
 *
 * These are the actual parameters passed to the contract call.
 * feedbackHash commits to the bytes at feedbackURI.
 */
interface GiveFeedbackTxArgs {
  agentId: number;
  value: number;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  feedbackHash: `0x${string}`;
}

/**
 * Metadata for routing and indexing (not contract arguments).
 *
 * agentRegistry identifies which Identity Registry the agent is registered with.
 * This is used to locate the correct Reputation Registry for the giveFeedback() call.
 */
interface IndexMetadata {
  agentRegistry: string;
  reputationRegistry: string;
  issuer: string;
  subject: string;
  receiptId: string;
  paymentNetwork: string;
}

/**
 * Parse chainId from CAIP-2 network identifier.
 *
 * @param network - CAIP-2 identifier (e.g., "eip155:8453")
 * @returns chainId as string
 * @throws Error if network format is invalid
 */
function parseChainId(network: string): string {
  const parts = network.split(':');
  if (parts.length !== 2 || !parts[1]) {
    throw new Error(
      `Invalid CAIP-2 network format: "${network}". Expected "namespace:chainId" (e.g., "eip155:8453").`
    );
  }
  return parts[1];
}

/**
 * Compute keccak256 hash for ERC-8004 feedbackHash field.
 *
 * Uses RFC 8785 JCS canonicalization for deterministic byte representation.
 * This ensures the hash matches regardless of JSON key order or formatting.
 */
function computeFeedbackHash(canonicalBytes: Uint8Array): `0x${string}` {
  return keccak256(canonicalBytes);
}

/**
 * Generate giveFeedback() transaction arguments and index metadata.
 *
 * The feedbackHash is computed over the canonical bytes that will be
 * served at feedbackURI.
 *
 * Returns two objects:
 * - txArgs: actual contract call arguments for giveFeedback()
 * - metadata: routing and indexing info (not contract arguments)
 */
function generateFeedbackData(
  receipt: PeacReceipt,
  canonicalBytes: Uint8Array,
  agentRegistry: string,
  reputationRegistry: string,
  agentId: number,
  feedbackURI: string
): { txArgs: GiveFeedbackTxArgs; metadata: IndexMetadata } {
  const feedbackHash = computeFeedbackHash(canonicalBytes);

  const txArgs: GiveFeedbackTxArgs = {
    agentId,
    value: receipt.amt,
    valueDecimals: 0,
    tag1: 'payment',
    tag2: receipt.payment.rail,
    endpoint: receipt.sub,
    feedbackURI,
    feedbackHash,
  };

  const metadata: IndexMetadata = {
    agentRegistry,
    reputationRegistry,
    issuer: receipt.iss,
    subject: receipt.sub,
    receiptId: receipt.jti,
    paymentNetwork: receipt.payment.evidence.network,
  };

  return { txArgs, metadata };
}

async function main() {
  console.log('=============================================');
  console.log('    ERC-8004 Feedback Demo');
  console.log('=============================================\n');

  // Step 1: Load PEAC receipt
  console.log('1. Loading PEAC Receipt...\n');
  const receiptPath = join(__dirname, 'peac-receipt.json');
  const receipt: PeacReceipt = JSON.parse(readFileSync(receiptPath, 'utf-8'));

  console.log(`   Issuer: ${receipt.iss}`);
  console.log(`   Subject: ${receipt.sub}`);
  console.log(`   Amount: ${receipt.amt} ${receipt.cur} (${receipt.payment.asset})`);
  console.log(`   Rail: ${receipt.payment.rail}`);
  console.log(`   Network: ${receipt.payment.evidence.network}`);
  console.log(`   Receipt ID: ${receipt.jti}\n`);

  // Step 2: Serialize to canonical bytes (RFC 8785 JCS)
  console.log('2. Serializing to Canonical Bytes (RFC 8785 JCS)...\n');
  const canonicalJson: string = canonicalize(receipt);
  const canonicalBytes = new TextEncoder().encode(canonicalJson);
  console.log(`   Canonical JSON length: ${canonicalJson.length} chars`);
  console.log(`   Canonical bytes length: ${canonicalBytes.length} bytes\n`);

  // Step 3: Write canonical payload (this is what gets served at feedbackURI)
  console.log('3. Writing Canonical Payload...\n');
  if (!existsSync(GENERATED_DIR)) {
    mkdirSync(GENERATED_DIR, { recursive: true });
  }
  const canonicalPath = join(GENERATED_DIR, 'peac-receipt.canonical.json');
  writeFileSync(canonicalPath, canonicalJson);
  console.log(`   Written to: ${canonicalPath}`);
  console.log('   (These exact bytes must be served at feedbackURI)\n');

  // Step 4: Compute feedback hash
  console.log('4. Computing Feedback Hash...\n');
  const feedbackHash = computeFeedbackHash(canonicalBytes);
  console.log(`   keccak256: ${feedbackHash}\n`);

  // Step 5: Generate giveFeedback() transaction arguments and metadata
  console.log('5. Generating giveFeedback() Transaction Arguments...\n');
  const feedbackURI = `https://api.example.com/peac/receipts/${receipt.jti}`;

  const { txArgs, metadata } = generateFeedbackData(
    receipt,
    canonicalBytes,
    EXAMPLE_AGENT.agentRegistry,
    ERC8004_REPUTATION_REGISTRY,
    EXAMPLE_AGENT.agentId,
    feedbackURI
  );

  console.log('   Contract Call Arguments (giveFeedback):');
  console.log(JSON.stringify(txArgs, null, 2));

  // Step 6: Write transaction args file
  const txArgsPath = join(GENERATED_DIR, 'giveFeedback-tx-args.json');
  writeFileSync(txArgsPath, JSON.stringify(txArgs, null, 2));
  console.log(`\n   Written to: ${txArgsPath}`);

  // Step 7: Write index metadata file
  console.log('\n   Index Metadata (for routing/indexing):');
  console.log(JSON.stringify(metadata, null, 2));
  const metadataPath = join(GENERATED_DIR, 'index-metadata.json');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`\n   Written to: ${metadataPath}`);

  // Step 8: Show proof of payment context
  console.log('\n=============================================');
  console.log('    Proof of Payment Context');
  console.log('=============================================\n');
  const chainId = parseChainId(receipt.payment.evidence.network);
  console.log('   The PEAC receipt contains proof of payment:');
  console.log(`   - From: ${receipt.payment.evidence.fromAddress}`);
  console.log(`   - To: ${receipt.payment.evidence.payTo}`);
  console.log(`   - Chain: ${chainId}`);
  console.log(`   - Tx: ${receipt.payment.reference}\n`);

  // Step 9: Show next steps
  console.log('=============================================');
  console.log('    Next Steps');
  console.log('=============================================\n');
  console.log('To submit this feedback to ERC-8004:');
  console.log('');
  console.log('1. Host the canonical payload at the feedbackURI');
  console.log('   - Serve the EXACT bytes from peac-receipt.canonical.json');
  console.log('   - Do NOT apply compression (no gzip/brotli/etc.)');
  console.log('   - Or use content-addressed storage (IPFS, etc.)');
  console.log('');
  console.log('2. Call giveFeedback() on the Reputation Registry:');
  console.log(`   - Registry: ${ERC8004_REPUTATION_REGISTRY}`);
  console.log(`   - agentId: ${txArgs.agentId}`);
  console.log(`   - value: ${txArgs.value}`);
  console.log(`   - feedbackURI: ${txArgs.feedbackURI}`);
  console.log(`   - feedbackHash: ${txArgs.feedbackHash}`);
  console.log('');
  console.log('Note: For content-addressed URIs (IPFS, etc.), feedbackHash can be bytes32(0).');
  console.log('');
  console.log('See https://eips.ethereum.org/EIPS/eip-8004 for details.');
}

main().catch(console.error);
