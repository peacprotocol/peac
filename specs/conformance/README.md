# PEAC Conformance Test Fixtures

This directory contains test fixtures for validating PEAC implementations against the wire format specification.

**Version:** 0.9.26

## Directory Structure

```
fixtures/
  valid/              # NORMATIVE - Must pass schema validation
    minimal-receipt.json
    full-receipt.json
    payment-receipt.json
    control-chain.json
    subject-snapshot.json
  invalid/            # NORMATIVE - Must fail schema validation
    missing-iss.json
    missing-iat.json
    invalid-type.json
    extra-field.json
  edge/               # INFORMATIONAL - Implementation guidance
    empty-evidence.json
    null-values.json
    unicode-strings.json
    max-depth.json
  attribution/        # Attribution attestation fixtures (v0.9.26+)
    valid.json        # 16 valid attribution attestations
    invalid.json      # 21 invalid attribution attestations
    edge-cases.json   # 16 edge case fixtures
  purpose/            # Purpose header fixtures (v0.9.24+)
    normalization.json
    validation.json
    reason.json
```

## Conformance Layers

PEAC conformance testing is split into two layers:

### Schema Conformance (Ajv)

Tests that JSON fixtures match the JSON Schema (`specs/wire/*.schema.json`).

- **Test file**: `tests/conformance/schema.spec.ts`
- **Validator**: Ajv (JSON Schema draft 2020-12)
- **What it tests**: Structure, types, required fields, additionalProperties

### Protocol Conformance (Runtime)

Tests semantic invariants using `@peac/protocol` runtime validators.

- **Test file**: `tests/conformance/protocol.spec.ts`
- **Validator**: `@peac/protocol` (Zod-based)
- **What it tests**: Signatures, cycles, NaN/Infinity, semantic invariants

### Attribution Conformance (v0.9.26+)

Tests attribution attestation validation using `@peac/schema` and `@peac/attribution`.

- **Test file**: `tests/conformance/attribution.spec.ts`
- **Fixtures**: `fixtures/attribution/` (53 total fixtures)
- **What it tests**:
  - Schema validation (type, required fields, strict mode)
  - Sync verification (without chain resolution)
  - Derivation types: `training`, `inference`, `rag`, `synthesis`, `embedding`
  - Usage types: `training_input`, `rag_context`, `direct_reference`, `synthesis_source`, `embedding_source`
  - Content/excerpt hashes, weights, metadata, expiration

Some invalid cases **cannot exist as JSON files**:

| Case               | Why                                       | Layer    |
| ------------------ | ----------------------------------------- | -------- |
| Cycles             | JSON cannot represent circular references | Protocol |
| NaN/Infinity       | JSON only supports finite numbers         | Protocol |
| Invalid signatures | Signature bytes are valid JSON strings    | Protocol |

## Fixture Format

Each fixture includes metadata comments:

```json
{
  "$comment": "Description of test case",
  "$expected_error": "optional - expected error pattern for invalid fixtures",
  "auth": { ... }
}
```

## Normative vs Informational

| Directory  | Status        | Meaning                           |
| ---------- | ------------- | --------------------------------- |
| `valid/`   | **NORMATIVE** | Implementations MUST accept these |
| `invalid/` | **NORMATIVE** | Implementations MUST reject these |
| `edge/`    | INFORMATIONAL | Guidance for edge case handling   |

## Adding New Fixtures

1. Create the fixture JSON file in the appropriate directory
2. Add `$comment` explaining the test case
3. For invalid fixtures, add `$expected_error` with the expected error pattern
4. Run `pnpm exec vitest run tests/conformance/schema.spec.ts` to verify
5. Update this README if adding a new category

## Schema References

All fixtures are validated against:

- Root: `specs/wire/peac.receipt.0.9.schema.json`
- Components: `specs/wire/*.schema.json`

Schema version: `peac.receipt/0.9` (wire format frozen until v1.0)

## Running Conformance Tests

```bash
# All conformance tests
pnpm vitest run tests/conformance/

# Specific test suites
pnpm vitest run tests/conformance/schema.spec.ts      # Schema validation
pnpm vitest run tests/conformance/protocol.spec.ts   # Protocol semantics
pnpm vitest run tests/conformance/attribution.spec.ts # Attribution attestations
pnpm vitest run tests/conformance/parity.spec.ts     # Rail parity
```
