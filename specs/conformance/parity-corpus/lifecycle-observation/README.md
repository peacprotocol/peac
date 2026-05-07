# lifecycle-observation parity corpus

Eleven deterministic JSON observation payloads pinning the canonical lifecycle observation shapes that conformance MUST accept.

Per the parity-corpus convention established by runtime-governance vector `rg-007` and reused by `a2a-handoff` and `cli-execution`, all vectors here assert envelope-level canonical agreement (LEFT/RIGHT verifier agreement on the wire envelope) and set `expected.accepted = true`. Semantic rejection of the extension content (forbidden top-level keys, opaque-ref grammar violations, `approver_ref` PII priority, missing/malformed `observed_at`, unknown `event_kind`) lives at the Layer 3 validator surface (`validateLifecycleObservation` exported from `@peac/schema`, exercised by `packages/schema/__tests__/extensions/lifecycle-observation.test.ts`).

Every observation here is INTERNALLY VALID against `LifecycleObservationSchema`. The corpus encodes the deterministic floor for cross-language conformance.

## Coverage

| Vector                                   | Coverage                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lo-001-approval-requested`              | LIFE-OBS-001 / 002: approval-requested event; opaque `approval_ref` + `approver_ref`                                                                      |
| `lo-002-approval-granted`                | LIFE-OBS-001 / 002: approval-granted event; PEAC observes that an external approver granted; PEAC does not grant                                          |
| `lo-003-approval-denied`                 | LIFE-OBS-001 / 002: approval-denied event; PEAC does not deny                                                                                             |
| `lo-004-evaluation-started`              | LIFE-OBS-001 / 002: evaluation-started event; optional `rubric_ref` opaque reference                                                                      |
| `lo-005-evaluation-completed`            | LIFE-OBS-005 / 008: evaluation-completed event; required `result_ref` opaque reference (sha256-prefixed); `result_digest` shown alongside                 |
| `lo-006-experiment-assigned`             | LIFE-OBS-001 / 002: experiment-assigned event; `experiment_ref` + optional `cohort_ref`/`variant_ref`                                                     |
| `lo-007-experiment-result`               | LIFE-OBS-005 / 008: experiment-result event; `experiment_ref` + `result_ref` both required                                                                |
| `lo-008-workflow-transition`             | LIFE-OBS-005 / 010: workflow-transition event; free-form `from_state` / `to_state`; PEAC does not orchestrate                                             |
| `lo-009-mode-observed`                   | LIFE-OBS-005 / 008: mode-observed event; required `observed_mode` enum value                                                                              |
| `lo-010-approval-with-policy-and-rubric` | LIFE-OBS-002: optional `parent_ref` + `policy_ref` + `policy_digest` + `rubric_ref` populated alongside required approval fields                          |
| `lo-011-mode-observed-templated-flow`    | LIFE-OBS-002: `observed_mode = templated_flow` plus optional `upstream_artifact_ref` + `upstream_artifact_digest` (opaque-ref + sha256 digest pair shape) |

The full lifecycle observation profile is specified in [`docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md`](../../../../docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md).
