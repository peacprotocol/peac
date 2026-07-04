# PEAC Integration Kit: Stripe Projects

Informative guide for recording portable PEAC records from observed Stripe Projects CLI workflows.

Stripe Projects is a Stripe CLI plugin for provisioning and managing third-party services from the terminal. This kit is informative and tracks the current public Stripe Projects CLI workflow. Command availability and flags evolve per plugin version; verify command-specific behavior against the installed Stripe CLI/plugin with `stripe projects <command> --help`. (Cross-checked against plugin v0.0.53 and the official Stripe Projects docs as of 2026-07-04; Stripe's 2026-06-11 update reports 49 connected providers.)

## Mapping Stripe Projects CLI workflows to PEAC provisioning lifecycle records

PEAC is the records layer for Stripe Projects workflows: signed, portable, offline-verifiable records of observed provisioning, account, resource, and credential lifecycle events. This kit records observations through the canonical `org.peacprotocol/provisioning-lifecycle` extension namespace (registered in v0.14.2). It records what the CLI reported; it does not infer provider-side finality from CLI artifacts.

## What Stripe Projects Exposes

Command groups (some workflows below are documented by Stripe but may not be present in every installed plugin version; verify with `stripe projects <command> --help`):

- **Get started:** `init [name]`, `init --from <URL>` (initialize from a shared stack), `status`, `services list`, `catalog [filter]` / `search`, `pull <projectID>`, `switch-account`
- **Manage services:** `add [service]`, `update <ref> [service]`, `upgrade <ref> [service]`, `downgrade <ref> [service]`, `remove <resource>`, `rotate <resource>`, `link <provider>`, `unlink <provider>`, `open <provider>`
- **Environment:** `env` (lists variables with values redacted by default), `env --pull` / `--refresh` / `--service` / `--provider`; documented named-environment subcommands `env list/show/create/use/update/delete/add/remove` and `env update --output <path>`
- **Billing:** `billing show`, `billing add`, `billing update`, `spend`
- **Sharing:** `share`, `import <URL>`
- **Guidance:** `llm-context`

The locally checked plugin snapshot (`v0.0.53`) supports `--json`, `-y`/`--yes`, `--accept-tos`, `--stream`, and `--debug`; the current official docs also describe `--no-interactive` and `--auto-confirm`. Confirm flags with `stripe projects <command> --help` for the installed plugin version.

### Project files and what is committed

Per the official docs:

| File                         | Purpose                                                          | Commit to version control                                    |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `.projects/state.json`       | shared project state (services, resources, environments, config) | Yes                                                          |
| `.projects/state.local.json` | local overrides, machine settings, provider-account associations | Yes (despite the `.local` name; teammates need it to `link`) |
| `.projects/vault/vault.json` | encrypted credential cache                                       | No (gitignored)                                              |
| `.projects/cache/`           | CLI metadata cache                                               | No (gitignored)                                              |
| `.env`, `.env.*`             | plaintext credential output (created with `600` permissions)     | No (gitignored)                                              |

`stripe projects init` adds the credential files to `.gitignore` automatically. The vault is a local cache, not a shared secrets distribution system; credentials are also held server-side in Stripe's Secret Store, and each teammate runs `stripe projects env --pull` to fetch their own.

## Observed Workflow to PEAC Record Mapping

PEAC records bounded observations of what a workflow reported; the commands are not themselves PEAC semantics. The `sub_event` values below are the canonical enum values from the provisioning lifecycle profile; do not use a value outside each record's enum.

| Stripe Projects workflow                                                                      | Observed lifecycle event                     | PEAC record type (`org.peacprotocol/...`)                                                        | Notes                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init [name]` / `init --from <URL>` / `import <URL>`                                          | project or shared-stack services provisioned | `provisioning-catalog-observed` (+ per-resource `provisioning-resource-observed`)                | `init --from` starts a new project from a shared stack; `import` adds shared-stack services to an existing project; browser confirmation on first use; never record the shared-stack URL contents as proof |
| `add <provider>/<service>`                                                                    | resource provisioned + credential issued     | `provisioning-resource-observed` (`provisioned`) + `provisioning-credential-observed` (`issued`) | two records; credential record requires a `storage_surface` policy                                                                                                                                         |
| `update <ref> [service]`                                                                      | resource updated                             | `provisioning-resource-observed` (`updated`)                                                     | resource enum: `requested`/`provisioned`/`updated`/`removed`                                                                                                                                               |
| `remove <resource>`                                                                           | resource removed                             | `provisioning-resource-observed` (`removed`)                                                     | use `removed`, not `deprovisioned`                                                                                                                                                                         |
| `rotate <resource>`                                                                           | credential rotated                           | `provisioning-credential-observed` (`rotated`)                                                   | credential enum: `issued`/`rotated`/`revoked`/`synced`; never record credential material                                                                                                                   |
| `link <provider>`                                                                             | provider associated                          | `provisioning-provider-link-observed` (`linked`)                                                 | provider-link enum: `created`/`linked`/`authorized`/`updated`                                                                                                                                              |
| `unlink <provider>`                                                                           | provider disassociated                       | informational (no matching enum value)                                                           | the provider-link enum has no `unlinked`; treat as read-only, do not invent an enum value                                                                                                                  |
| `upgrade` / `downgrade <ref>`                                                                 | tier or plan changed                         | `provisioning-subscription-observed` (`updated`)                                                 | subscription enum: `started`/`updated`/`cancelled`; a Shared Payment Token is a delegation ceiling, not a claim a charge cleared; map commerce delegation through the commerce profiles, not here          |
| `env --pull` / `env --refresh` / documented named-env subcommands                             | environment / credential sync                | `provisioning-credential-observed` (`synced`) or informational                                   | `env` lists values redacted by default; record metadata + digest only                                                                                                                                      |
| `billing show/add/update`, `spend`                                                            | billing / spend context                      | `provisioning-budget-observed`                                                                   | observed billing context only; not a claim a payment cleared or was finalized                                                                                                                              |
| `catalog` / `search` / `status` / `list` / `services list` / `open` / `llm-context` / `share` | read-only / informational                    | no PEAC record by default                                                                        | browse / inspect / share; no lifecycle mutation                                                                                                                                                            |

`provisioning-account-observed`, `provisioning-deployment-observed`, `provisioning-domain-observed`, and `provisioning-payment-authorization-observed` remain available for provider-specific flows that surface an account, deployment, domain, or payment-authorization observation.

## Safe Fields and Redacted Fields

Credential observations use `storage_surface.material_redaction` (closed enum `never_capture` / `redacted_capture` / `hashed_capture`); apply the same redaction discipline to associated artifacts and identifiers:

| Material                                                   | PEAC treatment                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `.env` / `.env.*` values                                   | `never_capture` (event metadata + `sha256:` digest only)                                                     |
| `.projects/vault/vault.json` values                        | `never_capture`                                                                                              |
| `.projects/cache/` contents                                | not recorded                                                                                                 |
| `.projects/state.local.json` provider-account associations | committed file, but redact or hash the associations before recording (`redacted_capture` / `hashed_capture`) |
| Stripe or provider account IDs                             | redact or hash to a `urn:peac:account:...` reference                                                         |
| Resource names                                             | safe only if user-provided and non-secret; otherwise hash                                                    |
| Credential rotation                                        | event metadata + digest only; never credential material                                                      |
| Billing and spend amounts                                  | observed metadata only; no card or payment credential                                                        |
| Shared stack URL from `share`                              | hash or redact unless the contents are explicitly non-secret                                                 |

## CLI Observer Pattern

Wrap `stripe projects` commands with `--json`, hash state and artifacts, validate the extension content, and issue records under the canonical extension namespace. The following skeleton is illustrative; replace `resultData` with the JSON payload emitted by a verified `stripe projects ... --json` command.

```typescript
import { generateKeypair, jcsHash } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';
import { PROVISIONING_LIFECYCLE_EXTENSION_KEY, validateProvisioningLifecycle } from '@peac/schema';

// Illustrative skeleton. Replace `resultData` with the JSON payload emitted by a
// verified `stripe projects ... --json` command (do not run live Stripe commands in CI).
const resultData = {
  provider: 'example-provider',
  service: 'managed-database',
  resource_ref: 'urn:peac:resource:primary-db',
};

// Hash the CLI response data (RFC 8785 JCS canonical JSON + SHA-256).
const upstreamArtifactDigest = `sha256:${await jcsHash(resultData)}`;

const { privateKey, publicKey } = await generateKeypair();

// Caller observed a managed-database resource being provisioned.
const extension = {
  event_kind: 'provisioning-resource-observed',
  observed_at: new Date().toISOString(),
  observed_by_ref: 'urn:peac:agent:my-issuer',
  upstream_artifact_digest: upstreamArtifactDigest,
  provider: {
    provider_ref: 'urn:peac:provider:my-marketplace',
    account_ref: 'urn:peac:account:my-tenant',
  },
  resource: {
    kind: 'managed-database',
    resource_ref: 'urn:peac:resource:primary-db',
    sub_event: 'provisioned',
  },
};

// Validate the extension content through the canonical validator before
// signing. The validator returns the structured-error contract on failure.
const validation = validateProvisioningLifecycle(extension);
if (!validation.ok) {
  throw new Error(JSON.stringify(validation.errors));
}

const { jws } = await issue({
  iss: 'https://your-issuer.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/provisioning-resource-observed',
  pillars: ['access', 'provenance'],
  occurred_at: new Date().toISOString(),
  privateKey,
  kid: 'your-key-id',
  extensions: {
    [PROVISIONING_LIFECYCLE_EXTENSION_KEY]: extension,
  },
});

// Verify offline.
const verification = await verifyLocal(jws, publicKey);
```

## State Hash Pattern

State hashes use `jcsHash()` from `@peac/crypto`, which applies RFC 8785 JSON Canonicalization Scheme followed by SHA-256. This handles nested objects correctly and produces deterministic hashes for the same logical JSON document regardless of key order or formatting.

```typescript
import { readFileSync } from 'node:fs';
import { jcsHash } from '@peac/crypto';

const state = JSON.parse(readFileSync('.projects/state.json', 'utf8'));
const stateDigest = `sha256:${await jcsHash(state)}`; // pin into upstream_artifact_digest where appropriate
```

## Upgrade and Delegation Semantics

`stripe projects upgrade` may involve Shared Payment Token (SPT) delegation. An SPT `amount_limit` is a delegation ceiling, not a claim that a charge cleared or was finalized: no `event` field. When upgrades with SPT delegation are observed, prefer mapping them through the dedicated commerce profiles (see `examples/stripe-spt-evidence/`) rather than the provisioning lifecycle profile, because the lifecycle profile records observation of provisioning state, not commerce delegation.

## Security Guardrails

- **Developer-local only:** do not automate `billing add` or `upgrade` in CI.
- **No credential files in the repo:** `.projects/vault/` and `.env`/`.env.*` are gitignored by default; never commit `vault.json` or `.env` values. `.projects/state.json` and `.projects/state.local.json` are committed, so redact or hash any account associations before recording them.
- **Sanitize fixtures:** replace account IDs, resource IDs, and project IDs before committing any CLI captures.
- **Auth requires human approval:** `stripe projects init` requires browser confirmation; automation cannot bypass this without a human approving in a browser.
- **Records only:** PEAC records what the CLI reported; it does not invoke or manage Stripe Projects commands.

## Verification Pattern

All records verify offline with `verifyLocal()`:

```typescript
import { verifyLocal } from '@peac/protocol';

const result = await verifyLocal(jws, publicKey);
if (result.valid && result.variant === 'wire-02') {
  console.log('Kind:', result.claims.kind);
  console.log('Type:', result.claims.type);
  console.log('Pillars:', result.claims.pillars);
}
```

Audit trail reconstruction: collect all records whose `type` matches `org.peacprotocol/provisioning-*-observed`, sort by `occurred_at`, and verify each against the issuer's public key. The provisioning lifecycle type URIs carry the `*-observed` suffix where they represent observed lifecycle events.

## What This Kit Does Not Claim

- PEAC records what the Stripe Projects CLI reported; it does not manage, invoke, or take responsibility for Stripe Projects behavior.
- Not a Stripe partnership; this kit does not imply PEAC is a Stripe Projects provider, a listed provider, or an endorsed integration.
- No payment finality: `billing`, `spend`, and `upgrade` are observed context, not a claim that a payment cleared or was finalized.
- No credential capture: credential material and raw account IDs never enter signed records.
- The Stripe Projects platform API is in private preview and is out of scope for this kit, which covers the CLI workflow surface only.
- No runnable Stripe Projects example ships in this kit; reuse the generic provisioning examples below.

## Reference

- Example: [`examples/agent-provisioning-demo/demo.ts`](../../examples/agent-provisioning-demo/demo.ts) - concrete sanitized demo using the canonical `org.peacprotocol/provisioning-lifecycle` extension namespace.
- Generic example: [`examples/provisioning-lifecycle/`](../../examples/provisioning-lifecycle/) - one fixture per `*-observed` event family.
- Profile spec: [`docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md`](../../docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md).
- Operator recipe: [`docs/SOLUTIONS/verify-agent-provisioning.md`](../../docs/SOLUTIONS/verify-agent-provisioning.md).
- SPT delegation: [`examples/stripe-spt-evidence/demo.ts`](../../examples/stripe-spt-evidence/demo.ts).
- Commerce semantics: [`docs/specs/COMMERCE-SEMANTICS.md`](../../docs/specs/COMMERCE-SEMANTICS.md).
- Minimal example: [`examples/minimal/demo.ts`](../../examples/minimal/demo.ts).
- Packages: `@peac/crypto` (JCS, signing), `@peac/protocol` (issue, verify), `@peac/schema` (`validateProvisioningLifecycle`, `PROVISIONING_LIFECYCLE_EXTENSION_KEY`).
- RFC 8785: JSON Canonicalization Scheme.
- [Stripe Projects CLI docs](https://docs.stripe.com/projects).
- [Stripe Projects provider intake](https://docs.stripe.com/projects/provider-intake).
- [Stripe Projects for Platforms API](https://docs.stripe.com/projects/platform-integration) (private preview; out of scope here).
- [Stripe Projects June 2026 update](https://stripe.com/blog/stripe-projects-adds-new-agents-providers-developer-controls).
