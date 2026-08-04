# Verifier contract snapshot

Tracked, application-local copy of the authoritative verification report schema.

The implementation's tests must run from this repository alone. Resolving the schema through a path
outside the checkout works on one developer machine and fails in every clean clone and CI runner, so
the correctness-critical copy lives here.

| File                                    | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `v0164-verification-report.schema.json` | `5bd5b543313dfbcfcdc620b61bd2b7448ac8cb6f12b266ea0ad4dc3b8145c857` |

## Rules

- All implementation and schema tests run against **this** snapshot.
- `tests/schema-parity.test.ts` recomputes the digest above on every run, so the snapshot cannot
  drift without a test failure.
- When an authoritative copy is reachable, the same test additionally proves byte equality with it.
  When it is not, that comparison is reported as **skipped**, never as passing.
- Parity **fails** rather than silently refreshing the snapshot. Refreshing is a deliberate edit:
  replace the file, update the SHA-256 above, and state it in the change description.
- This is a test fixture. It is **not** a public package export and **not** a Wire surface.
