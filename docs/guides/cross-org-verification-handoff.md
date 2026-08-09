# Cross-organization verification handoff

A Wire 0.2 PEAC record is carried as a signed compact JWS. The recipient verifies it locally using
independently supplied public-key material, with no issuer callback, no account, and no shared online
verification service. This guide walks through that handoff end to end and states precisely what a
successful verification does and does not establish.

The shape is always the same: **organization A issues a record and shares it, along with the public
key, with organization B; organization B verifies it locally.** Verification requires no issuer
callback or shared online verification service.

## 1. Organization A issues a record and exports the public key

Records are produced with `issue()` from `@peac/protocol` (see [`docs/VERIFY.md`](../VERIFY.md) for
the library form). The signing (private) key is not part of the handoff. What A shares is:

- the **compact record** (a JWS string), and
- the **public key** as a JWK or a JWKS (never the private key).

To try the flow without writing any code, generate a sample record and its public key bundle:

```bash
pnpm dlx @peac/cli samples generate -o ./s
# ./s/valid/*.jws            the records
# ./s/bundles/sandbox-jwks.json   the public JWKS
```

The repository includes a ready-made pair under
[`apps/verifier/samples/`](../../apps/verifier/samples/): `record.jws` and `key.jwk.json`.

## 2. Organization A transfers the record and key to organization B

Transfer the record and public key using a channel appropriate to the information being exchanged and
the organizations' requirements. The public key is not secret, but a signed record is not encrypted
merely because it is a JWS. Signature verification detects changes to the record relative to the
supplied key; it does not establish how that key reached organization B or whether it is the expected
key. Transfer the compact JWS byte for byte: whitespace or line-ending normalization that changes the
supplied string will cause it to be rejected.

If organization B needs to establish that the supplied key is the expected key (not merely a key A
sent alongside the record), B obtains or confirms the expected RFC 7638 JWK thumbprint independently
of the record-and-key handoff, for example through pre-established configuration, a previously
recorded expected thumbprint, or a separately authenticated channel. B then supplies that value as a
trust anchor; see step 4.

## 3. Organization B verifies locally

Organization B verifies with the public key it received. Every path runs entirely on B's side, with
no network call to A:

- **Browser verifier** ([`apps/verifier/`](../../apps/verifier/)): paste the record into "PEAC
  record" and the public key into "Public key", then choose Verify. Nothing is uploaded, fetched, or
  stored.
- **Command line**:

  ```bash
  pnpm dlx @peac/cli verify ./record.jws --public-key ./key.jwk.json
  ```

- **Library**: `verifyLocal(record, publicKey)` from `@peac/protocol`.

A valid record reports success. See [Verification options](verification-options.md) for the full set
of paths.

## 4. Trust context is separate from cryptographic validity

A successful signature check answers one question: _was this record signed by the private key that
matches the public key I used, and is it unchanged?_ It does not answer _should I trust that key?_

Those are kept deliberately separate. In the browser verifier, organization B can supply a
**verification context** (a `VerificationContextV1` document) alongside the record and key:

- Within the browser verifier's current `VerificationContextV1` model, an independently established
  **trusted JWK thumbprint** is the supported trust-anchor input. When B supplies the thumbprint it
  confirmed independently in step 2 and it matches the selected key, the result is reported as
  trusted-key rather than integrity-only. The thumbprint identifies the key; its trust comes from B's
  independent provenance decision, not from the thumbprint format itself.
- **expected issuer**, **allowed key ids**, and **allowed record types** are record-supplied signed
  or protected values. They constrain what organization B accepts, but they do not independently
  establish key provenance and are not trust anchors.

Supplying no context is a valid, integrity-only verification: the signature is checked, and the
result says plainly that the key was not independently established as expected.

## 5. Tamper is detected

For the included `record-tampered.jws` example, which changes a byte in the signature segment,
verification fails at the signature stage with `E_INVALID_SIGNATURE`: the record no longer matches
the signature. More generally, any modification to a record is rejected when it violates the checks
the verifier applies; depending on what changed, that may be the signature check or an earlier
structural, encoding, or content check.

## 6. A deterministic report

The browser verifier can export a deterministic, unsigned verification report for a completed run.
Given identical verification inputs and evaluation time, the report is byte-identical, so a
separately retained report hash can be used to detect later changes. The unsigned report records the
verification outcome; it does not establish who produced the report.

## What a successful verification establishes, and what it does not

It establishes:

- the record was signed by the private key matching the public key organization B used;
- the record has not changed since it was signed;
- the record satisfied the checks the verifier performed, at the evaluation time shown.

It does not establish:

- that the key, or its holder, is one organization B should trust (that is the separate trust
  decision in step 4);
- that the statements inside the record are factually true;
- that any external event the record refers to actually occurred.

## Related

- [Verification options](verification-options.md) — CLI, browser, and self-host verification paths.
- [`apps/verifier/README.md`](../../apps/verifier/README.md) — the browser verifier and its sample walkthrough.
- [`docs/VERIFY.md`](../VERIFY.md) — command-line and library verification, including issuance.
