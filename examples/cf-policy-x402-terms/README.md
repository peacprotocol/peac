# cf-policy-x402-terms

End-to-end demo composing PEAC policy binding with x402 PR-1986 `terms`
across the four representation envelopes (`uri`, `markdown`,
`plaintext`, `json`).

This demo is offline by default. PEAC composes with Cloudflare delivery
surfaces (Markdown for Agents, AI Crawl Control, x402 SDKs) and with
x402 PR-1986 `terms`; PEAC does not replace either.

## What it shows

1. A `peac-policy/0.1` document is canonicalized via JCS+SHA-256 and
   bound into a Wire 0.2 evidence receipt's `policy.digest` field.
2. The same document advertises x402 `terms` in four representations
   (under `terms/`). Each representation envelope produces its own
   binding identity via `computeX402TermsDigest`.
3. The verifier is invoked offline with `verifyLocal()`. The caller
   threads a pre-computed `bindings.terms` result through; the
   verifier surfaces it on the report without ever performing network
   I/O on the terms URI.
4. Cross-representation comparison is `failed` by design: a JSON
   publisher digest cannot match a plaintext verifier digest of
   nominally-equivalent content.
5. An omitted publisher canonical digest reports `unavailable`, not
   `failed`. Verifiers MUST NOT synthesize a canonical digest from a
   non-JSON representation.

## Run

```bash
pnpm install
pnpm --filter @peac/example-cf-policy-x402-terms demo
```

Expected output (truncated):

```text
cf-policy-x402-terms demo
==========================

[1] policy digest:  sha256:<64 hex>
[2] jws issued:     length=<n>

[3] per-representation terms digests:
    uri       = unavailable
    markdown  = sha256:<64 hex>
    plaintext = sha256:<64 hex>
    json      = sha256:<64 hex>

[4] verifyLocal report:
    valid:               true
    wireVersion:         0.2
    policy_binding:      verified
    bindings.policy:     verified
    bindings.terms.ref:  terms.md
    bindings.terms.repr: markdown
    bindings.terms.stat: verified

[5] cross-representation (json publisher vs plaintext verifier): failed
[6] omitted publisher canonical_digest: unavailable

Demo OK.
```

## What this demo intentionally does NOT do

- Fetch the URI representation. PEAC does not perform network I/O from
  the binding layer. The URI representation reports `unavailable`
  unless the caller supplies fetched bytes under their own SSRF /
  redirect / timeout policy.
- Synthesize a canonical JSON digest from the markdown or plaintext
  representations. Cross-representation equivalence is publisher-
  asserted only; verifiers report `unavailable` when the publisher
  did not supply a `canonical_digest`.
- Stamp the `terms` digest into the emitted receipt or envelope. The
  digest is verifier-report-only; see
  [docs/specs/DOCUMENT-BINDING.md](../../docs/specs/DOCUMENT-BINDING.md).

## Composition surfaces

- **Cloudflare Markdown for Agents** can deliver the markdown
  representation via `Accept: text/markdown` with `vary: accept` and
  `content-signal` headers. The PEAC binding still applies because the
  bytes are the binding identity, not the transport.
- **Cloudflare AI Crawl Control** can enforce access to the policy and
  terms surfaces. PEAC records what was bound and verified; AI Crawl
  Control records who reached it.
- **x402 PR-1986** defines the `terms` field used here. PEAC adds the
  binding/proof layer the upstream PR explicitly does not define.
- **AIPREF** content-use signals can be projected into PEAC records
  via `@peac/mappings-content-signals`. Preferences are NOT consent;
  see [docs/privacy/DATA-SUBJECT-RIGHTS.md](../../docs/privacy/DATA-SUBJECT-RIGHTS.md) §2.

## Files

```text
policy.yaml                policy source (peac-policy/0.1)
terms/terms.uri.txt        URI-only representation (returns unavailable without bytes)
terms/terms.md             markdown representation
terms/terms.plaintext.txt  plaintext representation
terms/terms.json           JSON representation
demo.ts                    end-to-end runner
tests/demo.test.ts         smoke test that runs the demo and pins expected output
```

Expected verifier-report values are pinned inside `tests/demo.test.ts`; no separate fixture directory is needed for this demo.
