# @peac/attribution

PEAC attribution attestation - content derivation and usage proofs for AI systems.

## Overview

This package provides tools for creating and verifying attribution attestations that prove:

- Which content was used in AI training or inference
- How the content was used (RAG context, training input, synthesis, etc.)
- Chain of derivation across multiple processing steps

## Installation

```bash
pnpm add @peac/attribution
```

## Usage

### Creating an Attribution Attestation

```typescript
import { createAttribution, computeContentHash } from '@peac/attribution';

// Create attestation with content hash for verification
const attestation = createAttribution({
  issuer: 'https://ai.example.com',
  sources: [
    {
      receipt_ref: 'jti:rec_abc123',
      content_hash: computeContentHash('Original article content...'),
      usage: 'rag_context',
      weight: 0.8,
    },
    {
      receipt_ref: 'jti:rec_def456',
      usage: 'rag_context',
      weight: 0.2,
    },
  ],
  derivation_type: 'rag',
  model_id: 'gpt-4',
  session_id: 'sess_xyz',
});
```

### Verifying an Attribution

```typescript
import { verify, verifySync } from '@peac/attribution';

// Quick synchronous validation (schema + time checks)
const syncResult = verifySync(attestation);
if (!syncResult.valid) {
  console.error('Invalid attestation:', syncResult.error);
}

// Full verification with chain traversal
const result = await verify(attestation, {
  verifyChain: true,
  chainOptions: {
    resolver: async (receiptRef) => {
      // Fetch and return the attribution from the referenced receipt
      const receipt = await fetchReceipt(receiptRef);
      return extractAttribution(receipt);
    },
  },
});

if (result.valid) {
  console.log('Chain depth:', result.chain?.maxDepth);
  console.log('Total sources:', result.chain?.totalSources);
}
```

### Content Hash Verification

```typescript
import { computeContentHash, verifyContentHash } from '@peac/attribution';

// Hash content for inclusion in attestation
const hash = computeContentHash('Article content here...');

// Verify content matches a hash
const matches = verifyContentHash('Article content here...', hash);
// true
```

### Content-Minimizing Excerpt Hashes

```typescript
import { computeExcerptHash, verifySourceExcerpt } from '@peac/attribution';

// Create attestation with excerpt hash (content-minimizing)
// Note: Hashes of short/predictable text may be vulnerable to dictionary attacks.
// For high-entropy content (long paragraphs), this provides reasonable minimization.
const attestation = createAttribution({
  issuer: 'https://ai.example.com',
  sources: [
    {
      receipt_ref: 'jti:rec_abc123',
      excerpt_hash: computeExcerptHash('The specific paragraph that was quoted'),
      usage: 'direct_reference',
    },
  ],
  derivation_type: 'inference',
});

// Verify an excerpt matches
const matches = verifySourceExcerpt(
  'The specific paragraph that was quoted',
  attestation,
  'jti:rec_abc123'
);
```

## Types

### Attribution Usage Types

| Usage              | Description                   |
| ------------------ | ----------------------------- |
| `training_input`   | Used to train a model         |
| `rag_context`      | Retrieved for RAG context     |
| `direct_reference` | Directly quoted or referenced |
| `synthesis_source` | Combined with other sources   |
| `embedding_source` | Used to create embeddings     |

### Derivation Types

| Type        | Description                      |
| ----------- | -------------------------------- |
| `training`  | Model training or fine-tuning    |
| `inference` | Runtime inference with grounding |
| `rag`       | Retrieval-augmented generation   |
| `synthesis` | Multi-source content synthesis   |
| `embedding` | Vector embedding generation      |

## Limits

| Limit                | Value  | Description                     |
| -------------------- | ------ | ------------------------------- |
| `maxSources`         | 100    | Maximum sources per attestation |
| `maxDepth`           | 8      | Maximum chain resolution depth  |
| `maxAttestationSize` | 64KB   | Maximum serialized size         |
| `resolutionTimeout`  | 5000ms | Per-hop resolution timeout      |

## Error Codes

| Code                            | HTTP | Description                      |
| ------------------------------- | ---- | -------------------------------- |
| `E_ATTRIBUTION_MISSING_SOURCES` | 400  | Empty sources array              |
| `E_ATTRIBUTION_INVALID_FORMAT`  | 400  | Schema validation failed         |
| `E_ATTRIBUTION_INVALID_REF`     | 400  | Invalid receipt reference format |
| `E_ATTRIBUTION_HASH_INVALID`    | 400  | Invalid content hash             |
| `E_ATTRIBUTION_CIRCULAR_CHAIN`  | 400  | Cycle detected in chain          |
| `E_ATTRIBUTION_CHAIN_TOO_DEEP`  | 400  | Chain exceeds depth limit        |
| `E_ATTRIBUTION_EXPIRED`         | 401  | Attestation has expired          |

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Originary](https://www.originary.xyz) | [Docs](https://peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac)
