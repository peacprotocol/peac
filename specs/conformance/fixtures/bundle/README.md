# Bundle Conformance Fixtures (v0.9.30+)

This directory contains golden vectors for Dispute Bundle verification.

## Structure

```text
bundle/
  vectors/           # ZIP bundle fixtures
    manifest.json    # Vector metadata and expected results
    *.zip            # Bundle archives
  expected/          # Expected outputs
    *.report_hash.txt    # Deterministic report hashes
    *.expected_error.txt # Expected error codes
```

## Regeneration

```bash
pnpm conformance:regen:bundle
```

CI runs this and asserts `git diff --exit-code` to detect drift.

## Security Warning

The `vectors/` directory contains **intentionally malicious ZIP files** for security testing:

- `path_traversal_unix.zip` - Contains `../../../etc/passwd` path (zip-slip attack)
- `path_traversal_windows.zip` - Contains `..\\..\\windows\\system32\\config` path
- `size_exceeded.zip` - Contains falsely large size claim in ZIP metadata (DoS attack)
- `duplicate_receipt.zip` - Contains receipts with duplicate JTI (replay attack)

**DO NOT extract these files with unsafe tools.** They exist only to verify that the bundle verifier correctly rejects them.

## Vector Categories

### Valid Bundles

- `valid_minimal.zip` - Single receipt with one key
- `valid_multi_receipt.zip` - Three receipts with two keys

### Invalid Bundles (Verification Errors)

- `invalid_signature.zip` - Receipt signed with wrong key
- `missing_key.zip` - Receipt references key not in JWKS

### Security Vectors (Malicious Bundles)

- `path_traversal_unix.zip` - Unix zip-slip: `E_BUNDLE_PATH_TRAVERSAL`
- `path_traversal_windows.zip` - Windows zip-slip: `E_BUNDLE_PATH_TRAVERSAL`
- `duplicate_receipt.zip` - Duplicate JTI: `E_BUNDLE_DUPLICATE_RECEIPT`
- `size_exceeded.zip` - False size claim: `E_BUNDLE_SIZE_EXCEEDED`

## Key Design Principle

ZIP is a transport container, NOT what we hash. Deterministic integrity
is at the content layer:

- `content_hash` = SHA-256 of JCS(manifest without content_hash)
- `report_hash` = SHA-256 of JCS(report without report_hash)

## Determinism

All vectors are generated with:

- Fixed `vector_id` identifiers (deterministic test IDs, NOT ULIDs)
- Fixed timestamps (2026-01-09T10:00:00.000Z, etc.)
- Deterministic keys from SHA-256 seeds
- Fixed mtime in ZIP entries

Regenerating should produce identical files with identical hashes.

## Manifest Format

The top-level `version` field in `manifest.json` is the **conformance spec target**
(e.g., `"0.9.30"` means these vectors target the v0.9.30 specification). This is
separate from npm package versions, which are bumped in release PRs.

Each vector in `manifest.json` has:

- `vector_id`: Fixed deterministic test identifier (NOT a ULID)
- `file`: ZIP filename
- `expected_valid`: Whether verification should succeed
- `expected_error`: Expected error code (for invalid vectors)
- `expected_receipt_error`: Error code when a receipt fails verification
- `expected_error_file`: Filename of expected error in `expected/`
- `expected_report_hash_file`: Filename of expected report hash (valid vectors)
- `description`: Human-readable description (optional)

## Cross-Language Parity

The `report_hash` in verification reports MUST match between:

- TypeScript implementation (`@peac/audit`)
- Go implementation (`sdks/go/audit`) - future

Same bundle + same verification options = same report_hash.
