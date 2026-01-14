# PEAC Versioning

This document defines the versioning scheme for PEAC Protocol artifacts.

## Two Version Spaces

PEAC maintains two independent version numbers:

| Version Type | Current | Purpose | Increment When |
|--------------|---------|---------|----------------|
| **Repo version** | `0.10.0` | Package releases, tooling, APIs | Any package change |
| **Wire version** | `0.1` | Signed artifact interoperability | Schema or semantics change |

**Hard rule:** Wire identifiers change only on backward-incompatible format changes.

**Current mapping:** Repo release `v0.10.0` implements wire format `peac-receipt/0.1`, `peac-bundle/0.1`, and `peac-verification-report/0.1`.

### Repo Version

The repository version (`0.10.0`) governs:

- npm package versions (`@peac/protocol`, `@peac/cli`, etc.)
- Go module versions (`github.com/peacprotocol/peac/sdks/go`)
- Internal APIs and tooling
- Documentation versions

Repo version follows semantic versioning. Package APIs may change between minor versions during pre-1.0 development.

### Wire Version

The wire version (`0.1`) governs interoperability of signed artifacts:

- Receipt envelope: `typ: peac-receipt/0.1`
- Bundle manifest: `version: peac-bundle/0.1`
- Policy document: `version: peac-policy/0.1`
- Verification report: `version: peac-verification-report/0.1`

Wire version only increments when:

1. Receipt schema adds required fields
2. Bundle structure changes incompatibly
3. Verification semantics change
4. Hash algorithm or format changes

Wire version does NOT increment for:

- New optional fields (with sensible defaults)
- New error codes
- API changes in packages
- Documentation updates

## Historical Context

The `0.9.x` repo versions used pre-release wire identifiers (dot-separated patterns like `peac.<type>/<version>`). These were development versions with no interoperability guarantees.

Starting with repo version `0.10.0`:

- Wire identifiers normalized to `peac-<artifact>/<major>.<minor>` pattern
- Wire version decoupled from repo version
- Wire version `0.1` is the first stable interoperability target

## Artifact Identifiers

All wire artifacts use the pattern: `peac-<artifact>/<major>.<minor>`

| Artifact | Identifier | Location |
|----------|------------|----------|
| Receipt | `peac-receipt/0.1` | JWS header `typ` field |
| Bundle | `peac-bundle/0.1` | Manifest `version` field |
| Policy | `peac-policy/0.1` | Policy document `version` field |
| Verification Report | `peac-verification-report/0.1` | Report `version` field |

## Hash Format

All content hashes use the self-describing format:

```
sha256:<64 lowercase hex characters>
```

Examples:
- `sha256:a1b2c3d4e5f6...` (valid)
- `SHA256:A1B2C3D4E5F6...` (invalid - uppercase)
- `a1b2c3d4e5f6...` (invalid - missing prefix)

## Canonical Constants

All identifiers are defined in `@peac/kernel` and must be imported from there:

```typescript
import {
  PEAC_WIRE_TYP,           // 'peac-receipt/0.1'
  BUNDLE_VERSION,          // 'peac-bundle/0.1'
  POLICY_VERSION,          // 'peac-policy/0.1'
  VERIFICATION_REPORT_VERSION, // 'peac-verification-report/0.1'
} from '@peac/kernel';
```

Do not use string literals for these values in application code.

## Schema Base URI

All JSON schemas use the base URI:

```
https://peacprotocol.org/schemas/wire/0.1/
```

The canonical schema source is `specs/wire/`. Documentation copies in `docs/specs/` are generated from the canonical source.

## Compatibility Guarantees

Within a wire version:

- Existing required fields will not be removed
- New optional fields may be added
- Validation rules will not become stricter
- Cross-language implementations produce identical outputs

Across wire versions:

- Breaking changes require a new wire version
- Old wire versions remain valid indefinitely
- Verifiers should support multiple wire versions during transitions
