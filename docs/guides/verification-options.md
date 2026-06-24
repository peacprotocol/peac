# Verification options

A PEAC record is a signed JWS. Its signature can be verified offline with the issuer's public key; hosted verification may also perform issuer discovery and policy-binding checks depending on the request. This guide lays out the three verification paths that already ship in this repository, so you can pick the one that fits where verification happens. For the command-line and library walkthrough in depth, see [`docs/VERIFY.md`](../VERIFY.md).

## The three paths

| Path             | Where it runs              | Use it when                                                                   |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------- |
| CLI offline      | A terminal, no network     | You want to verify a file locally or in CI.                                   |
| Browser verifier | A static page, client-side | You want to paste or drop a record and verify it in a browser with no server. |
| Self-host HTTP   | A container you run        | You want a verify endpoint other services can call.                           |

### 1. CLI offline

Generate the sample records and verify one with only the bundled public key:

```bash
pnpm dlx @peac/cli samples generate -o ./s
pnpm dlx @peac/cli verify ./s/valid/basic-record.jws --public-key ./s/bundles/sandbox-jwks.json
```

Expected output:

```text
Signature valid (offline).
```

No network calls are made when `--public-key` is supplied. See [`docs/VERIFY.md`](../VERIFY.md) for the `verifyLocal()` library form and the issuer-discovery (network JWKS) path.

### 2. Browser verifier

[`apps/verifier/`](../../apps/verifier/) is a client-side browser verifier. All verification runs locally with `verifyLocal()` from `@peac/protocol`; no record is sent to any server. Add the trusted issuer public key to its trust store, then paste or drop a record.

```bash
# from apps/verifier/
pnpm install
pnpm dev
# opens on http://localhost:5173
```

See [`apps/verifier/README.md`](../../apps/verifier/README.md) for the trust-store and build details.

### 3. Self-host HTTP

[`surfaces/reference-verifier/`](../../surfaces/reference-verifier/) packages the verify API ([`apps/api/`](../../apps/api/)) as a container you can run. The canonical verify operation is `POST /v1/verify`.

```bash
# from surfaces/reference-verifier/
docker compose up -d
curl -s http://localhost:3000/health
```

The canonical verify contract is [`packages/schema/openapi/verify.yaml`](../../packages/schema/openapi/verify.yaml); see [`docs/HOSTED_VERIFY_CONTRACT.md`](../HOSTED_VERIFY_CONTRACT.md) for the request/response shape, error catalog, and the deprecated `/api/v1/verify` and `/verify` aliases. These recipes are for local evaluation, CI smoke tests, and single-tenant self-hosting; multi-tenant hosted operation is out of scope.

## Try it on sample records

Every path above can verify the shipped sample records. See the [Offline sample index](offline-sample-index.md) for the full set of valid and invalid records and the one-liner to verify each offline.

## Related

- [`docs/VERIFY.md`](../VERIFY.md) — command-line and library verification walkthrough.
- [`docs/guides/offline-sample-index.md`](offline-sample-index.md) — the shipped valid and invalid sample records.
- [`docs/START_HERE.md`](../START_HERE.md) — entry path by role.
