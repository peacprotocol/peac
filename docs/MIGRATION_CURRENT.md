# Migration Guide

This guide covers migration paths for current PEAC Protocol surfaces.

## A2A v0.3.0 compatibility removal (v0.13.0)

A2A v0.3.0 compatibility was deprecated in v0.12.3 (DD-186) after the A2A v1.0.0 upstream stabilization and **removed in v0.13.0 PR B**. `@peac/mappings-a2a` now validates A2A v1.0.0 shapes only.

Surfaces removed:

- **Agent Card top-level `url`.** v0.3.0 cards carried the endpoint URL as `AgentCard.url`. v1.0.0 replaced this with `supportedInterfaces[]`. Cards without a valid `supportedInterfaces[0].url` are rejected at **runtime**: `normalizeAgentCard(card)` returns `null` and `discoverAgentCard(...)` skips them. (The `A2AAgentCard` interface intentionally keeps a `[key: string]: unknown` index signature so incoming JSON with unknown extra fields still typechecks; type-level rejection is NOT claimed. The v0.3.0 removal is enforced by the normalization layer, not the type system.)
- **Kebab-case TaskState strings.** v0.3.0 used `"working"`, `"completed"`, `"input-required"`, etc. v1.0.0 uses SCREAMING_SNAKE_CASE with a type prefix (`"TASK_STATE_WORKING"`, `"TASK_STATE_COMPLETED"`, `"TASK_STATE_INPUT_REQUIRED"`). The `normalizeTaskState` function and the `TASK_STATE_V03_TO_V1` map are removed. Callers MUST supply v1.0.0 TaskState values directly.
- **`/.well-known/agent.json` legacy discovery path.** `discoverAgentCard(baseUrl)` now fetches only the v1.0.0 canonical path `/.well-known/agent-card.json`. Deployers still serving the legacy path should publish the canonical path or upgrade to an A2A v1.0.0 implementation.
- **Deprecation-warning plumbing.** `_resetDeprecationWarning` is gone; no v0.3.0 `DeprecationWarning` is emitted because v0.3.0 inputs are now rejected outright rather than normalized with a warning.

**Migration:**

```ts
// Before (v0.3.0 shape; no longer accepted at v0.13.0)
const card = { name: 'agent', url: 'https://agent.example' };

// After (v1.0.0 shape)
const card = {
  name: 'agent',
  supportedInterfaces: [
    { url: 'https://agent.example', protocolBinding: 'http+json', protocolVersion: '1.0.0' },
  ],
};

// TaskState values must already be v1.0.0
const state = 'TASK_STATE_WORKING'; // previously 'working'
```

`A2A_MAX_CARRIER_SIZE` (`65_536` bytes) is unchanged. `PEAC_EXTENSION_URI`, the `capabilities.extensions[]` registration pattern, and the `metadata[extensionURI].carriers[]` placement convention are all unchanged. The v0.3.0 removal is scoped strictly to the dual-version acceptance surface; v1.0.0 behavior is byte-stable. See `docs/specs/A2A-RECEIPT-PROFILE.md` for the normative v1.0.0 profile.

## ProofMethodSchema removal (v0.13.0)

`ProofMethodSchema`, `PROOF_METHODS`, and the `ProofMethod` type were deprecated in v0.12.2 (DD-185) and **removed in v0.13.0 PR B**. The deprecated standalone schema export retired because transport-binding methods are semantically distinct from trust-root proof models; the two concerns should not share a public surface.

`AgentProofSchema.method` still accepts the same four transport-binding values — the enum is now inlined on the field definition:

- `http-message-signature`
- `dpop`
- `mtls`
- `jwk-thumbprint`

Migration by use site:

- **If you imported `ProofMethodSchema` to validate a method string in isolation:** inline the enum yourself (`z.enum(['http-message-signature', 'dpop', 'mtls', 'jwk-thumbprint'])`) or, preferably, validate the whole proof object through `AgentProofSchema.parse(...)`.
- **If you imported the `ProofMethod` type for a function signature:** replace with `"http-message-signature" | "dpop" | "mtls" | "jwk-thumbprint"` or derive from the schema: `type Method = z.infer<typeof AgentProofSchema>['method']`.
- **If you want trust-root proof semantics (how an identity proves itself):** use `ProofTypeSchema` and the `PROOF_TYPES` constant. `ProofType` (8 values: `did-web`, `did-key`, `did-plc`, `did-ion`, `x509-chain`, `ed25519-cert-chain`, `hsm-attestation`, `custom`) was always the canonical trust-root surface; it is unchanged.

**No wire-format change.** Existing valid `AgentProofSchema.method` values continue to validate. No envelope, no `typ`, no signing change.

See `docs/PACKAGE_STATUS_V0.13.0_PARITY.md` for the per-export parity table used to scope v0.13.0 schema removals.

## Package-surface cleanup (v0.13.0)

v0.13.0 finishes the scheduled package-surface cleanup. Deprecate-then-remove discipline applies throughout: historical npm versions are never unpublished.

### `@peac/pref` — archived

**State at v0.13.0:** archived. The workspace package at `packages/aipref/` moved to `archive/pref/` and `@peac/pref` is no longer published. Historical npm versions `<=0.12.14` remain installable and emit a one-shot `PEAC_DEPRECATED_PREF` `DeprecationWarning` on import.

**Migration:** replace imports from `@peac/pref` with equivalent canonical exports in [`@peac/mappings-content-signals`](../packages/mappings/content-signals/). The canonical package implements RFC 9651 Structured Fields `Content-Usage` parsing, RFC 9309 `robots.txt`, tdmrep, and full-length RFC 8785 JCS + SHA-256 content digests without the truncated-digest bug from pre-v0.12.14 `@peac/pref`.

```ts
// Before (v0.12.14 and earlier)
import { resolveAIPref, type PrefResolver } from '@peac/pref';

// After (v0.12.14 onward; @peac/pref archived in v0.13.0)
import { resolveSignals, type SignalResolver } from '@peac/mappings-content-signals';
```

No runtime behavior change: `@peac/pref` v0.12.14 was already a facade over `@peac/mappings-content-signals`.

### `@peac/disc`: archived (v0.13.1)

**State at v0.13.1:** archived. The package is removed from the workspace (its source moved to `archive/discovery/`) and from `scripts/publish-manifest.json`. Active publish-manifest count drops 37 → 36. Historical npm versions (≤ 0.13.0) remain installable from the npm registry but are deprecated; the deprecation messages were dispatched at v0.13.0.

The CLI `peac discover <url>` command continues to work via an internal helper at `packages/cli/src/lib/policy-document-discovery.ts` that uses public `@peac/net-node.safeFetchRaw` and `@peac/policy-kit.parsePolicyDocument`, plus a tolerant two-pass parse step that preserves the legacy-line behavior the retired package used to provide. The helper is not exported from `@peac/cli`'s public surface; external consumers needing the same compatibility behavior can copy the pattern from `archive/discovery/src/parser.ts`.

**Migration guidance (by export):**

- **`import { parse } from '@peac/disc'`** → `import { parsePolicyDocument } from '@peac/policy-kit'` for **strict** parsing of `peac-policy/0.1` documents. **Note:** `parsePolicyDocument` throws `PolicyValidationError` / `PolicyLoadError` on failure, where the retired `@peac/disc.parse` returned a structured `ParseResult { valid, data?, errors?, warnings? }` and was tolerant of legacy key-discovery lines (`verify:`, `public_keys:`, `jwks:`) via a two-pass strip-and-retry. If you need the tolerant behavior, copy the `parsePolicyDocumentCompat` helper pattern from `archive/discovery/src/parser.ts` into your own code.

- **`import { loadPolicyDocument } from '@peac/disc'`** → `import { loadPolicyDocument } from '@peac/policy-kit'` (already supported since v0.12.14).

- **`import { discover } from '@peac/disc'`** → combine an SSRF-safe HTTP client with the parse step above. Recommended primitive: `@peac/net-node.safeFetchRaw` (SSRF-safe, byte-capped, timeout-bounded, redirect-policy-aware). Path comes from `@peac/kernel.POLICY.manifestPath` (`/.well-known/peac.txt`); body cap from `@peac/kernel.POLICY.maxBytes` (262144). Set the `safeFetchRaw` option `maxResponseBytes` to that value. The retired `@peac/disc.discover()` used a 5 000 ms timeout; `@peac/kernel` does not currently expose a discovery timeout constant, so set `timeoutMs: 5_000` directly on the fetch options if you want the pre-retirement default. **Always call `await raw.close()` in a `finally` block after reading the response body to avoid socket leaks** (this was implicit in `@peac/disc`; it is explicit in `safeFetchRaw`).

  The CLI source at `packages/cli/src/commands/discover.ts` and the helper at `packages/cli/src/lib/policy-document-discovery.ts` are reference implementations of the retired API surface; they are CLI-internal and not part of `@peac/cli`'s public TypeScript surface.

- **Constants (`WELL_KNOWN_PATH`, `MAX_BYTES`, `DEFAULT_TIMEOUT_MS`):**
  - `WELL_KNOWN_PATH` → `@peac/kernel.POLICY.manifestPath`.
  - `MAX_BYTES` → `@peac/kernel.POLICY.maxBytes`.
  - `DEFAULT_TIMEOUT_MS` → no kernel equivalent; pin a CLI-local constant to `5_000` if you need the pre-retirement default.

No new published version of `@peac/disc` ships from v0.13.1 onward.

### `@peac/core` — archived

**State at v0.13.0:** archived. `@peac/core` was the v0.9.x `peac.receipt/0.9` verify-only implementation. Source moved from `packages/core/` to `archive/0.9.0-0.9.14/packages-core/`. `@peac/core` is **not published at v0.13.0 or later**. Historical npm versions `<=0.9.14` remain installable for verify-only use of historical `peac.receipt/0.9` records. The archive is coupled with the legacy `POST /verify` handler rewire: `apps/api/src/verifier.ts` was deleted (it was the only remaining active consumer), and the legacy `/verify` route now delegates in-process to the canonical `/v1/verify` handler while stamping RFC 9745 `Deprecation: true`, RFC 8594 `Sunset: Sat, 01 Nov 2026 00:00:00 GMT`, and RFC 8288 `Link` headers on every response.

**Migration:** use `@peac/protocol` (`issue`, `verifyLocal`, `verify`), `@peac/schema` (types), `@peac/crypto` (sign / verify primitives), and `@peac/kernel` (wire constants).

### Empty Layer-6 pillar stubs — archived

**State at v0.13.0:** archived. Five empty pillar stubs moved from `packages/*/` to `archive/pillars/*/`:

- `packages/access` → `archive/pillars/access`
- `packages/compliance` → `archive/pillars/compliance`
- `packages/consent` → `archive/pillars/consent`
- `packages/intelligence` → `archive/pillars/intelligence`
- `packages/provenance` → `archive/pillars/provenance`

None of these were ever published to npm `latest`; they were workspace-internal stubs. The pillar concepts remain part of the PEAC 10-pillar taxonomy. No migration is required for external consumers.

Kept in workspace as shipping packages:

- `packages/attribution` (published; real content)
- `packages/privacy` (scaffold with real content — k-anonymity helpers)

### `packages/sdk-js/` workspace stub — already archived

`@peac/sdk` source lives in `archive/sdk-js/` from prior releases. The v0.13.0 workspace has no `packages/sdk-js/` tracked entry. Historical `@peac/sdk` npm versions remain installable; consumers should migrate to `@peac/protocol` / `@peac/schema` / `@peac/crypto` / `@peac/kernel`. See `archive/sdk-js/README.md` for the historical context.

### `npm deprecate` dispatch

Staged at [`scripts/release/npm-deprecate-v0.13.0.sh`](../scripts/release/npm-deprecate-v0.13.0.sh). Executed manually after promote. Covers `@peac/pref@<=0.12.14`, `@peac/sdk@<=0.10.2`, `@peac/disc@<=0.12.14`, `@peac/disc@0.13.0` (marked as a one-release compatibility bridge), and `@peac/core@<=0.9.14`.

---

## Documentation reorganization (v0.12.12)

The documentation surface has been reorganized around five new operator-facing docs and a curated solutions library. If you previously linked to sections of the monolithic developer guide, the following map applies:

- The **role-based entry point** is now [`docs/START_HERE.md`](START_HERE.md). It is the single top-level job selector; the README points to it first.
- **How PEAC works** (the publish / issue / verify / share loop and the distinction between the compact JWS `receipt`, the JOSE `typ`, and the HTTP body) is now at [`docs/HOW-IT-WORKS.md`](HOW-IT-WORKS.md).
- **The artifact taxonomy** (record, receipt, evidence, bundle, report) is now at [`docs/ARTIFACTS.md`](ARTIFACTS.md). These nouns each have one specific meaning; mixing them up loses information.
- **Where PEAC sits next to adjacent systems** (logs / traces / OpenTelemetry, runtime governance, payment rails, identity, native runtime attestations) is now at [`docs/WHERE-IT-FITS.md`](WHERE-IT-FITS.md).
- **Protocol scope and boundary** are summarized at [`docs/WHAT-PEAC-STANDARDIZES.md`](WHAT-PEAC-STANDARDIZES.md).
- **Outcome-led recipes** live under [`docs/SOLUTIONS/`](SOLUTIONS/): runtime evidence export, API receipt issuance, MCP tool-call receipts, commerce evidence bundle, and regulatory audit trail.
- **Self-host deployment recipes** for the reference verifier live under [`surfaces/reference-verifier/`](../surfaces/reference-verifier/): Dockerfile, docker-compose, a Cloudflare Worker variant, and a smoke script.

The long-form developer guide at [`docs/README_LONG.md`](README_LONG.md) is retained as the deep package catalog for contributors. It is no longer the recommended starting point for first-time readers.

## From Wire 0.1 to Wire 0.2

Wire 0.1 (`peac-receipt/0.1`) is frozen legacy. Wire 0.2 (`interaction-record+jwt`) is the current stable format.

### Issuance

```typescript
// Before (Wire 0.1, deprecated)
import { issueWire01 } from '@peac/protocol';
const jws = await issueWire01({ iss, aud, sub, iat, evidence, ... }, privateKey);

// After (Wire 0.2, current)
import { issue } from '@peac/protocol';
const jws = await issue({
  iss: 'https://example.com',   // canonical iss: https:// or did: only
  kind: 'evidence',             // 'evidence' or 'challenge'
  type: 'org.peacprotocol/commerce',
  pillars: ['commerce'],
  ext: { commerce: { ... } },   // typed extension groups
}, privateKey);
```

### Verification

```typescript
// Before (Wire 0.1, deprecated)
import { verifyReceipt } from '@peac/core';
const result = await verifyReceipt(jws, publicKey);

// After (Wire 0.2, current)
import { verifyLocal } from '@peac/protocol';
const result = await verifyLocal(jws, publicKey);
// result.verified: boolean
// result.claims: Wire02Claims (typed)
// result.warnings: VerificationWarning[]
// result.policy_binding?: 'verified' | 'failed' | 'unavailable'
```

### Key differences

| Aspect           | Wire 0.1           | Wire 0.2                                                              |
| ---------------- | ------------------ | --------------------------------------------------------------------- |
| JWS `typ` header | `peac-receipt/0.1` | `interaction-record+jwt`                                              |
| Structural kinds | None               | `evidence` or `challenge` (required)                                  |
| Semantic type    | Implicit           | Required, reverse-DNS or URI                                          |
| Pillars          | None               | Optional multi-valued, 10-pillar taxonomy                             |
| Extension groups | None               | 12 typed groups (commerce, access, identity, ...)                     |
| `iss` format     | Loose              | Canonical: `https://` or `did:` only                                  |
| Policy binding   | None               | JCS (RFC 8785) + SHA-256, 3-state result                              |
| JOSE hardening   | Basic              | Strict: embedded keys rejected, `crit` rejected, `b64:false` rejected |

## From `@peac/core` to `@peac/protocol`

`@peac/core` is archived at v0.13.0. Migrate to the kernel-first packages.

### Import changes

```typescript
// Before
import { sign, verifyReceipt, WIRE_VERSION } from '@peac/core';

// After
import { issue, verifyLocal } from '@peac/protocol';
import { WIRE_01_JWS_TYP, WIRE_02_JWS_TYP } from '@peac/kernel';
import { generateKeypair, verify } from '@peac/crypto';
```

### Function mapping

| `@peac/core`      | Replacement                                | Package                    |
| ----------------- | ------------------------------------------ | -------------------------- |
| `sign()`          | `issue()`                                  | `@peac/protocol`           |
| `verifyReceipt()` | `verifyLocal()`                            | `@peac/protocol`           |
| `WIRE_VERSION`    | `WIRE_01_JWS_TYP` / `WIRE_02_JWS_TYP`      | `@peac/kernel`             |
| `enforce()`       | Use middleware: `@peac/middleware-express` | `@peac/middleware-express` |
| `discover()`      | `discoverIssuer()`                         | `@peac/disc`               |

## From legacy API `/verify` to `/v1/verify`

The legacy `/verify` endpoint is deprecated (Sunset: Nov 1, 2026). Migrate to the canonical `/v1/verify`. The `/verify` and `/api/v1/verify` paths remain runtime-reachable as deprecated compatibility aliases; they delegate in-process to the canonical `/v1/verify` handler, return the same response shape, and stamp RFC 9745 `Deprecation: true`, RFC 8594 `Sunset: Sat, 01 Nov 2026 00:00:00 GMT`, and RFC 8288 `Link: <https://www.peacprotocol.org/docs/migration>; rel="deprecation"` on every response. New integrations must target `/v1/verify`, which is the only path documented in the public OpenAPI contract ([`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml), [`docs/HOSTED_VERIFY_CONTRACT.md`](HOSTED_VERIFY_CONTRACT.md)).

### Request

```bash
# Before
curl -X POST https://api.example.com/verify \
  -H "Content-Type: application/json" \
  -d '{"receipt": "<jws>"}'

# After (canonical)
curl -X POST https://api.example.com/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"receipt": "<jws>"}'
```

### Response differences

| Aspect             | Legacy `/verify` | Current `/v1/verify`                                |
| ------------------ | ---------------- | --------------------------------------------------- |
| Error format       | Custom JSON      | RFC 9457 Problem Details                            |
| Rate limiting      | None             | `RateLimit-*` headers                               |
| Deprecation signal | None             | `Sunset` + `Deprecation` headers on legacy endpoint |

## From `@peac/sdk` to `@peac/protocol`

`@peac/sdk` is archived. Use `@peac/protocol` directly.

```typescript
// Before
import { PeacClient } from '@peac/sdk';
const client = new PeacClient();
const result = await client.verifyLocal(jws, publicKey);

// After
import { verifyLocal } from '@peac/protocol';
const result = await verifyLocal(jws, publicKey);
```

`@peac/protocol` re-exports all crypto utilities needed for a complete workflow: `generateKeypair`, `base64urlDecode`, `base64urlEncode`, `sha256Hex`, `verify`, `jwkToPublicKeyBytes`, `computeJwkThumbprint`.
