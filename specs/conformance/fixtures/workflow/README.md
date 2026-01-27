# Workflow Correlation Conformance Fixtures (v0.10.2+)

This directory contains golden vectors for testing workflow correlation types.

## Overview

Workflow correlation enables tracking multi-step agentic workflows across different
orchestration frameworks (MCP, A2A, CrewAI, LangGraph, AutoGen, etc.).

Two main types are tested:

1. **WorkflowContext** - Per-receipt extension for DAG reconstruction
2. **WorkflowSummaryAttestation** - Proof-of-run artifact for workflow verification

## Files

| File              | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `valid.json`      | Valid WorkflowContext and WorkflowSummaryAttestation vectors |
| `invalid.json`    | Invalid vectors that must be rejected                        |
| `edge-cases.json` | Boundary conditions and limits testing                       |

## Test Categories

### WorkflowContext Tests

- **ID Formats**: `wf_{ulid}` and `step_{ulid}` patterns
- **DAG Semantics**: Root steps, linear chains, fork-join patterns
- **Hash Chaining**: `prev_receipt_hash` for streaming receipts
- **Framework Metadata**: MCP, A2A, CrewAI, LangGraph, AutoGen, custom
- **Limits**: maxParentSteps (16), maxToolNameLength (256)

### WorkflowSummaryAttestation Tests

- **Receipt Commitment**: `receipt_refs` array or `receipt_merkle_root`
- **Status Values**: in_progress, completed, failed, cancelled
- **Error Context**: Failed workflow with error details
- **Limits**: maxAgentsInvolved (100), maxReceiptRefs (10000), maxErrorMessageLength (1024)

## Fixture Schema

Each fixture file has the following top-level structure:

```json
{
  "$comment": "...",
  "version": "0.10.2",
  "fixtures": [...]
}
```

**Versioning**: The `version` field refers to the PEAC spec version that introduced
these fixtures (v0.10.2 = Workflow Correlation). It tracks the spec, not the npm
package version.

**Schema Resolution**: The `$id` in `fixtures.schema.json` is a logical identifier,
not a fetch URL. Tooling MUST resolve the schema from the local repository bundle
(`specs/conformance/fixtures/workflow/fixtures.schema.json`), not via network fetch.
This enables offline validation in air-gapped and enterprise environments.

### Expected Fields (Invalid Fixtures)

For invalid fixtures, `expected` contains:

| Field        | Status        | Description                                                                                                                                                  |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `valid`      | Normative     | Must be `false`                                                                                                                                              |
| `error_code` | Normative     | Canonical error code from `specs/kernel/errors.json`. Test harnesses MUST assert this value matches.                                                         |
| `error`      | Informational | Human-readable description. Test harnesses MUST NOT assert exact match on this field -- it is for documentation only and may change between implementations. |
| `meta`       | Informational | Optional metadata (e.g., `validation_order_note`). Not used for assertion.                                                                                   |

### Conformance Assertion Rule

Cross-language test harnesses SHOULD:

1. Parse `expected.error_code` and compare against the validator's emitted code
2. Ignore `expected.error` (or use it only for diagnostic output on failure)
3. Ignore `expected.meta` (informational only)

## Key Invariants

1. **ID Format**: Workflow IDs must match `wf_[a-zA-Z0-9_-]{20,48}`
2. **ID Format**: Step IDs must match `step_[a-zA-Z0-9_-]{20,48}`
3. **DAG Semantics**: A step cannot be its own parent
4. **DAG Semantics**: No duplicate parent step IDs
5. **Hash Format**: `sha256:[a-f0-9]{64}` for hashes
6. **HTTPS Issuer**: Attestation issuer must be HTTPS URL
7. **Receipt Commitment**: Summary must have `receipt_refs` OR `receipt_merkle_root`
8. **Merkle Count**: `receipt_count` required when using `receipt_merkle_root`

## Usage

```typescript
import { WorkflowContextSchema, WorkflowSummaryAttestationSchema } from '@peac/schema';
import validFixtures from './valid.json';

for (const fixture of validFixtures.fixtures) {
  const result =
    fixture.type === 'WorkflowContext'
      ? WorkflowContextSchema.safeParse(fixture.input)
      : WorkflowSummaryAttestationSchema.safeParse(fixture.input);

  expect(result.success).toBe(fixture.expected.valid);
}
```

## Related Documentation

- [WORKFLOW-CORRELATION.md](../../../../docs/specs/WORKFLOW-CORRELATION.md) - Normative specification
- [workflow.ts](../../../../packages/schema/src/workflow.ts) - Type definitions
