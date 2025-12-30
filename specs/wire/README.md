# PEAC Wire Format Schemas

JSON Schema definitions for the PEAC receipt wire format (`peac.receipt/0.9`).

## Schema Files

| File                           | Description                               |
| ------------------------------ | ----------------------------------------- |
| `peac.receipt.0.9.schema.json` | Root receipt envelope schema              |
| `auth-context.schema.json`     | Authentication/authorization context      |
| `control-block.schema.json`    | Control block with purpose and licensing  |
| `evidence-block.schema.json`   | Evidence container (payment, attestation) |
| `payment-evidence.schema.json` | Payment and attestation evidence types    |
| `subject-profile.schema.json`  | Subject identity and snapshots            |
| `VERSION.json`                 | Schema set version metadata               |

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

All schema types use `additionalProperties: false`. Unknown fields at the top level will be rejected. Use `metadata` for extensions.

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
