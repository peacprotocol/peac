# Agent Action Records Profile

**Profile version:** 0.1
**Extension namespace:** `org.peacprotocol/agent-action`
**Scope:** OBSERVER - records observations of agent action events reported by a caller, harness, or runtime
**Introduced in:** v0.14.3
**Conformance section:** 32 (AGENT-ACT-001..AGENT-ACT-010)

---

## 1. Overview

Agent Action Records provide a portable signed record of a caller-reported agent action event. The caller observed the event; the caller's issuer signs and issues the record. PEAC provides the record format, validation, and signing path.

**PEAC does not approve, deny, authorize, schedule, execute, govern, enforce, monitor, score, or orchestrate actions.** Action decisions (approved / denied) are reported by the caller; the record describes what the caller observed, not what PEAC decided.

The record creates portable, verifiable evidence of agent action events that can be verified outside the system that produced it.

### Normative keywords

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capital letters.

---

## 2. Extension Group Registration

| Field               | Value                           |
| ------------------- | ------------------------------- |
| Extension namespace | `org.peacprotocol/agent-action` |
| `extensions` key    | `org.peacprotocol/agent-action` |
| Status              | informational                   |

---

## 3. Type URIs

Six type URIs, each corresponding to one event kind:

| Type URI                                           | Event kind                        | Pillar      |
| -------------------------------------------------- | --------------------------------- | ----------- |
| `org.peacprotocol/agent-action-invoked-observed`   | `agent-action-invoked-observed`   | attribution |
| `org.peacprotocol/agent-action-delegated-observed` | `agent-action-delegated-observed` | attribution |
| `org.peacprotocol/agent-action-approved-observed`  | `agent-action-approved-observed`  | compliance  |
| `org.peacprotocol/agent-action-denied-observed`    | `agent-action-denied-observed`    | compliance  |
| `org.peacprotocol/agent-action-cancelled-observed` | `agent-action-cancelled-observed` | attribution |
| `org.peacprotocol/agent-action-timed-out-observed` | `agent-action-timed-out-observed` | compliance  |

The type URI in the PEAC record envelope (`type` field) MUST match the `event_kind` in the extension body (drop the `org.peacprotocol/` prefix to get `event_kind`).

---

## 4. Schema

### 4.1 Common required fields (all event kinds)

| Field         | Type               | Description                                |
| ------------- | ------------------ | ------------------------------------------ |
| `event_kind`  | string (enum)      | Discriminator; one of the six values above |
| `agent_ref`   | OpaqueRef          | Reference to the agent taking the action   |
| `action_ref`  | OpaqueRef          | Reference to the action                    |
| `observed_at` | RFC 3339 timestamp | When the caller observed the event         |

### 4.2 Common optional fields (all event kinds)

| Field                      | Type       | Description                              |
| -------------------------- | ---------- | ---------------------------------------- |
| `caller_ref`               | OpaqueRef  | Who invoked the agent                    |
| `policy_ref`               | OpaqueRef  | Referenced policy                        |
| `policy_digest`            | sha256-hex | Digest of the referenced policy document |
| `upstream_artifact_ref`    | OpaqueRef  | Reference to an upstream artifact        |
| `upstream_artifact_digest` | sha256-hex | Digest of an upstream artifact           |
| `parent_ref`               | OpaqueRef  | Parent action or task                    |

### 4.3 Per-event-kind additional fields

| Event kind                        | Additional required            | Additional optional               |
| --------------------------------- | ------------------------------ | --------------------------------- |
| `agent-action-invoked-observed`   | (none)                         | (none)                            |
| `agent-action-delegated-observed` | `delegated_to_ref` (OpaqueRef) | (none)                            |
| `agent-action-approved-observed`  | (none)                         | (none)                            |
| `agent-action-denied-observed`    | (none)                         | (none)                            |
| `agent-action-cancelled-observed` | (none)                         | `cancelled_by_ref` (OpaqueRef)    |
| `agent-action-timed-out-observed` | (none)                         | `timeout_at` (RFC 3339 timestamp) |

---

## 5. Opaque Reference Grammar

All `*_ref` fields follow the shared OpaqueRefSchema grammar:

- Recognized prefixes: `ref:`, `urn:`, `did:`, `sha256:`, `peac:`, `https:`
- Maximum 256 UTF-8 bytes
- No whitespace, no `@`, no JSON-opening characters
- Numeric-only strings reject (no recognized prefix)
- Email-shaped strings reject (`@` character blocked)

---

## 6. No-Inline-Content Invariant (NORMATIVE)

**AGENT-ACT-001 (MUST):** The validator MUST reject any agent action payload that contains any of the following top-level keys, using error code `agent.action.inline_content_blocked`:

`prompt`, `message`, `messages`, `body`, `input`, `output`, `result`, `response`, `completion`, `stdout`, `stderr`, `env`, `secret`, `token`, `api_key`, `private_key`, `credential`, `model_output`, `tool_input`, `tool_output`

This invariant is grammar-based, not heuristic-based. The validator rejects on key name presence; it does not inspect value contents for these keys. The rejection fires before the Zod discriminated-union parse so callers always see `agent.action.inline_content_blocked` rather than Zod's `unrecognized_keys` for these specific keys.

---

## 7. Stable Error Codes

| Code                                        | When emitted                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `agent.action.inline_content_blocked`       | Forbidden top-level key present (one of the 20 keys in the no-inline-content invariant)                                |
| `agent.action.unknown_field`                | Unrecognized top-level key not in the forbidden list and not in the schema for the given event_kind                    |
| `agent.action.opaque_ref_grammar_violation` | `*_ref` field fails the OpaqueRefSchema grammar                                                                        |
| `agent.action.ref_must_be_string`           | Non-string value provided for a `*_ref` field                                                                          |
| `agent.action.missing_required_field`       | Required field absent (event_kind, agent_ref, action_ref, observed_at, or event-kind-specific required field)          |
| `agent.action.event_kind_unknown`           | `event_kind` value not in the closed enum of 6 values                                                                  |
| `agent.action.invalid_observed_at`          | Malformed RFC 3339 timestamp in `observed_at` or `timeout_at`                                                          |
| `agent.action.type_event_kind_mismatch`     | `event_kind` in payload does not match the expected value derived from the type URI (via `validateAgentActionForType`) |
| `agent.action.type_uri_unknown`             | Type URI passed to `validateAgentActionForType` is not in the closed set of 6 recognized agent action type URIs        |

The distinction between `inline_content_blocked` and `unknown_field` is normative: a forbidden-list key always produces `inline_content_blocked`; any other extra key produces `unknown_field`. Callers MUST treat these codes as distinct diagnostic signals.

---

## 8. Orchestrator Boundary (NORMATIVE)

**AGENT-ACT-010 (MUST):** Spec boundary text is normative and vendor-neutral.

PEAC records portable signed interaction records describing what a caller observed about an agent action. PEAC does not approve, deny, authorize, schedule, execute, govern, enforce, monitor, score, or orchestrate actions. Action decisions (approved / denied) are reported by the caller; the record describes what the caller observed, not what PEAC decided.

PEAC does not replace, govern, or score the agent, harness, orchestration system, or policy engine that produced the events. PEAC records what the caller reported; the caller's issuer is the signer-of-record.

---

## 9. Composition with Agent Frameworks (INFORMATIVE)

Agent Action Records can be issued alongside agent framework events without PEAC depending on or governing the framework. The `agent_ref` and `action_ref` fields use opaque references so any framework-specific identifier can be bound as an opaque reference under a recognized prefix.

Example OTel composition: a PEAC agent action record MAY be issued when a span is emitted for an action. The `agent_ref` or `action_ref` can reference the OTel trace or span ID as an opaque reference (e.g., `urn:otel:trace:...`). PEAC does not ship an OTel exporter, SDK dependency, collector, or semantic-convention claim.

---

## 10. Conformance Vectors

Positive and negative conformance vectors are at:

- `specs/conformance/parity-corpus/agent-action/vectors.json` (6 positive vectors, one per event kind)
- `packages/schema/__tests__/extensions/agent-action.test.ts` (negative vectors for all stable error codes)
- `packages/schema/__tests__/extensions/agent-action-registry.test.ts` (registry mapping for AGENT-ACT-009)

---

## 11. Parity and Verification

The schema validator `validateAgentAction` (exported from `@peac/schema`) is the canonical Layer 3 validator. It returns the structured error contract `{ ok: true, value } | { ok: false, errors: [{ code, path?, message }] }`. No generic Zod error messages leak as public diagnostics.

The helper `validateAgentActionForType(typeUri, data)` validates an agent action payload AND asserts that its `event_kind` matches the type URI from the wire-record envelope. It accepts an untrusted `string` so callers can pass the envelope `type` field directly without casting. If `typeUri` is not one of the 6 recognized agent action type URIs, it emits `agent.action.type_uri_unknown`. If the type URI is valid but the `event_kind` disagrees, it emits `agent.action.type_event_kind_mismatch`. Use this helper when processing records received from a wire carrier.

Agent action records issued via `@peac/protocol.issue()` using any of the 6 type URIs in `AGENT_ACTION_TYPE_URIS` MUST round-trip through `verifyLocal()` (AGENT-ACT-008).

---

## 12. Non-Goals

PEAC Agent Action Records do not:

- Provide agent authorization, access control, or enforcement
- Execute, schedule, or cancel actions
- Score, rank, or evaluate agent behavior
- Implement policy engines or governance rules
- Operate a log aggregator, monitoring dashboard, or hosted audit store
- Depend on any agent framework SDK

The `approved` and `denied` event kinds record that an external party reported approval or denial to the caller; they do not imply PEAC performed or evaluated the approval. PEAC records the caller's observation, not PEAC's judgment.
