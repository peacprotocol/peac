# Attribution Conformance Fixtures

Golden test vectors for `peac/attribution` attestations (v0.9.26+).

## Fixture Files

| File              | Count | Purpose                                                  |
| ----------------- | ----- | -------------------------------------------------------- |
| `valid.json`      | 16    | Valid attribution attestations that MUST pass validation |
| `invalid.json`    | 21    | Invalid attestations that MUST be rejected               |
| `edge-cases.json` | 16    | Edge cases and boundary conditions                       |

**Total:** 53 fixtures

## Schema Version

All fixtures use `version: "0.9.26"` and target the `peac/attribution` attestation type.

## Valid Fixtures

| Name                         | Description                                      |
| ---------------------------- | ------------------------------------------------ |
| `single-source-rag`          | Single source RAG context attribution            |
| `multiple-sources-synthesis` | Multiple sources combined for synthesis          |
| `training-input`             | Training data attribution with model ID          |
| `with-content-hashes`        | Attribution with content hash verification       |
| `with-excerpt-hash`          | Privacy-preserving attribution with excerpt hash |
| `with-output-hash`           | Attribution with derived output hash             |
| `embedding-source`           | Embedding generation attribution                 |
| `with-inference-provider`    | Attribution with inference provider URL          |
| `with-session-id`            | Attribution with session correlation             |
| `with-metadata`              | Attribution with additional metadata             |
| `with-expiration`            | Attribution with expiration timestamp            |
| `with-ref-url`               | Attribution with external verification reference |
| `mixed-usage-types`          | Multiple sources with different usage types      |
| `url-receipt-refs`           | Sources using URL-based receipt references       |
| `urn-receipt-refs`           | Sources using URN-based receipt references       |
| `full-attribution`           | Attribution with all optional fields populated   |

## Invalid Fixtures

Tests error detection for:

- Missing required fields (`sources`, `type`, `issuer`, `issued_at`, etc.)
- Invalid field values (wrong type, invalid format, out of range)
- Invalid hash algorithms, encodings, and value lengths
- Invalid URLs for `ref` and `inference_provider`
- Extra unknown fields (strict mode rejection)

## Edge Cases

Tests boundary conditions:

- Maximum sources (10 in fixture, spec allows up to 100)
- Weight boundaries (0.0, 1.0, fractional weights)
- Unicode in model ID
- Long receipt references (approaching 2048 char limit)
- Same source with multiple usages
- All derivation/usage type combinations
- Mixed receipt reference formats (jti:, https://, urn:)
- HTTP (non-HTTPS) receipt references
- Timestamps with millisecond precision
- Minimal valid attestation

## Usage Types

Valid usage values:

- `training_input` - Used as training data
- `rag_context` - Used as RAG context
- `direct_reference` - Directly referenced/quoted
- `synthesis_source` - Combined with other sources
- `embedding_source` - Used to generate embeddings

## Derivation Types

Valid derivation values:

- `training` - Model training
- `inference` - Runtime inference
- `rag` - Retrieval-augmented generation
- `synthesis` - Content synthesis
- `embedding` - Vector embedding generation

## Running Tests

```bash
pnpm vitest run tests/conformance/attribution.spec.ts
```

## Cross-Language Parity

These fixtures are designed for cross-language conformance testing. Implementations in TypeScript, Go, Python, etc. MUST produce identical validation results for all fixtures.
