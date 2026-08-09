# Cross-organization verification handoff

A PEAC record is a signed, self-contained JWS. One organization issues it; another organization
verifies it locally, without calling back to the issuer, without an account, and without any shared
online service. This guide walks through that handoff end to end and states precisely what a
successful verification does and does not establish.

The shape is always the same: **organization A issues a record and shares it, along with the public
key, with organization B; organization B verifies it locally.** Nothing in the middle needs to be
online.

## 1. Organization A issues a record and exports the public key

Records are produced with `issue()` from `@peac/protocol` (see [`docs/VERIFY.md`](../VERIFY.md) for
the library form). The signing (private) key never leaves organization A. What A shares is:

- the **compact record** (a JWS string), and
- the **public key** as a JWK or a JWKS (never the private key).

To try the flow without writing any code, generate a sample record and its public key bundle:

```bash
pnpm dlx @peac/cli samples generate -o ./s
# ./s/valid/*.jws            the records
# ./s/bundles/sandbox-jwks.json   the public JWKS
```

A ready-made pair also ships with the browser verifier under
[`apps/verifier/samples/`](../../apps/verifier/samples/): `record.jws` and `key.jwk.json`.

## 2. Organization A transfers the record and key to organization B

Send the record and the public key over any channel: an email attachment, a ticket, a file drop, a
message. Neither is secret; the security of the handoff does not depend on the transport, because
verification checks the signature, not the channel.

If organization B intends to check that the record was signed by a **specific expected key** (not
merely any key A supplies alongside the record), A also communicates the key's RFC 7638 JWK
thumbprint **out of band** so B can pin it. That thumbprint is the only independent trust anchor;
see step 4.

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

- a **trusted JWK thumbprint** is the only independent trust anchor. When B supplies the thumbprint it
  obtained out of band in step 2 and it matches the selected key, the result is reported as
  trusted-key rather than integrity-only.
- **expected issuer**, **allowed key ids**, and **allowed record types** are claim constraints over
  values inside the record. They are useful routing and policy checks, but they are attacker-
  controllable payload values, not trust anchors.

Supplying no context is a valid, integrity-only verification: the signature is checked, and the
result says plainly that the key was not independently established as expected.

## 5. Tamper is detected

Change any byte of the record and verify again. Verification fails at the signature stage with
`E_INVALID_SIGNATURE`: the record no longer matches the signature. The browser verifier ships a
`record-tampered.jws` sample that demonstrates exactly this.

## 6. A deterministic report

The browser verifier can export a deterministic, unsigned verification report for a completed run.
The same inputs and evaluation time produce a byte-identical report, and its hash makes it
reproducible and tamper-evident against a retained reference. The report records the outcome; it does
not, on its own, establish who produced it.

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
