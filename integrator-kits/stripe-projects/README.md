# PEAC Integration Kit: Stripe Projects (Provisioning Evidence)

Integration guide for recording PEAC evidence from Stripe Projects provisioning workflows.

Stripe Projects is in public preview. This kit and its example are grounded in real CLI captures, but shapes may drift with Stripe CLI or plugin updates.

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

Not all providers behave identically. Observed differences (Neon, PostHog):

- **Config requirements**: some providers require `--provider-config` (e.g., PostHog requires `{"region":"US"}`); others need no config (e.g., Neon)
- **Remove support**: provider-dependent (Neon supports remove; PostHog does not)
- **LLM context**: not all providers supply LLM context URLs or agent skills (Neon does; PostHog does not)
- **Env var names**: differ per provider (e.g., `NEON_CONNECTION_STRING` vs `POSTHOG_API_KEY`)
- **JSON envelope**: consistent across providers despite per-provider field differences

### Automation Constraints

- `init` requires interactive browser confirmation on first use per directory; cannot be fully automated without a human
- Post-init commands (`add`, `rotate`, `env`, `status`, etc.) are fully automatable with `--json --yes --accept-tos`
- `billing add` likely requires interactive flow; not tested for automation
- CLI auth uses a two-layer model: Stripe CLI login + separate Projects browser confirmation

## What PEAC Records Here

PEAC is the evidence and audit layer for Stripe Projects workflows: signed, portable, offline-verifiable records of observed provisioning, delegation, and credential lifecycle events. This kit records provisioning and credential workflow observations; it does not infer settlement or provider-side finality from CLI artifacts.

Four observation classes are demonstrated in the example:

| Observation            | Type                                                 | Pillars                | Source Artifact             |
| ---------------------- | ---------------------------------------------------- | ---------------------- | --------------------------- |
| Project init           | `org.peacprotocol.stripe-projects/provisioning.init` | `provenance`           | `state.json`                |
| Service add            | `org.peacprotocol.stripe-projects/provisioning.add`  | `access`, `provenance` | `add --json` + `state.json` |
| Credential rotate      | `org.peacprotocol.stripe-projects/credential.rotate` | `provenance`           | `rotate --json`             |
| LLM context generation | `org.peacprotocol.stripe-projects/context.generate`  | `provenance`           | `llm-context --json`        |

Type strings are experimental and subject to change if formally registered. Type names and the custom extension key in this example are illustrative and not registry commitments.

## What PEAC Does Not Claim

- Provisioning receipts are **observed CLI evidence**, not provider-side ground truth
- `billing add` is setup state, not payment settlement: no commerce extension
- `upgrade` via Stripe Projects uses Shared Payment Tokens (SPT); the SPT `amount_limit` is a delegation ceiling, not a settled or captured charge: no `event` field
- PEAC does not manage or control Stripe Projects provisioning; it records what the CLI reported
- Provider behavior varies; evidence shapes reflect observed captures, not a universal contract

## CLI Observer Pattern

Wrap `stripe projects` commands with `--json`, hash state and artifacts, issue typed receipts:

```typescript
import { generateKeypair, jcsHash } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

// Run the CLI command and capture JSON output
// const result = JSON.parse(execFileSync('stripe', ['projects', 'add', 'neon/postgres', '--json']).toString());

// Hash the CLI response data (RFC 8785 JCS canonical JSON + SHA-256)
const artifactHash = await jcsHash(result.data);

// Hash the project state after the command
const stateAfterAdd = JSON.parse(readFileSync('.projects/state.json', 'utf8'));
const stateHash = await jcsHash(stateAfterAdd);

// Issue evidence receipt
const { privateKey, publicKey } = await generateKeypair();
const { jws } = await issue({
  iss: 'https://your-issuer.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol.stripe-projects/provisioning.add',
  pillars: ['access', 'provenance'],
  occurred_at: new Date().toISOString(),
  privateKey,
  kid: 'your-key-id',
  extensions: {
    'org.peacprotocol.stripe-projects/v1': {
      command: 'stripe projects add neon/postgres --name primary-db',
      provider: result.data.service.provider,
      service_id: result.data.service.service_id,
      resource_name: result.data.service.name,
      resource_status: result.data.service.status,
      artifact_hash: artifactHash,
      state_hash_after: stateHash,
      observer_role: 'developer',
    },
  },
});

// Verify offline
const verification = await verifyLocal(jws, publicKey);
```

## State Hash Pattern

State hashes use `jcsHash()` from `@peac/crypto`, which applies RFC 8785 JSON Canonicalization Scheme followed by SHA-256. This handles nested objects correctly and produces deterministic hashes for the same logical JSON document regardless of key order or formatting.

```typescript
import { jcsHash } from '@peac/crypto';

const state = JSON.parse(readFileSync('.projects/state.json', 'utf8'));
const hash = await jcsHash(state); // hex string
```

## Upgrade and SPT Evidence Semantics

If `stripe projects upgrade` is observed with SPT delegation:

- Record as `org.peacprotocol.stripe-projects/delegation.upgrade` (not provisioning)
- Include `amount_limit` and `currency` from the SPT in the v1 extension
- Do **not** set `commerce.event`: the SPT is a delegation ceiling, not an observed payment state
- Include the `org.peacprotocol/commerce` extension only if the amount_limit is confirmed from CLI output; even then, do not set `event`

Note: `upgrade` was not executed during the initial reconnaissance (billing/delegation risk). These semantics are provisional guidance, not yet grounded in observed artifacts.

## Security Guardrails

- **Developer-local only**: do not automate `billing add` or `upgrade` in CI
- **No vault secrets in repo**: `.projects/vault/` is gitignored by default; never commit `vault.json` or `.env` values
- **Sanitize fixtures**: replace account IDs, resource IDs, and project IDs before committing any CLI captures
- **Auth requires human approval**: `stripe projects init` requires browser confirmation; automation cannot bypass this without a human approving in a browser
- **Evidence only**: PEAC records what the CLI reported; it does not invoke or control Stripe Projects commands

## Verification Pattern

All receipts verify offline with `verifyLocal()`:

```typescript
import { verifyLocal } from '@peac/protocol';

const result = await verifyLocal(jws, publicKey);
if (result.valid && result.variant === 'wire-02') {
  console.log('Kind:', result.claims.kind);
  console.log('Type:', result.claims.type);
  console.log('Pillars:', result.claims.pillars);
}
```

Verification produces expected warnings for experimental (unregistered) types and extension keys. These are informational, not errors.

Audit trail reconstruction: collect all receipts with `org.peacprotocol.stripe-projects/*` types, sort by `occurred_at`, and verify each against the issuer's public key.

## Reference

- Example: `examples/stripe-projects-provisioning/demo.ts`
- SPT delegation: `examples/stripe-spt-evidence/demo.ts`
- Commerce semantics: `docs/specs/COMMERCE-SEMANTICS.md`
- Wire 0.2 minimal: `examples/wire-02-minimal/demo.ts`
- Packages: `@peac/crypto` (JCS, signing), `@peac/protocol` (issue, verify)
- RFC 8785: JSON Canonicalization Scheme
