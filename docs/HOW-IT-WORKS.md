# How PEAC works

PEAC is a records layer. You **publish** terms, you **issue** signed records when something happens, another party **verifies** them offline, and the records **travel** across boundaries as portable proof.

The whole protocol is a four-step loop. Most integrations only touch one or two steps directly.

```text
                               +---------------------------+
                               |    1. Publish             |
                               |    /.well-known/peac.txt  |
                               |    peac-issuer.json       |
                               |    JWKS (jwks.json)       |
                               +---------------------------+
                                            |
                                            v
                               +---------------------------+
                               |    2. Issue               |
                               |    issue()                |
                               |    returns compact JWS    |
                               |    typ: interaction-      |
                               |         record+jwt        |
                               +---------------------------+
                                            |
                                            v
                               +---------------------------+
                               |    3. Verify              |
                               |    verifyLocal()          |
                               |    offline                |
                               |    (or /v1/verify)        |
                               +---------------------------+
                                            |
                                            v
                               +---------------------------+
                               |    4. Export / share      |
                               |    PEAC-Receipt header    |
                               |    MCP _meta carrier      |
                               |    A2A metadata carrier   |
                               |    peac-bundle/0.1        |
                               +---------------------------+
```

## 1. Publish

An issuer publishes three machine-readable documents:

- **`/.well-known/peac.txt`** — the policy discovery surface. Human-readable terms, pointer to the issuer config, supported payment rails.
- **`/.well-known/peac-issuer.json`** — the issuer config. Points at the issuer's JWKS URI (for example `jwks_uri: https://issuer.example.com/.well-known/jwks.json`) and declares supported algorithms.
- **JWKS (`jwks.json`)** — the public keys used to sign receipts. Rotated over time with `kid` identifiers.

Specs: [`docs/specs/PEAC-TXT.md`](specs/PEAC-TXT.md), [`docs/specs/PEAC-ISSUER.md`](specs/PEAC-ISSUER.md). The well-known URLs follow RFC 8615.

## 2. Issue

When something happens that another party will need to verify, the issuer creates a signed record:

```typescript
import { issue } from '@peac/protocol';

const jws = await issue(
  {
    iss: 'https://api.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/api-receipt',
    pillars: ['access'],
    ext: { access: { path: '/api/v1/resource', method: 'GET', status: 200 } },
  },
  privateKey
);
```

The output is a compact JWS string (three base64url parts separated by dots). The JOSE header carries `typ: interaction-record+jwt`, `alg: EdDSA`, and `kid` pointing at the key in the issuer's JWKS. The payload carries the claims: `iss`, `kind`, `type`, `pillars`, `iat`, `jti`, optional extensions, optional policy binding.

**Key point:** the `receipt` is a compact JWS. The JOSE `typ` is `interaction-record+jwt`. The HTTP body that carries the receipt is `application/json` (or the `PEAC-Receipt` HTTP header). Do not confuse the JWS `typ` with an HTTP media type.

## 3. Verify

Any party with the issuer's public key can verify the record offline — no call back to the issuer required.

```typescript
import { verifyLocal } from '@peac/protocol';

const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://api.example.com',
});

if (result.valid) {
  console.log(result.claims.type, result.claims.ext);
}
```

Under the hood, `verifyLocal()` checks:

1. JOSE header hardening (no embedded keys, no `crit`, no `zip`, algorithm is Ed25519).
2. Signature validity against the provided public key.
3. Kernel constraints (size caps, pointer depth, canonical form).
4. Schema validity (Wire claims shape, extension groups, pillar taxonomy).
5. Policy binding (if `peac.policy` is present, three-state: `verified` / `failed` / `unavailable`).
6. Timing bounds (`iat` / `nbf` / `exp` within configured clock skew).

For the hosted path, `POST /v1/verify` on the reference verifier returns the same deterministic report (DD-210 shape). See [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml).

## 4. Export and share

Records travel in several carriers depending on the surface:

- **HTTP**: the `PEAC-Receipt` response header carries a compact JWS (up to 8 KiB in the header; larger records use `PEAC-Receipt-Ref` pointing at a fetchable resource).
- **MCP**: the tool-call response `_meta` field carries `org.peacprotocol/receipt_jws` and `org.peacprotocol/receipt_ref` (up to 64 KiB embed).
- **A2A**: the `metadata[extensionURI].carriers[]` array carries receipt records across Agent-to-Agent flows.
- **Bundles**: `peac-bundle/0.1` packages multiple receipts, JWKS snapshots, and policy artifacts into a portable audit file. See [`docs/specs/EVIDENCE-CARRIER-CONTRACT.md`](specs/EVIDENCE-CARRIER-CONTRACT.md).
- **Reports**: the reference verifier returns the deterministic DD-210 verification report; the extended `application/peac-report+json` shape adds timing, report ID, and failure reasons.

## Kinds and types

A record's `kind` is one of two fixed structural values — `evidence` (records what happened) or `challenge` (requests proof from a peer). A record's `type` is an open reverse-DNS or URI identifier for **what** the record represents (for example `org.peacprotocol/payment`, `org.peacprotocol/mcp-tool-call`, `org.peacprotocol/api-receipt`). Extensions are typed data groups organized by pillar (access, attribution, commerce, consent, compliance, privacy, provenance, safety, identity, purpose).

`org.peacprotocol/mcp-tool-call` is an example custom type URI used by the MCP recipe. It is not a registered PEAC extension group or registered receipt type. The reference public verifier (`@peac/protocol.verifyLocal()`) emits a `type_unregistered` warning for unregistered type values, which downstream policy logic may treat as informational. Operators who want a registered MCP-specific receipt type should propose a dedicated PEAC profile and registry entry before relying on it as a registered type.

Normative detail: [`docs/specs/WIRE-0.2.md`](specs/WIRE-0.2.md) and [`docs/specs/PROTOCOL-BEHAVIOR.md`](specs/PROTOCOL-BEHAVIOR.md).

## What PEAC does not do in this loop

PEAC records what another system attested. It does not:

- Decide whether an action is allowed or denied.
- Orchestrate agents, workflows, or commands.
- Settle payments or custody funds.
- Issue identity credentials or manage keys beyond the signing path.
- Host dashboards or telemetry backends.

See [`docs/WHERE-IT-FITS.md`](WHERE-IT-FITS.md) for the boundary next to adjacent systems and [`docs/WHAT-PEAC-STANDARDIZES.md`](WHAT-PEAC-STANDARDIZES.md) for what the protocol defines.
