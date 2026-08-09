# Verifier sample fixtures

Static sample material for the "Try it" walkthrough in the app README and for the release acceptance
battery, so a record can be verified without generating one.

Only public key material is committed; no private key is present. The valid record was produced with
the `issue()` API from `@peac/protocol`. The tampered record is the valid record with one signature
byte changed. The trust contexts are `VerificationContextV1` documents.

| File                          | Purpose                                            | Expected outcome                                  |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `record.jws`                  | A valid compact PEAC record                        | Accepted (integrity-only)                         |
| `key.jwk.json`                | The public Ed25519 JWK for `record.jws`            | —                                                 |
| `record-tampered.jws`         | `record.jws` with one signature byte changed       | Rejected at the signature (`E_INVALID_SIGNATURE`) |
| `context-trust-match.json`    | A trust context naming the sample key's thumbprint | Accepted (trusted-key)                            |
| `context-trust-mismatch.json` | A trust context naming a different thumbprint      | Rejected at the trusted-key stage                 |

The record carries no expiry, so it verifies at any later time. `tests/sample-fixtures.test.ts` runs
each fixture through the verification pipeline so they cannot silently drift out of validity.

Paste each file's contents exactly. The verifier rejects surrounding whitespace rather than trimming
it, so do not add a trailing newline.
