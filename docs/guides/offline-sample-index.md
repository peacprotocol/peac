# Offline sample index

`@peac/cli` ships a set of sample records you can generate and verify offline with only a public key. They let you exercise the verification paths in [Verification options](verification-options.md) without trusting any hosted service: the valid records are expected to verify, and the invalid fixtures are expected to be rejected.

## Generate the samples

```bash
pnpm dlx @peac/cli samples generate -o ./s
```

This writes the valid records under `./s/valid/`, the invalid rejection fixtures under `./s/invalid/`, and the single-key sandbox public key at `./s/bundles/sandbox-jwks.json`.

## Valid records

These verify offline against the sandbox key. Verify any of them with:

```bash
pnpm dlx @peac/cli verify ./s/valid/<id>.jws --public-key ./s/bundles/sandbox-jwks.json
```

| Record              | What it is                                                     |
| ------------------- | -------------------------------------------------------------- |
| `basic-record`      | Minimal valid signed interaction record.                       |
| `full-record`       | Valid record with optional fields (subject, declared purpose). |
| `mcp-tool-run`      | Valid record for an MCP tool run.                              |
| `payment-event`     | Valid record for a payment event.                              |
| `event-time-record` | Valid record carrying an event time (`occurred_at`).           |

A valid record prints:

```text
Signature valid (offline).
```

## Invalid records

These are intentionally invalid rejection fixtures. They demonstrate that verification fails closed; a verifier rejects them rather than accepting a bad record.

| Record        | Why it is rejected                                  |
| ------------- | --------------------------------------------------- |
| `expired`     | Already expired.                                    |
| `future-iat`  | Issuance time in the future (clock-skew violation). |
| `missing-iss` | Missing the required issuer claim.                  |

## Related

- [`docs/guides/verification-options.md`](verification-options.md) — the three verification paths.
- [`docs/VERIFY.md`](../VERIFY.md) — command-line and library verification walkthrough.
- [`specs/conformance/samples/README.md`](../../specs/conformance/samples/README.md) — the canonical sample reference.
