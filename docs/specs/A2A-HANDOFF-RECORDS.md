# A2A Handoff Records Profile

**Version:** 0.1
**Status:** Normative
**Package:** `@peac/mappings-a2a`, `@peac/schema`
**A2A Spec Version:** v1.0.0
**Extension URI:** `org.peacprotocol/a2a-handoff`
**Depends on:** A2A Receipt Profile (DD-124, `docs/specs/A2A-RECEIPT-PROFILE.md`); Evidence Carrier Contract (DD-124).
**Introduced in:** v0.14.1.

This document defines a profile for portable signed records that observe A2A v1.0 task lifecycle events: Agent Card discovery and the nine task or human-in-the-loop transitions that A2A v1.0 task delivery comprises.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals, as shown here.

## 1. Scope

PEAC records observational handoff events emitted alongside A2A v1.0 task delivery. A handoff record is a signed Wire 0.2 interaction record whose `extensions["org.peacprotocol/a2a-handoff"]` payload describes one observation: either an Agent Card discovery or a single task / human lifecycle transition.

The profile is **strictly observational**:

- The Agent Card observation helper does NOT verify Agent Card signatures. It records what an EXTERNAL verifier system reported about the signature.
- The task observation helpers do NOT decide, route, evaluate, score, or grant. They record what an A2A v1.0 host or client attested.
- The profile defines no decision verb, no verdict field, no trust outcome, and no policy result.

Non-goals: A2A protocol changes; runtime control of A2A hosts; cross-vendor identity attestation; trust scoring; verifier-side dispatch.

## 2. Type URIs

The profile defines 10 type URIs, all under the `org.peacprotocol/a2a-handoff` extension namespace. A record carries exactly one type URI.

| Event semantic         | Type URI                                      | When emitted                                                                                                                             |
| ---------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Card observation | `org.peacprotocol/a2a-agent-card-observation` | After an Agent Card is discovered (`/.well-known/agent-card.json` per A2A v1.0; `/.well-known/peac.json`; or HEAD-request header probe). |
| Task submitted         | `org.peacprotocol/a2a-task-submitted`         | When a client emits a task to an A2A host.                                                                                               |
| Task accepted          | `org.peacprotocol/a2a-task-accepted`          | When the host acknowledges acceptance.                                                                                                   |
| Task rejected          | `org.peacprotocol/a2a-task-rejected`          | When the host declines the task.                                                                                                         |
| Task state changed     | `org.peacprotocol/a2a-task-state-changed`     | On any intermediate state transition.                                                                                                    |
| Task completed         | `org.peacprotocol/a2a-task-completed`         | When the host signals successful completion.                                                                                             |
| Task failed            | `org.peacprotocol/a2a-task-failed`            | When the host signals failure.                                                                                                           |
| Human review requested | `org.peacprotocol/a2a-human-review-requested` | When the host pauses for human review.                                                                                                   |
| Human approved         | `org.peacprotocol/a2a-human-approved`         | When the host observes a human approver granting approval. PEAC records the observation; PEAC does NOT grant.                            |
| Human rejected         | `org.peacprotocol/a2a-human-rejected`         | When the host observes a human approver declining. PEAC records the observation; PEAC does NOT decline.                                  |

## 3. Extension namespace

The extension key is `org.peacprotocol/a2a-handoff`. It is registered in `specs/kernel/registries.json` under `extension_groups.values` and re-exported from `@peac/kernel.EXTENSION_GROUPS` and `@peac/kernel.TYPE_TO_EXTENSION_MAP`.

A record's extensions block MUST contain exactly one A2A handoff payload at this key. The payload's `type` field MUST equal the type URI declared at the wire-record level.

## 4. Field schema

### 4.1 Agent Card observation payload

```json
{
  "type": "org.peacprotocol/a2a-agent-card-observation",
  "card_ref": "sha256:<64 hex>",
  "selected_interface_url": "https://agent.example.com/a2a/v1",
  "signature_observation": {
    "present": true,
    "caller_reported_verification": "verified",
    "method_ref": "ref:detached-jws",
    "kid": "k-2026-001",
    "observed_by_ref": "urn:peac:verifier:internal"
  },
  "discovered_at": "2026-05-05T12:00:00Z",
  "discovery_path": "/.well-known/agent-card.json"
}
```

| Field                    | Type               | Required | Notes                                                                                                                                       |
| ------------------------ | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | const              | yes      | MUST equal `org.peacprotocol/a2a-agent-card-observation`.                                                                                   |
| `card_ref`               | sha256 digest      | yes      | `sha256:<64 lowercase hex>` digest of the discovered card. Agent Cards are stable artifacts; digest references are portable across vendors. |
| `selected_interface_url` | URL (max 2048)     | no       | The chosen entry from `supportedInterfaces[]` (A2A v1.0). HTTP or HTTPS.                                                                    |
| `signature_observation`  | object             | yes      | See §4.1.1.                                                                                                                                 |
| `discovered_at`          | RFC 3339 timestamp | yes      | When the discovery happened.                                                                                                                |
| `discovery_path`         | enum               | yes      | One of `/.well-known/agent-card.json`, `/.well-known/peac.json`, `header-probe`.                                                            |

#### 4.1.1 signature_observation

| Field                          | Type             | Required | Notes                                                                                                                                              |
| ------------------------------ | ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `present`                      | boolean          | yes      | Did the discovered card carry a signature at all?                                                                                                  |
| `caller_reported_verification` | enum             | yes      | One of `verified`, `unverified`, `not_checked`. **Caller-supplied**. PEAC records what an external verifier system reported; PEAC does NOT verify. |
| `method_ref`                   | OpaqueRef        | no       | Opaque pointer to the verification method (NOT an enum).                                                                                           |
| `kid`                          | string (max 256) | no       | Key identifier as observed.                                                                                                                        |
| `observed_by_ref`              | OpaqueRef        | no       | Opaque pointer to the verifier system that produced the observation.                                                                               |

The field naming is deliberate. The legacy shape `signature: { verified: true, ... }` was REJECTED in v0.14.1 because it reads as "PEAC verified this signature." PEAC has no signature-verification API at this surface; the boundary is enforced by `tests/tooling/no-signature-verification-in-a2a-observation.test.ts` (TS AST walker over the helper's import statements).

### 4.2 Task / human lifecycle observation payload

```json
{
  "type": "org.peacprotocol/a2a-task-completed",
  "event": "task.completed",
  "task_id": "urn:a2a:task:42",
  "parent_task_id": "urn:a2a:task:42-parent",
  "from_agent": {
    "card_ref": "sha256:abc...",
    "selected_interface_url": "https://gateway.example.com/a2a/v1"
  },
  "to_agent": {
    "card_ref": "sha256:def..."
  },
  "state": "completed",
  "reason": "OK",
  "observed_at": "2026-05-05T12:00:01Z",
  "upstream_event_ref": "urn:a2a:event:e1",
  "upstream_event_digest": "sha256:0123..."
}
```

| Field                               | Type              | Required | Notes                                                                                                                                                                                              |
| ----------------------------------- | ----------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                              | const             | yes      | One of the 9 task / human type URIs.                                                                                                                                                               |
| `event`                             | enum              | yes      | One of `task.submitted`, `task.accepted`, `task.rejected`, `task.state_changed`, `task.completed`, `task.failed`, `human.review_requested`, `human.approved`, `human.rejected`. MUST match `type`. |
| `task_id`                           | OpaqueRef         | yes      | Opaque reference to the A2A task.                                                                                                                                                                  |
| `parent_task_id`                    | OpaqueRef         | no       | Opaque reference to the parent task in a delegation chain.                                                                                                                                         |
| `from_agent.card_ref`               | sha256 digest     | yes      | `sha256:<64 lowercase hex>` digest of the FROM agent's Agent Card.                                                                                                                                 |
| `from_agent.selected_interface_url` | URL               | no       | The chosen interface URL of the FROM agent.                                                                                                                                                        |
| `to_agent.card_ref`                 | sha256 digest     | no       | `sha256:<64 lowercase hex>` digest of the TO agent's Agent Card. Typically absent on `task.submitted`.                                                                                             |
| `to_agent.selected_interface_url`   | URL               | no       | The chosen interface URL of the TO agent.                                                                                                                                                          |
| `state`                             | string (max 128)  | no       | Free-form A2A state name as observed.                                                                                                                                                              |
| `reason`                            | string (max 1024) | no       | Free-form reason. Meaningful primarily for `rejected` / `failed` events.                                                                                                                           |
| `observed_at`                       | RFC 3339          | yes      | When the observation was made.                                                                                                                                                                     |
| `upstream_event_ref`                | OpaqueRef         | no       | Caller-supplied opaque pointer to the upstream A2A event.                                                                                                                                          |
| `upstream_event_digest`             | sha256 digest     | no       | Caller-computed `sha256:<64 hex>` digest of the upstream A2A event payload.                                                                                                                        |

## 5. Reference grammars (NORMATIVE)

This profile uses two reference grammars:

### 5.1 Sha256 digest grammar (for `card_ref` and `upstream_event_digest`)

`card_ref` (Agent Card observation, `from_agent.card_ref`, `to_agent.card_ref`) and `upstream_event_digest` use the canonical PEAC digest grammar exported from `@peac/schema.Sha256DigestSchema`:

- Exactly `^sha256:[a-f0-9]{64}$`.
- Lowercase hex only.

Agent Cards are stable artifacts; digest references are portable across vendors and trivially reproducible by any party that can fetch the card.

### 5.2 Opaque-reference grammar (for `task_id`, `parent_task_id`, `upstream_event_ref`, `method_ref`, `observed_by_ref`)

These fields use the shared multi-prefix grammar exported from `@peac/schema.OpaqueRefSchema`:

- String, max 256 UTF-8 bytes (enforced via `TextEncoder`, not JavaScript string length).
- MUST NOT contain whitespace.
- MUST NOT contain `@`.
- MUST NOT begin with the JSON-structural characters `{`, `[`, or `"`.
- MUST start with one of the recognized prefixes: `ref:`, `urn:`, `did:`, `sha256:`, `peac:`, `https://`.
- When the value starts with `sha256:`, the suffix MUST satisfy the strict digest grammar above.
- When the value starts with `https://`, the URL MUST contain at least one additional non-whitespace character.

The grammar uniformly rejects email shapes, raw human names in any language, numeric strings, inline JSON, and free text without language-specific or numeric-specific ad-hoc heuristics. Verifiers MUST reject payloads whose `*_ref` fields violate the grammar.

### 5.3 Stable error codes

`validateA2AHandoff()` (exported from `@peac/schema`) returns a structured result `{ ok: false, errors: [{ code, path, message }] }` mapping common failures to stable codes:

| Code                                 | When                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `a2a.observation_decision_blocked`   | One of the 20 forbidden top-level keys present on the extension payload.                                                             |
| `a2a.card_ref_digest_invalid`        | `card_ref` (any of the 3 sites) violates the sha256 digest grammar.                                                                  |
| `a2a.opaque_ref_grammar_violation`   | An opaque-reference field (`task_id`, `parent_task_id`, `upstream_event_ref`, `method_ref`, `observed_by_ref`) violates the grammar. |
| `a2a.legacy_signature_shape_blocked` | Agent Card observation contains the legacy `signature` field (renamed to `signature_observation` in v0.14.1).                        |
| `a2a.type_event_mismatch`            | `event` field does not match `type` URI for a task observation.                                                                      |
| `a2a.timestamp_invalid`              | `discovered_at` or `observed_at` is not RFC 3339 with offset.                                                                        |
| `a2a.unknown_field`                  | Strict-object schema rejected an unrecognized key.                                                                                   |
| `a2a.schema_rejection`               | Generic schema rejection (catch-all for issues without a more specific mapping).                                                     |

## 6. Observational invariants (NORMATIVE)

- The Agent Card observation helper MUST NOT verify Agent Card signatures. The boundary is enforced by an artifact-shape import-graph test (`tests/tooling/no-signature-verification-in-a2a-observation.test.ts`) over the helper's import statements; the helper file MUST NOT import from `@peac/crypto`, `@peac/protocol/verify*`, `node:crypto`, `jose`, or paths matching `**/jws*` / `**/sign*` / `**/verify*`.
- Task observation helpers MUST NOT decide, route, evaluate, score, or grant. The presence of a `human.approved` record does NOT imply PEAC granted; it implies PEAC observed that an external approver granted.
- Verifiers MUST NOT derive trust scores, identity attestations, or auth decisions from a handoff record. The record states what was observed; downstream interpretation belongs to the consumer.
- The profile defines no decision verb, no verdict field, no trust outcome, no policy result. An emitted record's extension payload MUST NOT contain any of: `decision`, `verdict`, `score`, `result`, `passed`, `failed`, `policy_result`, `approval_result`, `outcome`, `judgment`, `rating`, `grade`, `pass`, `fail`, `allow`, `deny`, `authorized`, `denied`, `granted`, `rejected_reason` as top-level keys. Schema validators reject these keys with stable error `a2a.observation_decision_blocked` (subclass of the v0.14.1 lifecycle no-inline-value family).

## 7. Carrier rules

Handoff records ride A2A task metadata via the `attachReceiptToTaskStatus` API defined in the A2A Receipt Profile (`docs/specs/A2A-RECEIPT-PROFILE.md`). The Wire 0.2 record envelope, JOSE `typ` (`interaction-record+jwt`), and 64 KiB carrier-embed cap apply unchanged.

A handoff record MAY also be transported as a standalone signed JWS via the `PEAC-Receipt` HTTP header or via `_meta.org.peacprotocol/receipt_jws` in MCP responses (see Evidence Carrier Contract; DD-124).

## 8. Discovery

Handoff records reference Agent Cards by digest (`card_ref`). The receiving party MAY independently discover the cited card via `/.well-known/agent-card.json` (the A2A v1.0 canonical path; see A2A Receipt Profile §2.2). The handoff helper itself does NOT fetch Agent Cards.

## 9. Security considerations

- The digest of any upstream A2A event (`upstream_event_digest`) MUST be supplied by the caller. The helper does NOT fetch upstream events.
- `signature_observation.kid` is observable as-supplied. Callers SHOULD treat `kid` as an opaque label, not as cryptographic material.
- `card_ref` and `*_ref` values are opaque. Verifiers MUST NOT recompute them; they MAY use them as cache keys.
- The profile MUST be combined with the SSRF-discipline of the A2A Receipt Profile (§7.4) when discovery code uses these helpers downstream.

## 10. Conformance

An implementation is conformant with this profile if it:

1. Emits handoff records carrying exactly one of the 10 type URIs in the extension payload.
2. Validates payloads against `A2AHandoffSchema` (exported from `@peac/schema`) at issue time.
3. Honors the opaque-reference grammar for every `*_ref` field.
4. Honors the observational invariants in §6 (no decision/verdict/score/result/etc. keys; no signature verification in helper imports).
5. Round-trips the 13 conformance vectors at `specs/conformance/parity-corpus/a2a-handoff/vectors.json` (Section 28: A2A-HANDOFF-001..010 positive + A2A-HANDOFF-NEG-001..003 negative) with LEFT/RIGHT verifier agreement.

## 11. Examples

See `integrator-kits/a2a/fixtures/` for canonical JSON examples covering Agent Card observation, `task.submitted`, `task.completed`, and `human.approved`.

## 12. Changes

- v0.1 (introduced in v0.14.1): initial profile.
