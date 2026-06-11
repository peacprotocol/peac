# MCP gateway records

> **Outcome:** Your MCP gateway issues a portable signed record for every tool call it mediates: the policy decision (allow or deny), digests of the input and the redacted result, and a reference to the signed tool-definition manifest in force at the time. A counterparty verifies all of it offline with your public key, without access to your logs.
>
> **Audience:** Teams operating an MCP gateway or registry that mediates tool calls for many servers.
>
> **Time:** About 5 minutes from a clean clone (`examples/mcp-gateway-receipts`).

## The problem

Production MCP deployments increasingly route tool calls through a gateway: it applies policy, authenticates callers, redacts sensitive output, and mediates access to many backing servers. The gateway sees every call. That solves operational control, and all of it stays local: the gateway's logs explain what happened to the operator, but a customer, auditor, counterparty, or downstream system cannot verify any of it later without being handed log access.

The gateway is therefore a natural sign-point for portable records: one integration covers the whole fleet, and individual MCP servers do not change at all. The trade-off to state explicitly in your threat model: the gateway attests what the gateway saw.

## What to sign

Two record roles, both ordinary PEAC records on the frozen wire format:

**Per tool call** (registered type `org.peacprotocol/access-decision`):

| Fact                      | Where it goes                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| server and tool name      | `org.peacprotocol/mcp` extension (`server`, `tool`)                                                  |
| policy decision           | registered `org.peacprotocol/access` extension (`resource`, `action`, `decision: allow/deny/review`) |
| trace correlation         | registered `org.peacprotocol/correlation` extension (`trace_id`, `workflow_id`)                      |
| input digest              | integrator extension, e.g. `input_sha256` (hash, never the raw arguments)                            |
| result digest             | integrator extension, e.g. `result_sha256` (hash of the redacted result)                             |
| policy reference          | integrator extension, e.g. `policy_ref: pii.redact.v1`                                               |
| redaction fact            | integrator extension, `redaction_applied: true/false`                                                |
| tool-definition reference | integrator extension, `tool_definition_ref` (see below)                                              |

**Per tool-definition manifest** (registered type `org.peacprotocol/provenance-record`): the gateway signs a digest of the tool definitions it exposes (names, descriptions, schemas, risk tiers). Each per-call record references this record by `receipt_ref`. A verifier can then prove which definitions the gateway was serving when a call happened, which makes silently changed tool descriptions and schemas detectable after the fact.

Two rules carry the whole pattern:

- **Digests, never payloads.** Arguments and results may contain customer data; the record binds hashes. Redact first, then hash, and record that redaction was applied so the verifier knows what the digest covers.
- **Claim only what the record binds.** A valid signature proves the record was not modified. It says nothing about content the record did not bind. Binding digests is what extends the proof to the content.

## How it is carried

The signed record rides the MCP result's top-level `_meta` under the Evidence Carrier Contract keys `org.peacprotocol/receipt_ref` and `org.peacprotocol/receipt_jws` (64 KiB embed budget; larger records carry the fingerprint plus a URL). The tool's own `structuredContent` is untouched. Clients that do not know the keys ignore them.

## How verification works

The verifying side needs one thing from you: a public key (or your issuer configuration URL for discovery). It then checks, offline:

1. Carrier consistency: `receipt_ref` equals `sha256` of the carried JWS.
2. Signature: Ed25519 over the record.
3. Decision facts: the `access` extension states what was allowed or denied under which policy reference.
4. Content binding: the digest of the delivered result matches the bound `result_sha256`.
5. Definition binding: `tool_definition_ref` matches the signed manifest record.

A modified result fails check 4 even though check 2 still passes; a modified record fails check 2. The example demonstrates both.

## Deny records

Record refusals, not just successes. A denied `tools/call` produces the same record shape with `decision: deny` and a deny reason. When a workflow later disputes why an action did not happen, the gateway can prove the refusal and the policy reference that produced it.

## What this composes with

- **Auth** keeps authenticating; the record can reference the actor, it does not replace the credential.
- **Policy engines** keep deciding; the record proves which policy reference was in force, it does not evaluate policy.
- **OpenTelemetry** keeps correlating; the record carries `trace_id` through the correlation extension and a span can carry the record's `receipt_ref` attribute.
- **The gateway itself** keeps routing, scanning, and redacting; PEAC is the artifact it emits outward.

PEAC records what the gateway reported. It does not approve, deny, authorize, execute, settle, orchestrate, score, or govern.

## Run the example

```bash
git clone https://github.com/peacprotocol/peac && cd peac
pnpm install && pnpm build
cd examples/mcp-gateway-receipts
pnpm demo               # issue, carry, verify offline, deny record
pnpm demo:tamper        # digest mismatch + invalid signature, both detected
pnpm demo:show-record   # decoded record header and payload
```

## Extension groups used

- `org.peacprotocol/access` and `org.peacprotocol/correlation` are registered extension groups; verification validates them.
- `org.peacprotocol/mcp` (server and tool labels) and `com.example/gateway` (digests, policy reference, `tool_definition_ref`) are well-formed but unregistered extension groups. Verification preserves them and surfaces an informational `unknown_extension_preserved` warning; nothing fails silently. Operators who want registered semantics for gateway facts should propose a profile and registry entry.

## Production notes

- Digests are taken over a deterministic serialization so an independent party recomputes the same bytes. The example ships a small `stableStringify` helper (recursive key sort); a production profile should pin a canonicalization rule such as RFC 8785 JCS.
- Scope keys per gateway (`kid`), publish rotation through issuer discovery (`/.well-known/peac-issuer.json`), and pin a public key for air-gapped verification.
- For disputes spanning many calls, export a signed bundle for the window (`peac_create_bundle` on the MCP server, or the CLI bundle tooling) instead of shipping individual records.

## Related

- `examples/mcp-gateway-receipts`: the runnable example for this pattern.
- `docs/SOLUTIONS/mcp-tool-call-receipts.md`: the single-server carrier recipe.
- `docs/SOLUTIONS/verify-gateway-export.md`: verifying gateway-exported payment observations.
- `docs/specs/INTEROP.md`: the Evidence Carrier Contract and MCP `_meta` keys.
