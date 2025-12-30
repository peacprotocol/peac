# PEAC Wire Format Schemas

JSON Schema definitions for the PEAC receipt wire format (`peac.receipt/0.9`).

## Schema Files

| File                           | Description                                |
| ------------------------------ | ------------------------------------------ |
| `peac.receipt.0.9.schema.json` | Root receipt envelope schema               |
| `auth-context.schema.json`     | Authentication/authorization context       |
| `control-block.schema.json`    | Control block with purpose and licensing   |
| `evidence-block.schema.json`   | Evidence container (payment, attestations) |
| `payment-evidence.schema.json` | Payment and attestation evidence types     |
| `subject-profile.schema.json`  | Subject identity and snapshots             |
| `VERSION.json`                 | Schema set version metadata                |

## Versioning

- **Wire format**: `peac.receipt/0.9` (frozen until v1.0)
- **Schema set version**: Tracked in `VERSION.json`, independent of npm package versions
- **JSON Schema draft**: 2020-12

## Extension Policy

### Adding New Optional Fields

New optional fields MAY be added to existing types without bumping the wire format version, provided:

1. The field has a sensible default (typically `undefined`/absent)
2. Existing receipts remain valid without the field
3. Validators do not reject receipts missing the field

### Adding New Required Fields

New required fields require a wire format version bump (e.g., `peac.receipt/1.0`).

### Removing Fields

Fields MUST NOT be removed from the schema. Deprecate by:

1. Marking as deprecated in the description
2. Making optional if previously required
3. Documenting migration path

### Custom Extensions

Use the `metadata` field (where available) for application-specific extensions:

```json
{
  "id": "user:abc123",
  "type": "human",
  "metadata": {
    "x-myapp-tier": "premium"
  }
}
```

Custom extensions in `metadata`:

- MUST use a prefix (e.g., `x-myapp-`)
- MUST NOT affect core protocol semantics
- MAY be ignored by other implementations

### Strict Validation

All schema types use `additionalProperties: false` by default. Unknown fields at the top level of any type will be rejected.

**Designated extension surfaces** (where `additionalProperties: true`):

| Location               | Type       | Purpose                                           |
| ---------------------- | ---------- | ------------------------------------------------- |
| `subject.metadata`     | object     | Application-specific subject attributes           |
| `auth.ctx`             | object     | Request context metadata (resource, method, etc.) |
| `auth.extensions`      | Extensions | Namespaced auth-level extensions                  |
| `control.extensions`   | Extensions | Namespaced control-level extensions               |
| `evidence.extensions`  | Extensions | Namespaced evidence-level extensions              |
| `payment.evidence`     | JsonValue  | Rail-specific payment proof                       |
| `attestation.evidence` | JsonValue  | Format-specific attestation data                  |
| `enforcement.details`  | object     | Enforcement method details                        |
| `binding.evidence`     | object     | Transport binding proof                           |
| `split.metadata`       | object     | Split-specific metadata                           |

Use these designated fields for vendor extensions. Do not attempt to add unknown keys to strict objects.

### Namespaced Extensions

The `extensions` fields use namespaced keys following the pattern `domain/key`:

```json
{
  "extensions": {
    "com.example/custom-field": "value",
    "io.vendor/metadata": { "key": "value" }
  }
}
```

Extension key requirements:

- MUST match pattern `^[a-z0-9_.-]+/[a-z0-9_.-]+$`
- SHOULD use reverse domain notation (e.g., `com.example/field`)
- MAY contain any JSON value

### Generic Attestations

The `attestations` array supports any type of third-party attestation:

```json
{
  "evidence": {
    "attestations": [
      {
        "issuer": "https://cloudflare.com",
        "type": "risk_assessment",
        "issued_at": "2025-01-01T00:00:00Z",
        "expires_at": "2025-01-02T00:00:00Z",
        "ref": "https://cloudflare.com/r/abc123",
        "evidence": { "score": 0.15, "outcome": "allow" }
      }
    ]
  }
}
```

Attestation fields:

- `issuer` (required): URI or DID of the attestation issuer
- `type` (required): Attestation type (e.g., `risk_assessment`, `kyc`, `compliance`)
- `issued_at` (required): RFC 3339 timestamp when issued
- `expires_at` (optional): RFC 3339 timestamp when attestation expires
- `ref` (optional): URI reference to the attestation
- `evidence` (required): Type-specific evidence payload (any JSON value)

## Evidence Lane Rules (Normative)

Evidence in PEAC receipts is organized into distinct "lanes" with specific scopes and semantics. This separation is critical for correct interpretation and prevents scope confusion.

| Lane             | Location                   | Scope                      | Examples                                             |
| ---------------- | -------------------------- | -------------------------- | ---------------------------------------------------- |
| Payment Evidence | `payment.evidence.*`       | **Rail-scoped**            | Fraud signals, charge lifecycle, processor refs      |
| Attestations     | `evidence.attestations[]`  | **Interaction-scoped**     | Content safety, bot classification, policy decisions |
| Extensions       | `*.extensions`             | **Non-normative metadata** | Trace correlation, vendor extras, audit hints        |

### Lane Semantics

**Payment Evidence** (`payment.evidence`):

- Bound to a specific payment rail (Stripe, x402, Razorpay, etc.)
- Contains rail-specific proof and metadata
- Used for payment verification and dispute resolution

**Attestations** (`evidence.attestations[]`):

- Interaction-scoped third-party claims
- Independent of payment rail
- Used for risk assessment, compliance, content classification

**Extensions** (`auth.extensions`, `control.extensions`, `evidence.extensions`):

- Non-normative metadata
- Correlation hints (e.g., trace context)
- Vendor-specific extras

### Critical Invariant

**Extensions MUST NOT be required for verification correctness.**

A receipt is valid if and only if:

1. The signature verifies
2. Required fields are present and valid
3. Time constraints are satisfied

Extensions provide correlation and metadata but NEVER affect authorization decisions unless a relying party explicitly opts in by policy.

### Trace Context in Extensions

When audit/compliance flows require cryptographic binding of trace context to receipts:

```json
{
  "auth": {
    "extensions": {
      "w3c/traceparent": "00-abc123def456...-01",
      "w3c/tracestate": "vendor=value"
    }
  }
}
```

This is a **correlation hint**, never an enforcement input. Use only when cryptographic proof of trace linkage is required (EU AI Act, SOC 2, dispute resolution).

## Conformance Testing

Conformance tests live in:

- `specs/conformance/fixtures/` - Test fixtures (valid, invalid, edge cases)
- `specs/conformance/fixtures/manifest.json` - Test metadata
- `tests/conformance/` - Test runners (schema.spec.ts, protocol.spec.ts)

Run conformance tests:

```bash
pnpm test --filter conformance
```

## Base URI

All schemas use the base URI: `https://peacprotocol.org/schemas/wire/0.9/`
