# Runtime evidence export

> **Outcome:** Your managed agent runtime (Microsoft Agent Governance Toolkit, Claude Managed Agents, OpenAI ACP-backed runtime, or a custom harness) emits decisions. You want those decisions to leave the runtime as portable signed records that an auditor, a counterparty, or another team can verify offline.
>
> **Audience:** Runtime / platform operator.
>
> **Time:** About 10 minutes from a clean clone, using the runtime-governance example fixtures.

## The problem

Managed agent runtimes make decisions all day — allow this tool call, deny this prompt, modify this output, require this approval, sandbox this session. The runtime has a local record of those decisions. But the decisions are locked inside the runtime: another party has no way to inspect the trail without calling the runtime vendor's API, and the record does not survive the runtime instance going away.

PEAC records the runtime's observations as portable signed records. The runtime still decides and enforces; PEAC just makes the decisions portable.

## What you'll use

PEAC packages:

- `@peac/protocol` — issuance and offline verification.
- `@peac/crypto` — Ed25519 signing.
- `@peac/adapter-runtime-governance` — generic runtime-governance observation mapper.
- `@peac/adapter-managed-agents` — runtime-specific mappings (Claude Managed Agents event families, and similar shapes for other managed runtimes).

Optional adjacent systems: any runtime that already produces a structured decision event. This recipe uses the shipped conformance fixtures, so no external runtime is required to run it.

Prerequisites: Node 22+, pnpm 8+.

## Step-by-step

1. Install dependencies from a clean clone:

   ```bash
   pnpm install
   pnpm build
   ```

2. Inspect the runtime-governance surface. Requirement IDs RTGOV-001..RTGOV-007 (Section 27) are declared in `specs/conformance/requirement-ids.json`; the adapter's own fixtures and test vectors live at `packages/adapters/runtime-governance/tests/`:

   ```bash
   jq '.sections[] | select(.section=="Runtime Governance Records") | .requirements[].id' specs/conformance/requirement-ids.json
   ls packages/adapters/runtime-governance/tests/
   ```

3. Issue a signed record from a managed-runtime observation. The adapter translates the upstream event into Wire claims and preserves the upstream attestation verbatim in `upstream_artifact`:

   ```typescript
   import { issue } from '@peac/protocol';
   import { fromManagedAgentsEvent } from '@peac/adapter-managed-agents';

   // upstreamEvent is whatever your runtime emits: a governance decision,
   // a session summary, a policy-reference event, etc. See the adapter's
   // tests/ directory for representative shapes.
   const claims = fromManagedAgentsEvent(upstreamEvent, {
     issuer: 'https://runtime.example.com',
   });

   const jws = await issue(claims, privateKey);
   ```

4. Verify the record offline:

   ```typescript
   import { verifyLocal } from '@peac/protocol';

   const result = await verifyLocal(jws, publicKey, {
     issuer: 'https://runtime.example.com',
   });

   console.log(result.valid, result.claims.type, result.claims.pillars);
   ```

5. Or verify it via the self-hostable reference verifier:

   ```bash
   cd surfaces/reference-verifier
   docker compose up -d
   bash smoke.sh
   ```

## Evidence of output

A runtime evidence export record looks like this (decoded JWS payload):

```json
{
  "iss": "https://runtime.example.com",
  "iat": 1781609600,
  "jti": "019676d0-0000-7000-8000-000000000000",
  "kind": "evidence",
  "type": "org.peacprotocol/runtime-governance/decision",
  "pillars": ["safety", "compliance"],
  "peac_version": "0.2",
  "schema": "interaction-record+jwt",
  "ext": {
    "runtime_governance": {
      "decision": "allow",
      "observed_mode": "agent_loop",
      "policy_ref": "https://runtime.example.com/policies/default",
      "policy_digest": "sha256:...",
      "upstream_artifact_ref": "sha256:..."
    }
  }
}
```

The runtime made the decision (`decision: "allow"`). PEAC carries the decision verbatim, with a digest of the policy that was in force and a reference back to the upstream artifact. An auditor or counterparty verifying the record offline can confirm:

- Which runtime issued the record (signature plus `iss`).
- What decision was observed (`decision`).
- What policy was in force (`policy_digest`).
- What upstream artifact the observation traces back to (`upstream_artifact_ref`).

PEAC did not make the decision. PEAC did not enforce the policy. PEAC carried the signed record of what the runtime attested.

## Validated with

```bash
pnpm install && pnpm build
pnpm --filter @peac/adapter-runtime-governance test
pnpm --filter @peac/adapter-managed-agents test
```

The conformance vectors used in the step-by-step are under [`specs/conformance/runtime-governance/`](../../specs/conformance/runtime-governance/) (Section 27: RTGOV-001..RTGOV-007); the per-mapper test suites exercise each vector end-to-end.

## Where to go from here

- [`docs/compatibility/COMPATIBILITY_MATRIX.md`](../COMPATIBILITY_MATRIX.md) — Adapter Readiness row for `@peac/adapter-runtime-governance` and `@peac/adapter-managed-agents`.
- [`docs/profiles/`](../profiles/) — runtime-governance profile doc.
- [`docs/WHERE-IT-FITS.md`](../WHERE-IT-FITS.md) — PEAC vs runtime governance boundary.
- [`docs/WHAT-PEAC-STANDARDIZES.md`](../WHAT-PEAC-STANDARDIZES.md) — what the protocol defines and what it stops at.
- **Future carrier surfaces:** planned releases extend PEAC to carry CLI execution evidence and observational lifecycle records (eval, approval, experiment, or workflow event exports emitted by other systems) as additional carrier surfaces. The protocol boundary does not change.
