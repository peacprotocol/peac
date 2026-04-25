# v0.13.0 error-emission audit

> **Status:** Informational. Catalogues every code in `specs/kernel/errors.json` and
> classifies each by how it is referenced in the v0.13.0 tagged tree. No code is
> renumbered, removed, or re-categorized in this release; error codes are part of
> the public surface and changing them follows the deprecation lifecycle in
> [`docs/DEPRECATION_POLICY.md`](../DEPRECATION_POLICY.md). Regenerate this report
> by running `node scripts/audit-error-emissions.mjs --write`.

## Summary

- Total codes: 186
- Emitted in production: 141
- Referenced in tests only: 9
- Unreferenced: 36
- Production files scanned: 512
- Test files scanned: 375

## Methodology

- Production scope: `packages/*/src/**`, `apps/*/src/**`, `sdks/go/**`. Generated
  files (`*.generated.ts`), archive paths, and `node_modules/` are excluded.
- Test scope: `tests/**`, `**/__tests__/**`, `**/tests/**`, `specs/conformance/**`,
  and any `*.test.*` / `*.spec.*` file under the rest of the workspace.
- A code is matched as a whole identifier token. `E_INVALID_FORMAT` does not match
  `E_INVALID_FORMAT_X` and is not double-counted when the same file references it
  multiple times.
- "Production files" / "Test files" columns count distinct files that mention the
  code, not raw occurrences. The categorization is per-code: a code is "emitted in
  production" if any production file references it, "tests only" if only test files
  do, and "unreferenced" otherwise.

## Recommendations (advisory; no removals in this release)

Codes flagged as `unreferenced` are candidates for one of:

1. **keep**: the code is reserved for an edge surface (operator, infra, or
   future-issuance path) and the registry slot is intentionally idle.
2. **wire-up**: the code names a real condition that is currently emitting a
   different code, and the wire-up is a small fix-forward.
3. **deprecate**: the code names a condition that no longer occurs. Removing it
   requires a deprecation horizon per `docs/DEPRECATION_POLICY.md`; never within
   the same release.

Codes flagged as `tests-only` typically describe negative-test conditions whose
fixtures synthesize the failure shape. They are usually correct as-is.

## Per-category counts by spec category

| Spec category  | Total | Production | Tests-only | Unreferenced |
| -------------- | ----- | ---------- | ---------- | ------------ |
| attribution    | 14    | 14         | 0          | 0            |
| bundle         | 15    | 0          | 5          | 10           |
| control        | 2     | 1          | 0          | 1            |
| cryptography   | 5     | 5          | 0          | 0            |
| dispute        | 14    | 0          | 1          | 13           |
| identity       | 14    | 13         | 1          | 0            |
| infrastructure | 6     | 4          | 0          | 2            |
| interaction    | 14    | 14         | 0          | 0            |
| ucp            | 20    | 20         | 0          | 0            |
| validation     | 40    | 30         | 1          | 9            |
| verification   | 11    | 9          | 1          | 1            |
| verifier       | 23    | 23         | 0          | 0            |
| workflow       | 8     | 8          | 0          | 0            |

## Unreferenced codes (advisory list)

| Code                                   | Spec category  | Severity | HTTP status |
| -------------------------------------- | -------------- | -------- | ----------- |
| `E_BUNDLE_DUPLICATE_RECEIPT`           | bundle         |          | 400         |
| `E_BUNDLE_HASH_MISMATCH`               | bundle         |          | 400         |
| `E_BUNDLE_MANIFEST_INVALID`            | bundle         |          | 400         |
| `E_BUNDLE_MANIFEST_MISSING`            | bundle         |          | 400         |
| `E_BUNDLE_PATH_TRAVERSAL`              | bundle         |          | 400         |
| `E_BUNDLE_POLICY_HASH_MISMATCH`        | bundle         |          | 400         |
| `E_BUNDLE_RECEIPTS_UNORDERED`          | bundle         |          | 400         |
| `E_BUNDLE_SIGNATURE_INVALID`           | bundle         |          | 400         |
| `E_BUNDLE_SIZE_EXCEEDED`               | bundle         |          | 400         |
| `E_BUNDLE_TIME_RANGE_INVALID`          | bundle         |          | 400         |
| `E_CIRCUIT_BREAKER_OPEN`               | infrastructure |          | 503         |
| `E_CONTROL_REVIEW_REQUIRED`            | control        |          | 202         |
| `E_DISPUTE_DUPLICATE`                  | dispute        |          | 409         |
| `E_DISPUTE_EXPIRED`                    | dispute        |          | 401         |
| `E_DISPUTE_INVALID_GROUNDS`            | dispute        |          | 400         |
| `E_DISPUTE_INVALID_ID`                 | dispute        |          | 400         |
| `E_DISPUTE_INVALID_STATE`              | dispute        |          | 400         |
| `E_DISPUTE_INVALID_TARGET_TYPE`        | dispute        |          | 400         |
| `E_DISPUTE_INVALID_TRANSITION`         | dispute        |          | 400         |
| `E_DISPUTE_INVALID_TYPE`               | dispute        |          | 400         |
| `E_DISPUTE_MISSING_RESOLUTION`         | dispute        |          | 400         |
| `E_DISPUTE_NOT_YET_VALID`              | dispute        |          | 401         |
| `E_DISPUTE_OTHER_REQUIRES_DESCRIPTION` | dispute        |          | 400         |
| `E_DISPUTE_RESOLUTION_NOT_ALLOWED`     | dispute        |          | 400         |
| `E_DISPUTE_TARGET_NOT_FOUND`           | dispute        |          | 404         |
| `E_GRPC_METADATA_TOO_LARGE`            | validation     |          | 400         |
| `E_INVALID_AMOUNT`                     | validation     |          | 400         |
| `E_INVALID_CURRENCY`                   | validation     |          | 400         |
| `E_INVALID_KIND`                       | validation     |          | 400         |
| `E_INVALID_PILLAR_VALUE`               | validation     |          | 400         |
| `E_INVALID_RAIL`                       | validation     |          | 400         |
| `E_INVALID_TYPE`                       | validation     |          | 400         |
| `E_PKCE_CHALLENGE_MISMATCH`            | verification   |          | 400         |
| `E_RECEIPT_URL_RESOLUTION_FAILED`      | infrastructure |          | 502         |
| `E_X402_V2_INVALID_FORMAT`             | validation     |          | 400         |
| `E_X402_VERSION_UNSUPPORTED`           | validation     |          | 400         |

## Tests-only codes (advisory list)

| Code                        | Spec category | Test files |
| --------------------------- | ------------- | ---------- |
| `E_BUNDLE_INVALID_FORMAT`   | bundle        | 1          |
| `E_BUNDLE_KEY_MISSING`      | bundle        | 1          |
| `E_BUNDLE_MISSING_KEYS`     | bundle        | 1          |
| `E_BUNDLE_MISSING_RECEIPTS` | bundle        | 1          |
| `E_BUNDLE_RECEIPT_INVALID`  | bundle        | 1          |
| `E_DISPUTE_INVALID_FORMAT`  | dispute       | 1          |
| `E_MISSING_REQUIRED_CLAIM`  | validation    | 1          |
| `E_MVIS_INCOMPLETE`         | identity      | 1          |
| `E_REVOKED_KEY_USED`        | verification  | 1          |

_For the full per-code data including production-file counts, see_
_`docs/baselines/ERROR-EMISSION-AUDIT-v0.13.0.json`._
