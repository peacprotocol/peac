# Verify agent-action records

> **Outcome:** A harness, runtime, reviewer, or operator observed an agent invocation, delegation, approval, denial, cancellation, or timeout and emitted signed PEAC records. You want to verify those records offline as an auditor, counterparty, or downstream reviewer, without calling the system that produced them.
>
> **Audience:** Auditor / counterparty / downstream reviewer.
>
> **Time:** About 5 minutes from a clean clone, using the shipped fixtures.

## The problem

Agent execution systems already keep their own logs of what each agent does. Those logs are private to the system. A reviewer outside the system has no portable way to verify signed records reporting that an action was invoked, delegated, approved, denied, cancelled, or timed out without trusting the system's read-only view of its own logs.

PEAC turns each observed event into a signed record using the canonical `org.peacprotocol/agent-action` extension namespace and a `*-observed` type URI per event kind. Execution, scheduling, decision-making, and orchestration remain upstream responsibilities. PEAC produces a portable, signed record of what the caller reported observing.

This recipe walks through verifying those records offline.

## What you'll use

PEAC packages:

- `@peac/protocol`: issuance and offline verification.
- `@peac/schema`: `validateAgentAction` and the canonical extension key.
- `@peac/crypto`: Ed25519 signing.

Examples and fixtures:

- [`examples/agent-action-records/`](../../examples/agent-action-records/): generic, vendor-neutral demo with one fixture per `*-observed` event kind (invoked, delegated, approved, denied, cancelled, timed-out).

Prerequisites: Node 22+, pnpm 8+. No external service required.

## Step-by-step

1. Install dependencies and build the workspace.

   ```bash
   pnpm install
   pnpm build
   ```

2. Issue signed records from the generic fixtures. The script reads each fixture, validates the extension content through `validateAgentAction`, signs an interaction record per fixture (picking the registered pillar per type URI; `attribution` for invoked / delegated / cancelled; `compliance` for approved / denied / timed-out), and writes the records and the public key to `examples/agent-action-records/out/`.

   ```bash
   cd examples/agent-action-records
   pnpm issue
   ```

   You should see one `[OK]` line per `*-observed` event kind.

3. Verify the records offline. The verifier loads the public key plus the signed records and runs `verifyLocal` for each. The private key is not required.

   ```bash
   pnpm verify
   ```

   Each record prints `[OK]`; the summary reports `Verified <count>/<count>`.

4. (Optional) Verify the records through a reference verifier deployment. The reference verifier in [`surfaces/reference-verifier/`](../../surfaces/reference-verifier/) includes local and edge-deployment recipes. Each deployment runs the same offline verification. Treat the deployment as informative; the protocol behavior is the same as the local `verifyLocal` call in step 3.

## When to use this

- An auditor needs to verify signed records reporting that an agent action was invoked, approved, or denied without calling the production agent runtime.
- A counterparty needs portable evidence that a delegated action ran with a documented parent action.
- A reviewer wants offline evidence that a long-running action was reported as cancelled or timed out.
- A downstream system needs to compose its own evidence on top of agent-action records (e.g. attach commerce-mandate records to a specific agent-action invocation).

## Expected failure modes

`validateAgentAction` rejects with stable error codes:

- `agent.action.inline_content_blocked`: a forbidden top-level key (prompt, message, body, token, secret, credential, etc.) was present at the extension top level.
- `agent.action.opaque_ref_grammar_violation`: a `*_ref` field failed the OpaqueRefSchema grammar (whitespace, `@`, unrecognized prefix).
- `agent.action.ref_must_be_string`: a `*_ref` field was not a string.
- `agent.action.missing_required_field`: `event_kind`, `agent_ref`, `action_ref`, `observed_at`, or a per-kind required field was absent.
- `agent.action.event_kind_unknown`: the `event_kind` value was not one of the six recognized kinds.
- `agent.action.invalid_observed_at`: `observed_at` was not an RFC 3339 timestamp with timezone.
- `agent.action.type_event_kind_mismatch`: the wire-record `type` URI does not match the `event_kind` value (only when using `validateAgentActionForType`).

`verifyLocal` rejects when the signature does not verify against the supplied public key.

## Privacy and security notes

- Fixture data is synthetic. Real records will carry caller-controlled identifiers; treat them as PII unless your operator policy says otherwise.
- The opaque-reference grammar rejects `@`-containing values and free text, which keeps email addresses, raw human names, and inline payloads off the wire by construction.
- The 20 forbidden top-level keys (prompt, message, messages, body, input, output, result, response, completion, stdout, stderr, env, secret, token, api_key, private_key, credential, model_output, tool_input, tool_output) keep raw agent content out of the record. If your operator needs a content reference, store the content elsewhere and emit a `policy_ref` or `parent_ref` opaque reference.
- The example issues records with a fresh ephemeral key each run. In production, the issuer's public key is the audit anchor; treat it like any other long-lived signing key.

## Boundary

PEAC records what the caller reports. PEAC does not approve, deny, authorize, schedule, execute, govern, enforce, monitor, score, or orchestrate actions. `agent-action-approved-observed` and `agent-action-denied-observed` record that a decision was reported by an upstream reviewer; PEAC does not decide.

## Related

- Profile spec: [`docs/specs/AGENT-ACTION-RECORDS.md`](../specs/AGENT-ACTION-RECORDS.md)
- Generic example: [`examples/agent-action-records/`](../../examples/agent-action-records/)
- Parity corpus: [`specs/conformance/parity-corpus/agent-action/`](../../specs/conformance/parity-corpus/agent-action/)
