# RSL Collective Integration Example

Demonstrates RSL (Robots Specification Layer) integration with PEAC receipts and core claims parity.

## What This Shows

1. **RSL Token Vocabulary** (NORMATIVE) - Valid RSL 1.0 tokens and their mapping to ControlPurpose
2. **RSL-Derived Control Blocks** (ILLUSTRATIVE) - How to represent RSL licensing intent
3. **Core Claims Parity** (NORMATIVE) - Same semantic content produces identical JCS output
4. **Evidence Isolation** (NORMATIVE) - Rail-specific evidence is stripped for comparison

## Normative vs Illustrative

| Concept                   | Status       | Description                                                   |
| ------------------------- | ------------ | ------------------------------------------------------------- |
| RSL 1.0 token vocabulary  | NORMATIVE    | `all`, `ai-all`, `ai-train`, `ai-input`, `ai-index`, `search` |
| Token-to-purpose mapping  | NORMATIVE    | Defined in `@peac/mappings-rsl`                               |
| Control block structure   | ILLUSTRATIVE | One way to represent RSL intent in receipts                   |
| Core claims parity        | NORMATIVE    | Required by SCHEMA-NORMALIZATION.md spec                      |
| RFC 8785 canonicalization | NORMATIVE    | Only permitted comparison method                              |

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

## Running the Demo

```bash
cd examples/rsl-collective
pnpm demo
```

## Key Concepts

### RSL Token Mapping

RSL 1.0 tokens map to PEAC ControlPurpose values:

| RSL Token  | ControlPurpose                            |
| ---------- | ----------------------------------------- |
| `ai-train` | `train`                                   |
| `ai-input` | `ai_input`                                |
| `ai-index` | `ai_index`                                |
| `search`   | `search`                                  |
| `ai-all`   | `train`, `ai_input`, `ai_index`           |
| `all`      | `train`, `ai_input`, `ai_index`, `search` |

### Core Claims Parity

`toCoreClaims()` produces identical output for semantically equivalent receipts:

```typescript
// These produce byte-identical JCS output (after normalizing unique fields)
const acpReceipt = fromACPCheckoutSuccess(acpEvent);
const directReceipt = directIssue(sameSemanticContent);

canonicalize(toCoreClaims(acpReceipt)) === canonicalize(toCoreClaims(directReceipt));
```

### Evidence Isolation

`toCoreClaims()` strips:

- `payment.evidence` (rail-specific details)
- `control.chain[].policy_id`, `reason`, `version`, etc. (engine-specific metadata)

This ensures receipts from different sources can be compared for semantic equivalence.

## No External Dependencies

This example uses local keypair generation and in-memory operations.
No network calls, no secrets required.
