# Parity corpus: provisioning-lifecycle

Cross-language parity vectors for the `org.peacprotocol/provisioning-lifecycle`
extension namespace (v0.14.2 Profile 0.1).

## Convention

This corpus follows the single-file `vectors.json` + `vectors.schema.json` +
`README.md` convention used by every v0.14.x parity-corpus family. Every
vector is envelope-accepted (`expected.accepted = true`). Negative vectors
additionally declare `expected.errors[]` carrying the stable code under
`provisioning.*` that the provisioning-lifecycle extension validator must
emit for that vector's extension content. Cross-language consumers can
read the same JSON file to test both wire-envelope acceptance and
extension-level structured-error contracts.

The wire-envelope canonical-truth test in `@peac/protocol` filters dotted
extension-level codes from `expected.errors` before comparison, so the
extension-level expectations do not break the envelope-layer parity check.
The schema-validator corpus test in `@peac/schema` reads
`expected.errors[]` directly; there is no TypeScript-only mapping that
would make the corpus less portable.

## Coverage

| Section          | Count | Notes                                                                                                                                                                                                          |
| ---------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positive vectors | 10    | One per event kind: catalog, provider-link, account, resource, credential, payment-authorization, budget, subscription, domain, deployment.                                                                    |
| Negative vectors | 19    | One per validator-emitted stable error code under `provisioning.*`, excluding the two codes covered by schema unit tests (see Coverage exceptions). Schema-level rejection asserted in the schema corpus test. |

## Coverage exceptions

Two stable error codes are intentionally not exercised by corpus vectors. They
are covered by the schema unit tests at
`packages/schema/__tests__/extensions/provisioning-lifecycle.test.ts` instead.

| Code                              | Reason                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provisioning.invalid_utf8`       | Fixture-loader-only: never emitted by the in-memory validator.                                                                                                                                                                                                                                        |
| `provisioning.structure_too_deep` | The kernel constraint walker (`MAX_NESTED_DEPTH=32`) and the extension walker (`max_depth=32`) share the same depth cap. Any depth-exceeding input is rejected at wire-envelope canonical time with a path-sensitive verdict shape that does not round-trip cleanly through parity-vector comparison. |

## File map

```text
README.md             this file
vectors.json          29 vectors total (10 positive + 19 negative)
vectors.schema.json   JSON Schema 2020-12 envelope for vectors.json
```

## Consumers

- TypeScript loader and per-vector validator at
  `packages/schema/__tests__/extensions/provisioning-lifecycle-corpus.test.ts`.
- Go loader at `sdks/go/parity_corpus_loader_test.go` (counts vectors and
  asserts envelope shape; does not run the schema validator).

## Boundaries

These vectors describe what the validator should accept or reject. They do
not describe runtime behavior, business outcomes, or upstream provider
state. The 10 type URIs all carry the `*-observed` suffix to make the
observer scope explicit.
