# ERC-8004 Feedback Example

This example demonstrates how to use PEAC records as the evidence payload behind ERC-8004 reputation signals.

## Overview

ERC-8004 (Trustless Agents) is an Ethereum standard for on-chain agent identity and reputation. The `giveFeedback()` function accepts a `feedbackURI` and `feedbackHash` -- the URI points to a payload, and the hash commits to its exact bytes. PEAC records are a natural fit for this evidence-pointer pattern.

This example shows:

1. Loading a PEAC receipt
2. Serializing to canonical bytes (RFC 8785 JCS)
3. Computing keccak256 feedback hash over those exact bytes
4. Generating the `giveFeedback()` transaction parameters

## Files

| File                    | Description                       |
| ----------------------- | --------------------------------- |
| `src/demo.ts`           | End-to-end demonstration          |
| `src/peac-receipt.json` | Sample PEAC receipt (source data) |

Generated files (after running demo, in `generated/` directory):

| File                                    | Description                                       |
| --------------------------------------- | ------------------------------------------------- |
| `generated/peac-receipt.canonical.json` | Canonical bytes to serve at feedbackURI           |
| `generated/giveFeedback-tx-args.json`   | Contract call arguments for `giveFeedback()`      |
| `generated/index-metadata.json`         | Routing and indexing metadata (not contract args) |

The `generated/` directory is gitignored to avoid dirtying the working tree on each demo run.

## Running the Example

```bash
# From the repository root (installs all workspace dependencies)
pnpm install

# Run the demo
cd examples/erc8004-feedback
pnpm demo
```

## Example Output

```text
=============================================
    ERC-8004 Feedback Demo
=============================================

1. Loading PEAC Receipt...

   Issuer: https://api.example.com
   Subject: https://api.example.com/v1/weather
   Amount: 100 USD (USDC)
   Rail: x402
   Network: eip155:8453
   Receipt ID: 01JJQX5KQHV7Z3M8R4N6P9W2Y1

2. Serializing to Canonical Bytes (RFC 8785 JCS)...

   Canonical JSON length: 482 chars
   Canonical bytes length: 482 bytes

3. Writing Canonical Payload...

   Written to: generated/peac-receipt.canonical.json
   (These exact bytes must be served at feedbackURI)

4. Computing Feedback Hash...

   keccak256: 0x16f790d1495b179fb5fd389a4853bb1fdf331399d757f1b9eb1903ab37fc48a1

5. Generating giveFeedback() Transaction Arguments...

   Contract Call Arguments (giveFeedback):
   {
     "agentId": 1234,
     "value": 100,
     "valueDecimals": 0,
     "tag1": "payment",
     "tag2": "x402",
     "endpoint": "https://api.example.com/v1/weather",
     "feedbackURI": "https://api.example.com/peac/receipts/...",
     "feedbackHash": "0x16f790d1..."
   }

   Written to: generated/giveFeedback-tx-args.json

   Index Metadata (for routing/indexing):
   {
     "agentRegistry": "eip155:1:0x0000000000000000000000000000000000000000",
     "reputationRegistry": "0x0000000000000000000000000000000000000000",
     "issuer": "https://api.example.com",
     "subject": "https://api.example.com/v1/weather",
     "receiptId": "01JJQX5KQHV7Z3M8R4N6P9W2Y1",
     "paymentNetwork": "eip155:8453"
   }

   Written to: generated/index-metadata.json
```

The demo produces two separate files:

- **`giveFeedback-tx-args.json`**: Actual arguments for the `giveFeedback()` contract call
- **`index-metadata.json`**: Metadata for routing (which registry) and indexing (issuer, subject, etc.)

## Integration Pattern

### Step 1: Generate PEAC Record

Create a PEAC receipt, attestation, or dispute bundle for the agent interaction.

```typescript
import { issue } from '@peac/protocol';

const receipt = await issue({
  issuer: 'https://api.example.com',
  audience: 'https://agent.example.com',
  subject: 'https://api.example.com/v1/weather',
  payment: {
    rail: 'x402',
    asset: 'USDC',
    amount: '100',
    reference: '0xTransactionHash...',
  },
});
```

### Step 2: Serialize to Canonical Bytes

Use RFC 8785 JCS for deterministic serialization:

```typescript
import { canonicalize } from '@peac/crypto';

const canonicalJson = canonicalize(receipt);
const canonicalBytes = new TextEncoder().encode(canonicalJson);
```

### Step 3: Compute Feedback Hash

ERC-8004 expects `feedbackHash` as keccak256 of the exact bytes at `feedbackURI`:

```typescript
import { keccak256 } from 'viem';

// Hash the canonical bytes (NOT the receipt object directly)
const feedbackHash = keccak256(canonicalBytes);
```

### Step 4: Host the Payload

Serve the canonical bytes at your `feedbackURI`:

- Serve the EXACT bytes (no reformatting, no pretty-printing)
- Do NOT apply compression (no gzip/brotli/etc.)
- Or use content-addressed storage (IPFS, etc.)

**Important:** The hash commits to the exact bytes. Any transformation (compression, reformatting) will break verification.

### Step 5: Submit to Reputation Registry

Call `giveFeedback()` on the Reputation Registry with the transaction parameters:

```typescript
// Transaction parameters (NOT a file to store)
const txParams = {
  agentId: 1234,
  value: 100,
  valueDecimals: 0,
  tag1: 'payment',
  tag2: 'x402',
  endpoint: 'https://api.example.com/v1/weather',
  feedbackURI: 'https://api.example.com/peac/receipts/abc123',
  feedbackHash: feedbackHash,
};

// Submit using viem or ethers
// REPLACE with actual address from https://github.com/erc-8004/erc-8004-contracts
const REPUTATION_REGISTRY = '0x0000000000000000000000000000000000000000';
```

## Key Points

1. **Payload vs Transaction Parameters**: The PEAC record is the payload served at `feedbackURI`. The `feedbackHash` commits to those bytes but is NOT included in the payload (that would be circular).

2. **Canonical Serialization**: Use RFC 8785 JCS, not `JSON.stringify()`. Key order and spacing vary across implementations -- JCS ensures byte-exact reproducibility.

3. **Hash Algorithm**: ERC-8004 uses keccak256 for `feedbackHash`. PEAC's internal digest uses SHA-256 + JCS. When bridging to ERC-8004, use keccak256 on the same canonical bytes.

4. **No On-Chain Dependency**: PEAC verification works fully offline. ERC-8004 is an optional distribution channel for reputation signals.

## See Also

- [ERC-8004 Mapping](../../docs/mappings/erc-8004.md) - Full mapping specification
- [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) - Trustless Agents EIP
- [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) - Reference implementation
