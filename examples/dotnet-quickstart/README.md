# PEAC .NET quickstart

This is a quickstart example showing how a .NET developer can verify
PEAC interaction records (`typ = interaction-record+jwt`, Ed25519)
from a clean clone using committed local fixtures.

**This is not an official PEAC .NET SDK.** PEAC ships no NuGet package,
no public .NET protocol surface, and no `sdks/dotnet/` directory. The
example exists so a .NET developer can confirm that a record produced
by PEAC anywhere is verifiable by any party with the issuer's public
key, without any PEAC-authored .NET library.

## Outcome

A console program that reads:

- `examples/dotnet-quickstart/fixtures/pubkey.json` — committed Ed25519
  issuer public key, kid, and `iss`.
- `examples/dotnet-quickstart/fixtures/records.json` — six committed
  signed records covering every `org.peacprotocol/agent-action-*-observed`
  event kind.

and verifies each record. Exit status is `0` when every record verifies;
non-zero otherwise.

Restore/build may contact the configured NuGet feed to fetch the direct
Ed25519 verification package and any transitive native dependencies. The
verification program itself performs no network access at runtime and
reads only the committed local files above. There is no hosted verifier
dependency and no live vendor transcript.

## What the quickstart verifies per record

1. The compact JWS parses into three non-empty base64url-encoded segments
   (header / payload / signature).
2. The JOSE header is `{ "typ": "interaction-record+jwt", "alg":
"EdDSA", "kid": <issuer-kid> }`.
3. The Ed25519 signature over `<header>.<payload>` is valid for the
   committed issuer public key (32 raw bytes, base64url-decoded from
   `public_key_b64u`).
4. The payload `iss` claim matches the issuer's canonical URL.
5. The payload `kind` claim equals `"evidence"`.
6. The payload `type` claim matches the index entry's `type`
   (cross-checks that the index in `records.json` has not drifted from
   the signed payload).

## Prerequisites

- .NET 10 SDK, latest patch recommended.

`dotnet --version` should print a version starting with `10.`. The
example uses no PEAC-authored .NET package; the only direct NuGet
dependency is `NSec.Cryptography`, a public libsodium-backed
cryptography library used here for Ed25519 verification. Restore may
also fetch NSec's transitive native dependencies.

## Run

From a clean clone:

```bash
dotnet restore examples/dotnet-quickstart/PeacDotnetQuickstart.csproj
dotnet build   examples/dotnet-quickstart/PeacDotnetQuickstart.csproj --configuration Release --no-restore
dotnet run     --project examples/dotnet-quickstart/PeacDotnetQuickstart.csproj --configuration Release --no-build
```

You should see one `[OK]` line per record and a summary like:

```text
Verified 6 of 6 record(s) from local fixtures.
```

## What this example does not verify

This example is intentionally small. It verifies compact JWS structure,
JOSE header fields (`typ`, `alg`, `kid`, and rejection of unsupported
`crit` / `b64`), Ed25519 signature validity, issuer binding, record
kind, record type, and the agent-action extension event kind. It is
not a full PEAC schema validator and does not replace the canonical
TypeScript verifier or the conformance suite under `specs/conformance/`.

## Boundary

The PEAC project does NOT:

- publish a NuGet package
- ship a public .NET SDK
- ship an `sdks/dotnet/` directory
- maintain .NET protocol APIs as a public surface
- vouch for any third-party .NET Ed25519 implementation

The example uses `NSec.Cryptography` as a standard, publicly-available
Ed25519 implementation purely for the demonstration. Any other Ed25519
library that implements the standard `<base64url(header)>.<base64url(payload)>`
signing-input contract would work the same way.

## Related documents

- [Verify agent-action records](../../docs/SOLUTIONS/verify-agent-action.md) — the canonical SOLUTIONS recipe this example mirrors.
- [Agent Action Records profile](../../docs/specs/AGENT-ACTION-RECORDS.md) — normative profile for the records this example verifies.
- [Wire 0.2 spec](../../docs/specs/WIRE-0.2.md) — the `interaction-record+jwt` envelope.
- [Compatibility matrix](../../docs/COMPATIBILITY_MATRIX.md) — Wire 0.2 surface inventory.
