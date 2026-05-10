# PEAC Integration Kit: Stripe Projects (Provisioning Evidence)

Integration guide for recording PEAC evidence from Stripe Projects provisioning workflows.

Stripe Projects is a Stripe CLI plugin documented by Stripe for provisioning and managing third-party services from the terminal. This kit is grounded in CLI captures, but shapes may drift with Stripe CLI or plugin updates.

## What Stripe Projects Exposes

Stripe Projects (`stripe projects` CLI plugin) is a CLI-driven provisioning workflow for agent-built application stacks. Key surfaces:

- `init`, `add`, `remove`, `rotate`, `upgrade`, `downgrade`: resource lifecycle commands
- `status`, `env`, `llm-context`, `billing show`: read-only queries
- `--json` flag on all commands: observed a consistent JSON envelope in the tested commands
- `.projects/state.json` (shared): project topology (providers, resources)
- `.projects/state.local.json` (private): enriched state with IDs, timestamps, status
- `.projects/vault/vault.json` (gitignored): encrypted credential store
- `.agents/skills/`, `.claude/skills/`: auto-generated agent skills per provider

The CLI JSON envelope observed in tested commands:

```json
{
  "ok": true,
  "command": "projects <subcommand>",
  "version": "0.1",
  "data": {},
  "warnings": [],
  "next_steps": [],
  "meta": { "authenticated": true, "project_initialized": true }
}
```

### Provider Variance

Not all providers behave identically. Observed differences across two providers tested during reconnaissance:

- **Config requirements**: some providers require `--provider-config`; others need no config
- **Remove support**: provider-dependent
- **LLM context**: not all providers supply LLM context URLs or agent skills
- **Env var names**: differ per provider
- **JSON envelope**: consistent across providers despite per-provider field differences

### Automation Constraints

- `init` requires interactive browser confirmation on first use per directory; cannot be fully automated without a human
- Post-init commands (`add`, `rotate`, `env`, `status`, etc.) are fully automatable with `--json --yes --accept-tos`
- `billing add` likely requires interactive flow; not tested for automation
- CLI auth uses a two-layer model: Stripe CLI login + separate Projects browser confirmation

## What PEAC Records Here

PEAC is the records layer for Stripe Projects workflows: signed, portable, offline-verifiable records of observed provisioning, account, resource, and credential lifecycle events. This kit records provisioning workflow observations through the canonical `org.peacprotocol/provisioning-lifecycle` extension namespace registered in v0.14.2; it does not infer settlement or provider-side finality from CLI artifacts.

The four CLI commands map to the canonical `*-observed` type URIs as follows:

| CLI command       | PEAC type URI                                       | Pillars                | Source artifact             | Sub-event     |
| ----------------- | --------------------------------------------------- | ---------------------- | --------------------------- | ------------- |
| `projects init`   | `org.peacprotocol/provisioning-catalog-observed`    | `provenance`           | `state.json`                | n/a           |
| `projects add`    | `org.peacprotocol/provisioning-resource-observed`   | `access`, `provenance` | `add --json` + `state.json` | `provisioned` |
| `projects add`    | `org.peacprotocol/provisioning-credential-observed` | `provenance`           | `add --json` + vault layout | `issued`      |
| `projects rotate` | `org.peacprotocol/provisioning-credential-observed` | `provenance`           | `rotate --json`             | `rotated`     |

`projects llm-context` is informational and is not emitted as a provisioning lifecycle record in the canonical demo. The canonical extension namespace and ten `*-observed` type URIs are registered in `specs/kernel/registries.json`; see [`docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md`](../../docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md) for the full profile.

## What PEAC Does Not Claim

- Provisioning records are **observed CLI evidence**, not provider-side ground truth
- `billing add` is setup state, not payment settlement: no commerce extension
- `upgrade` via Stripe Projects uses Shared Payment Tokens (SPT); the SPT `amount_limit` is a delegation ceiling, not a settled or captured charge: no `event` field
- PEAC does not manage or control Stripe Projects provisioning; it records what the CLI reported
- Provider behavior varies; record shapes reflect observed captures, not a universal contract

## CLI Observer Pattern

Wrap `stripe projects` commands with `--json`, hash state and artifacts, validate the extension content, and issue records under the canonical extension namespace:

```typescript
import { generateKeypair, jcsHash } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';
import { PROVISIONING_LIFECYCLE_EXTENSION_KEY, validateProvisioningLifecycle } from '@peac/schema';

// Run the CLI command and capture JSON output.
// const result = JSON.parse(execFileSync('stripe', ['projects', 'add', '<provider>/<service>', '--json']).toString());

// Hash the CLI response data (RFC 8785 JCS canonical JSON + SHA-256).
const upstreamArtifactDigest = `sha256:${await jcsHash(result.data)}`;

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
import { jcsHash } from '@peac/crypto';

const state = JSON.parse(readFileSync('.projects/state.json', 'utf8'));
const stateDigest = `sha256:${await jcsHash(state)}`; // pin into upstream_artifact_digest where appropriate
```

## Upgrade and SPT Evidence Semantics

`stripe projects upgrade` was not executed during reconnaissance (billing and delegation risk). When upgrades with SPT delegation are observed in production, prefer mapping them through the dedicated commerce profiles (see `examples/stripe-spt-evidence/`) rather than the provisioning lifecycle profile, because the lifecycle profile records observation of provisioning state, not commerce delegation.

If a future revision adds an SPT-aware mapping inside the provisioning lifecycle profile, the corresponding event family will be added under the canonical namespace; the experimental delegation type used in earlier reconnaissance is no longer in scope.

## Security Guardrails

- **Developer-local only**: do not automate `billing add` or `upgrade` in CI
- **No vault secrets in repo**: `.projects/vault/` is gitignored by default; never commit `vault.json` or `.env` values
- **Sanitize fixtures**: replace account IDs, resource IDs, and project IDs before committing any CLI captures
- **Auth requires human approval**: `stripe projects init` requires browser confirmation; automation cannot bypass this without a human approving in a browser
- **Records only**: PEAC records what the CLI reported; it does not invoke or control Stripe Projects commands

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

Audit trail reconstruction: collect all records whose `type` matches `org.peacprotocol/provisioning-*-observed`, sort by `occurred_at`, and verify each against the issuer's public key. The 10 type URIs all carry the `*-observed` suffix to make the observer scope explicit at the record-type layer.

## Reference

- Example: [`examples/agent-provisioning-demo/demo.ts`](../../examples/agent-provisioning-demo/demo.ts) — concrete sanitized demo using the canonical `org.peacprotocol/provisioning-lifecycle` extension namespace.
- Generic example: [`examples/provisioning-lifecycle/`](../../examples/provisioning-lifecycle/) — one fixture per `*-observed` event family.
- Profile spec: [`docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md`](../../docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md).
- Operator recipe: [`docs/SOLUTIONS/verify-agent-provisioning.md`](../../docs/SOLUTIONS/verify-agent-provisioning.md).
- SPT delegation: [`examples/stripe-spt-evidence/demo.ts`](../../examples/stripe-spt-evidence/demo.ts).
- Commerce semantics: [`docs/specs/COMMERCE-SEMANTICS.md`](../../docs/specs/COMMERCE-SEMANTICS.md).
- Minimal example: [`examples/minimal/demo.ts`](../../examples/minimal/demo.ts).
- Packages: `@peac/crypto` (JCS, signing), `@peac/protocol` (issue, verify), `@peac/schema` (`validateProvisioningLifecycle`, `PROVISIONING_LIFECYCLE_EXTENSION_KEY`).
- RFC 8785: JSON Canonicalization Scheme.
