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

### `@peac/disc` — published deprecated compatibility package

**State at v0.13.0:** deprecated (but **published as a compatibility package**; not a thin alias). `@peac/disc@0.13.0` ships with its existing API surface intact: `parse`, `emit`, `validate`, `discover`, `WELL_KNOWN_PATH`, `MAX_BYTES`, `DEFAULT_TIMEOUT_MS`, and related types. The barrel emits a one-shot `PEAC_DISC_DEPRECATED` `DeprecationWarning` on import. Publishing continues through v0.13.0 because `@peac/cli` and the reference verifier (`apps/api`) depend on `@peac/disc` via `workspace:*`; removing the package while published consumers still declare the dependency would break publish closure (a `@peac/cli@0.13.0` tarball with an unsatisfiable `@peac/disc@0.13.0` dependency is release-breaking). Installability beats surface-count optics.

**Removal target:** a later release. See [`docs/PACKAGE_STATUS_V0.13.0_PARITY.md`](./PACKAGE_STATUS_V0.13.0_PARITY.md) for the per-export compatibility coverage: which exports have direct `@peac/policy-kit` equivalents today and which (notably `discover()`) do not.

**Migration guidance (by export):**

- **Policy-document parsing and validation:** prefer [`@peac/policy-kit`](../packages/policy-kit/) directly. Canonical replacements already exist and are shipping at v0.13.0:

  ```ts
  // Before (via @peac/disc)
  import { parse, validate } from '@peac/disc';

  // After (direct @peac/policy-kit)
  import {
    parsePolicyDocument, // canonical parser (pure; no network)
    loadPolicyDocument, // alias over parsePolicyDocument, shipped v0.13.0
    validatePolicy, // canonical validator
    serializePolicyYaml, // canonical YAML serializer (replaces emit())
  } from '@peac/policy-kit';
  ```

- **Remote discovery (`discover()`) — has NO direct equivalent in `@peac/policy-kit` yet.** `@peac/policy-kit` is a pure parser package that operates on already-fetched bytes; it has no remote-fetch surface. `@peac/disc.discover()` performs SSRF-aware `fetch` injection, timeout management (`DEFAULT_TIMEOUT_MS = 5000`), a 256 KiB byte cap (`MAX_BYTES = 262144`), redirect policy, and well-known path resolution. Consumers that rely on this behavior should **stay on `@peac/disc@0.13.0`** through the v0.13.0 release window. A later release ports `discover()` (or a callable-fetch variant) to a canonical public surface; see [`docs/PACKAGE_STATUS_V0.13.0_PARITY.md`](./PACKAGE_STATUS_V0.13.0_PARITY.md) for the design options under consideration.

- **Constants (`WELL_KNOWN_PATH`, `MAX_BYTES`, `DEFAULT_TIMEOUT_MS`):** port to `@peac/policy-kit` scheduled alongside the `discover()` migration.

Summary: migrate parse / validate / emit to `@peac/policy-kit` now if your code only touches policy documents. Keep `@peac/disc@0.13.0` installed if your code needs `discover()` or the associated constants; migrate once the remote-fetch surface ports.

### `@peac/core` — archive coupled with legacy `/verify` handler rewire

**State:** `@peac/core` is the v0.9.x `peac.receipt/0.9` verify-only implementation and remains marked deprecated. Archival is coupled with the legacy `POST /verify` HTTP handler rewire (the only remaining active consumer is `apps/api/src/verifier.ts`). When that rewire lands, `packages/core/` moves to `archive/0.9.0-0.9.14/@peac-core/`, `apps/api/src/verifier.ts` is deleted, and the legacy `/verify` route delegates internally to the canonical `/v1/verify` handler while preserving its advertised `Sunset: Sat, 01 Nov 2026 00:00:00 GMT` (RFC 8594).

**Migration:** use `@peac/protocol` (`issue`, `verifyLocal`, `verify`), `@peac/schema` (types), `@peac/crypto` (sign / verify primitives), and `@peac/kernel` (wire constants). Historical `@peac/core@<=0.9.14` versions on npm remain installable for verify-only use of historical `peac.receipt/0.9` records.

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

Staged at [`scripts/release/npm-deprecate-v0.13.0.sh`](../scripts/release/npm-deprecate-v0.13.0.sh). Executed manually after promote. Covers `@peac/pref@<=0.12.14`, `@peac/sdk@<=0.10.2`, `@peac/disc@<=0.12.14`, and `@peac/disc@0.13.0` (explicitly marked as a one-release compatibility bridge). `@peac/core` deprecate line is present but commented until the legacy `/verify` handler rewire lands.

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

`@peac/core` is deprecated (removal: v0.13.0). Migrate to the kernel-first packages.

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

The legacy `/verify` endpoint is deprecated (Sunset: Nov 1, 2026). Migrate to the canonical `/v1/verify`. The `/api/v1/verify` path remains wired as a deprecated alias and resolves to the same handler; new code should use `/v1/verify`, which is the path documented in [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml) and [`docs/HOSTED_VERIFY_CONTRACT.md`](HOSTED_VERIFY_CONTRACT.md).

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
