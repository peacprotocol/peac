# Versioning Policy

PEAC protocol follows semantic versioning with protocol-specific constraints.

## Version Semantics

| Version Component | Meaning                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Major** (X.0.0) | Breaking changes to wire format, removal of registry entries, removal of error codes       |
| **Minor** (0.X.0) | Additive changes: new registry entries, new error codes, new extension schemas, new fields |
| **Patch** (0.0.X) | Bug fixes, documentation corrections, test improvements                                    |

## Additive-Only Rule (Minor Versions)

Minor version bumps are strictly additive:

- New registry entries may be added
- New error codes may be added
- New extension schemas may be added
- New optional fields may be added to existing schemas
- Existing entries, codes, and fields MUST NOT be removed or renamed

## Breaking Changes (Major Versions Only)

The following require a major version bump:

- Removing or renaming a registry entry
- Removing or repurposing an error code
- Removing a required field from a schema
- Changing the wire format (`peac-receipt/0.1` is frozen until v1.0)
- Changing the semantics of an existing field

## Registry Entry Lifecycle

1. **Active**: Entry is current and recommended
2. **Deprecated**: Entry has a successor; set `sunset_version` and `deprecated_by`
3. **Removed**: Entry is no longer valid (major version only); becomes a tombstone

Deprecation and removal follow one transition per version. Entries without
`sunset_version` are permanent.

## Error Code Stability

- Error codes use `E_` prefix with `UPPER_SNAKE_CASE`
- Once published, an error code is never removed or repurposed
- The `next_action` vocabulary is closed (7 values); new values require a minor version bump

## Wire Format

The wire format `peac-receipt/0.1` is frozen until v1.0. No changes to the
JWS envelope structure, required claims, or signature algorithm are permitted
in any 0.x release.

## Multi-Implementation Guidance

This versioning policy supports independent implementations:

- Implementers can rely on additive-only guarantees within a major version
- Conformance fixtures are versioned with the protocol
- Registry changes are non-normative; the protocol uses opaque string types
