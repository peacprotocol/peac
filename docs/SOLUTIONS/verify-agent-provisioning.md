# Verify agent provisioning records

> **Outcome:** An agent or operator observed an upstream provisioning workflow and emitted signed PEAC records. You want to verify those records offline as an auditor, counterparty, or reviewer, without calling the system that produced them.
>
> **Audience:** Auditor / counterparty / reviewer.
>
> **Time:** About 5 minutes from a clean clone, using the shipped fixtures.

## The problem

Agentic provisioning tooling sits between agents (or operators) and external service providers — it initializes workspaces, adds resources, issues credentials, rotates them, observes payment authorizations, and so on. The tool has its own logs, but those logs are private to the tool. A reviewer outside the tool has no portable way to confirm what was observed.

PEAC turns each observed event into a signed record using the canonical `org.peacprotocol/provisioning-lifecycle` extension namespace and a `*-observed` type URI per event family. Authorization, validation, provisioning, credential handling, and runtime operation remain upstream responsibilities. PEAC produces a portable, signed record of what the issuer reported observing.

This recipe walks through verifying those records offline.

## What you'll use

PEAC packages:

- `@peac/protocol` — issuance and offline verification.
- `@peac/schema` — `validateProvisioningLifecycle` and the canonical extension key.
- `@peac/crypto` — Ed25519 signing.

Examples and fixtures:

- [`examples/provisioning-lifecycle/`](../../examples/provisioning-lifecycle/) — generic, vendor-neutral demo with one fixture per `*-observed` event family.
- [`examples/agent-provisioning-demo/`](../../examples/agent-provisioning-demo/) — concrete sanitized demo (init, resource, credential issue, credential rotate).

Prerequisites: Node 22+, pnpm 8+. No external service required.

## Step-by-step

1. Install dependencies and build the workspace.

   ```bash
   pnpm install
   pnpm build
   ```

2. Issue signed records from the generic fixtures. The script reads each fixture, validates the extension content through `validateProvisioningLifecycle`, signs an interaction record per fixture, and writes the records and the public key to `examples/provisioning-lifecycle/out/`.

   ```bash
   cd examples/provisioning-lifecycle
   pnpm issue
   ```

   You should see one `[OK]` line per `*-observed` event family.

3. Verify the records offline. The verifier loads the public key plus the signed records and runs `verifyLocal` for each. The private key is not required.

   ```bash
   pnpm verify
   ```

   Each record prints `[OK]`; the summary reports `Verified <count>/<count>`.

4. (Optional) Verify the records through a reference verifier deployment. The reference verifier in [`surfaces/reference-verifier/`](../../surfaces/reference-verifier/) ships a Dockerfile, a Compose file, and a Cloudflare Worker recipe. Each deployment runs the same offline verification. Treat the deployment as informative; the protocol behavior is the same as the local `verifyLocal` call in step 3.

## Evidence of output

A provisioning lifecycle record looks like this (decoded JWS payload):

```json
{
  "iss": "https://provisioning.example.com",
  "iat": 1777630800,
  "jti": "01976d70-0000-7000-8000-000000000000",
  "kind": "evidence",
  "type": "org.peacprotocol/provisioning-credential-observed",
  "pillars": ["provenance"],
  "peac_version": "0.2",
  "schema": "interaction-record+jwt",
  "extensions": {
    "org.peacprotocol/provisioning-lifecycle": {
      "event_kind": "provisioning-credential-observed",
      "observed_at": "2026-05-01T10:20:00Z",
      "observed_by_ref": "urn:peac:agent:demo-issuer",
      "provider": {
        "provider_ref": "urn:peac:provider:example-marketplace"
      },
      "credential": {
        "sub_event": "issued",
        "issuer_ref": "urn:peac:provider:example-marketplace",
        "subject_ref": "urn:peac:resource:db-primary-001",
        "scope_digest": "sha256:...",
        "storage_surface": {
          "kind": "external_secret_store",
          "provider_ref": "urn:peac:provider:secret-store-x",
          "surface_ref": "urn:peac:secret:db-primary-001-credentials",
          "material_redaction": "never_capture"
        }
      }
    }
  }
}
```

A reviewer verifying the record offline can confirm:

- Which issuer signed the record (signature plus `iss`).
- Which event family was observed (`event_kind`).
- When the upstream system reported the event (`observed_at`).
- Which provider, account, resource, credential, payment authorization, budget, subscription, domain, or deployment is referred to (the opaque `*_ref` fields).
- Whether credential material was captured, redacted, or never captured (`storage_surface.material_redaction`).
- A digest of any upstream artifact the observation pins (`upstream_artifact_digest`).

## Boundaries

PEAC records what the issuer reports happened. Authorization, legal acceptance, credential validation, payment processing, provider-state claims, settlement, credential-vault management, and runtime operation remain responsibilities of the upstream systems and their operators. PEAC produces a portable, signed record of the reported observation. PEAC does not authorize the action, verify legal acceptance, validate credentials, process payments, vouch for provider state, settle transactions, manage credential vaults, or operate the runtime. The 10 type URIs all carry the `*-observed` suffix to make the observer scope explicit at the record-type layer.

## Validated with

```bash
pnpm install
pnpm build
pnpm --filter '@peac/schema' test
pnpm --filter '@peac/example-provisioning-lifecycle' run issue
pnpm --filter '@peac/example-provisioning-lifecycle' run verify
pnpm --filter '@peac/example-agent-provisioning-demo' run demo
```

The parity corpus used to exercise the validator's structured-error contract is at [`specs/conformance/parity-corpus/provisioning-lifecycle/`](../../specs/conformance/parity-corpus/provisioning-lifecycle/) (10 positive vectors and 19 negative vectors covering 19 validator-emitted stable error codes under `provisioning.*`; the remaining two codes are exercised in the schema unit tests at [`packages/schema/__tests__/extensions/provisioning-lifecycle.test.ts`](../../packages/schema/__tests__/extensions/provisioning-lifecycle.test.ts)).

## Where to go from here

- [`docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md`](../specs/PROVISIONING-LIFECYCLE-PROFILE.md) — normative profile spec for the extension.
- [`docs/COMPATIBILITY_MATRIX.md`](../COMPATIBILITY_MATRIX.md) — Profile Coverage row for `org.peacprotocol/provisioning-lifecycle`.
- [`docs/WHAT-PEAC-STANDARDIZES.md`](../WHAT-PEAC-STANDARDIZES.md) — what the protocol defines and what it stops at.
- [`examples/provisioning-lifecycle/README.md`](../../examples/provisioning-lifecycle/README.md) — generic example walkthrough.
- [`examples/agent-provisioning-demo/README.md`](../../examples/agent-provisioning-demo/README.md) — concrete sanitized demo walkthrough; mentions the upstream contexts (such as the Stripe Projects provisioning CLI and Cloudflare's worker, secret, and route configuration commands) the pattern generalizes across.
