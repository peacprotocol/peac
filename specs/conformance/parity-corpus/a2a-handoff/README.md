# A2A Handoff Parity Corpus (v0.14.1)

13 vectors (10 positive + 3 negative) covering the `org.peacprotocol/a2a-handoff` extension namespace from the v0.14.1 release (Section 28 of `specs/conformance/requirement-ids.json`).

**Governing spec:** `docs/specs/A2A-HANDOFF-RECORDS.md` (profile 0.1).

**Schema:** `vectors.schema.json` (JSON Schema 2020-12; `family: a2a-handoff`).

## Positive vectors (10)

One per type URI; covers every event semantic the profile defines:

| ID                              | Type URI                                      | Notes                                                 |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `ah-001-agent-card-observation` | `org.peacprotocol/a2a-agent-card-observation` | Caller-reported `verified`; canonical discovery path. |
| `ah-002-task-submitted`         | `org.peacprotocol/a2a-task-submitted`         | `from_agent` only; no `to_agent`.                     |
| `ah-003-task-accepted`          | `org.peacprotocol/a2a-task-accepted`          | `from_agent` and `to_agent`.                          |
| `ah-004-task-rejected`          | `org.peacprotocol/a2a-task-rejected`          | Reason populated.                                     |
| `ah-005-task-state-changed`     | `org.peacprotocol/a2a-task-state-changed`     | Intermediate transition.                              |
| `ah-006-task-completed`         | `org.peacprotocol/a2a-task-completed`         | Upstream digest carried.                              |
| `ah-007-task-failed`            | `org.peacprotocol/a2a-task-failed`            | Reason populated.                                     |
| `ah-008-human-review-requested` | `org.peacprotocol/a2a-human-review-requested` | Awaiting review.                                      |
| `ah-009-human-approved`         | `org.peacprotocol/a2a-human-approved`         | Records what an external approver indicated.          |
| `ah-010-human-rejected`         | `org.peacprotocol/a2a-human-rejected`         | Records what an external approver indicated.          |

## Envelope-level vectors that exercise extension-content edge cases (5)

Per the parity-corpus convention established by runtime-governance vector `rg-007-negative-missing-provider`, all vectors in this corpus set `expected.accepted: true`. The corpus exists to assert envelope-level canonical agreement between LEFT and RIGHT verifier implementations; the actual semantic rejection of malformed extension content is exercised at the Layer 3 validator surface (`validateA2AHandoff` from `@peac/schema`).

| ID                                           | Edge case                                                                                                                                                                                   | Stable error (Layer 3 validator)     | Validator-layer test        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------- |
| `ah-neg-001-bare-org-peacprotocol-card-ref`  | `card_ref` violates the strict sha256 digest grammar (Agent Cards are digest-referenced per spec §5.1; arbitrary strings such as `org.peacprotocol` are rejected by the Layer 3 validator). | `a2a.card_ref_digest_invalid`        | `a2a-handoff-shape.test.ts` |
| `ah-neg-002-decision-key-injection`          | Extension payload attempts to inject a top-level `decision` key (one of 20 forbidden keys per the v0.14.1 no-inline-value invariant).                                                       | `a2a.observation_decision_blocked`   | `a2a-handoff-shape.test.ts` |
| `ah-neg-003-legacy-signature-verified-field` | Agent card observation uses the legacy `signature: { verified: true }` shape; renamed to `signature_observation.caller_reported_verification` in v0.14.1.                                   | `a2a.legacy_signature_shape_blocked` | `a2a-handoff-shape.test.ts` |
| `ah-neg-004-type-event-mismatch`             | `type: org.peacprotocol/a2a-task-completed` paired with `event: task.failed`. Per spec §4.2, `event` MUST match `type`.                                                                     | `a2a.type_event_mismatch`            | `a2a-handoff-shape.test.ts` |
| `ah-neg-005-task-id-grammar-violation`       | `task_id: org.peacprotocol` violates the multi-prefix opaque-reference grammar (no recognized prefix).                                                                                      | `a2a.opaque_ref_grammar_violation`   | `a2a-handoff-shape.test.ts` |

## Cross-language parity

Go-side `parityFloorCounts` extension at `sdks/go/parity_corpus_loader_test.go` will add `a2a-handoff: 15` in PR 4 of the v0.14.1 ladder (per the plan); PR 1 ships the corpus only.
