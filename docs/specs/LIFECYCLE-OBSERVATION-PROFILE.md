# Lifecycle Observation Profile

**Version:** 0.1
**Status:** Normative
**Package:** `@peac/cli`, `@peac/schema`
**Extension URI:** `org.peacprotocol/lifecycle-observation`
**Record Type URIs:** 9 (one per event kind; see §3)
**Depends on:** Evidence Carrier Contract (DD-124), Wire 0.2 Interaction Record (`interaction-record+jwt`), Opaque-Reference Schema (`@peac/schema`)

This document specifies how PEAC records observations of lifecycle events emitted by external systems (orchestrators, workflow engines, evaluation systems, approval systems, agent runtimes). The caller observed the event; the CLI issues a record using the caller-provided issuer key. The caller's issuer is the signer-of-record. PEAC provides the record format, validation, and signing path. PEAC does not capture, observe, decide, evaluate, score, transition, or vouch for the truth of the lifecycle event.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals, as shown here.

## 1. Status, Scope, and Boundaries

PEAC lifecycle observation records are an EXPORT-ONLY surface. The caller is the observer of the event; the CLI is the issuance path. PEAC does not run the workflow, score the evaluation, run the experiment, schedule the work, or assign the approval. The wrapper MUST NOT fetch upstream artifacts, validate orchestrator state, or compute any decision derived from the recorded event.

Lifecycle observation records are NOT:

- a workflow engine
- an orchestrator
- an approval-routing system
- an evaluation harness
- an experimentation platform
- a step scheduler
- a policy decision point
- a runtime supervisor
- a verifier of the event's truth

Operators retain all responsibility for the workflow itself, the approval decision, the evaluation outcome, the experiment configuration, and the truth of every recorded fact.

## 2. Subcommands

### 2.1 `peac emit lifecycle`

Builds a lifecycle observation record from caller-supplied flags and emits a Wire 0.2 compact JWS (`typ: interaction-record+jwt`). The CLI issues the record using the caller-provided issuer key; the caller's issuer is the signer-of-record. PEAC provides the record format, validation, and signing path.

The Wire 0.2 envelope MUST carry:

- `payload.iss` set from `--issuer-id`
- `payload.kind = "evidence"`
- `payload.type` equal to one of the 9 lifecycle observation type URIs (see §3)
- `payload.extensions["org.peacprotocol/lifecycle-observation"]` containing the observation object defined in §5

## 3. Type URIs

A lifecycle observation record MUST carry exactly one of the following type URIs:

| Type URI                                          | `event_kind` discriminator       | Required additional fields     |
| ------------------------------------------------- | -------------------------------- | ------------------------------ |
| `org.peacprotocol/lifecycle-approval-requested`   | `lifecycle-approval-requested`   | `approval_ref`, `approver_ref` |
| `org.peacprotocol/lifecycle-approval-granted`     | `lifecycle-approval-granted`     | `approval_ref`, `approver_ref` |
| `org.peacprotocol/lifecycle-approval-denied`      | `lifecycle-approval-denied`      | `approval_ref`, `approver_ref` |
| `org.peacprotocol/lifecycle-evaluation-started`   | `lifecycle-evaluation-started`   | (none)                         |
| `org.peacprotocol/lifecycle-evaluation-completed` | `lifecycle-evaluation-completed` | `result_ref`                   |
| `org.peacprotocol/lifecycle-experiment-assigned`  | `lifecycle-experiment-assigned`  | `experiment_ref`               |
| `org.peacprotocol/lifecycle-experiment-result`    | `lifecycle-experiment-result`    | `experiment_ref`, `result_ref` |
| `org.peacprotocol/lifecycle-workflow-transition`  | `lifecycle-workflow-transition`  | `from_state`, `to_state`       |
| `org.peacprotocol/lifecycle-mode-observed`        | `lifecycle-mode-observed`        | `observed_mode`                |

The discriminator `event_kind` value equals the type URI with the `org.peacprotocol/` prefix removed.

## 4. Issuer authority

The CLI MUST issue records using the caller-provided issuer key. The caller's issuer is the signer-of-record. PEAC does not vouch for the truth of the lifecycle event. A `lifecycle-approval-granted` record does not imply PEAC granted; it implies an external system reported that an external approver granted, and the caller-provided issuer signed a record of that report.

The signing flow MUST follow the canonical PEAC issuer-key convention:

- `--issuer-key env:VAR_NAME` — load Ed25519 JWK from the named environment variable
- `--issuer-key file:/path/to/jwk.json` — load Ed25519 JWK from the named file
- `--issuer-id <url>` — REQUIRED canonical issuer URL recorded as `payload.iss`
- `--unsafe-ephemeral-key` — generate an ephemeral local signing key whose public key is not published through normal issuer-key discovery; for local development and tests only

## 5. Observation Schema

The observation object is the value of `payload.extensions["org.peacprotocol/lifecycle-observation"]`. It MUST validate against `LifecycleObservationSchema` from `@peac/schema`.

### 5.1 Common fields

Every event kind carries:

| Field                      | Type            | Requirement | Notes                                                                                                    |
| -------------------------- | --------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `event_kind`               | enum            | REQUIRED    | One of the 9 discriminator values in §3                                                                  |
| `subject_ref`              | OpaqueRef       | REQUIRED    | Opaque reference to the subject of the observation (task / approval / evaluation / experiment / etc.)    |
| `observed_at`              | RFC 3339 string | REQUIRED    | The wall-clock time at which the EXTERNAL system observed the event; never the wrapper's invocation time |
| `parent_ref`               | OpaqueRef       | OPTIONAL    | Opaque reference to a parent observation                                                                 |
| `upstream_artifact_ref`    | OpaqueRef       | OPTIONAL    | Opaque reference to an upstream artifact (raw event blob, source receipt, etc.)                          |
| `upstream_artifact_digest` | sha256 string   | OPTIONAL    | Canonical digest of the upstream artifact                                                                |
| `policy_ref`               | OpaqueRef       | OPTIONAL    | Opaque reference to a policy document the upstream system applied                                        |
| `policy_digest`            | sha256 string   | OPTIONAL    | Canonical digest of the policy document                                                                  |
| `rubric_ref`               | OpaqueRef       | OPTIONAL    | Opaque reference to an evaluation rubric or scoring criteria document                                    |
| `score_ref`                | OpaqueRef       | OPTIONAL    | Opaque reference to a stored score artifact (score values are NEVER inlined; see §6)                     |
| `result_digest`            | sha256 string   | OPTIONAL    | Canonical digest of the result artifact                                                                  |

### 5.2 Per-event-kind required fields

| `event_kind`                     | Additional REQUIRED fields                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `lifecycle-approval-requested`   | `approval_ref` (OpaqueRef), `approver_ref` (OpaqueRef)                                                     |
| `lifecycle-approval-granted`     | `approval_ref`, `approver_ref`                                                                             |
| `lifecycle-approval-denied`      | `approval_ref`, `approver_ref`                                                                             |
| `lifecycle-evaluation-started`   | (none)                                                                                                     |
| `lifecycle-evaluation-completed` | `result_ref` (OpaqueRef)                                                                                   |
| `lifecycle-experiment-assigned`  | `experiment_ref` (OpaqueRef); `cohort_ref`/`variant_ref` OPTIONAL                                          |
| `lifecycle-experiment-result`    | `experiment_ref`, `result_ref`; `cohort_ref`/`variant_ref` OPTIONAL                                        |
| `lifecycle-workflow-transition`  | `from_state` (string, 1..128 chars), `to_state` (same)                                                     |
| `lifecycle-mode-observed`        | `observed_mode` (enum: `deterministic_script` / `templated_flow` / `agent_loop` / `human_step` / `hybrid`) |

`observed_mode` MAY appear OPTIONALLY on any event kind. On `lifecycle-mode-observed` it is REQUIRED.

### 5.3 Opaque-reference grammar

Every `*_ref` field on a lifecycle observation record MUST validate against the canonical PEAC `OpaqueRefSchema` grammar (`packages/schema/src/opaque-ref.ts`):

- string, max 256 UTF-8 bytes
- MUST NOT contain whitespace
- MUST NOT contain `@`
- MUST NOT begin with a JSON-structural character (`{`, `[`, `"`)
- MUST start with one of the recognized prefixes: `ref:`, `urn:`, `did:`, `sha256:`, `peac:`, `https://`
- `sha256:` requires exactly 64 lowercase hex characters
- `https://` requires a non-empty path/host suffix

Integrators MUST treat `*_ref` values as opaque pointers. PEAC does NOT dereference, fetch, or validate the resolved content. Downstream verifiers MAY dereference at their own discretion.

## 6. No-inline-value invariant

The lifecycle-observation extension is observational; it MUST NOT carry inlined verdicts, scores, decisions, or judgment values at the extension top level. Validators MUST REJECT any of the 20 forbidden top-level keys with the stable error code `lifecycle.inline_value_blocked`:

```
decision, verdict, score, result, passed, failed,
policy_result, approval_result, outcome, judgment,
rating, grade, pass, fail, allow, deny,
authorized, denied, granted, rejected_reason
```

This rule is grammar-based, not heuristic-based. The list is a closed enum; changes to this list require an explicit schema and conformance update.

The `event_kind` enum value `'lifecycle-approval-granted'` is REQUIRED on the `event_kind` field. An extension top-level field literally named `granted: true` is FORBIDDEN. The no-inline-value check inspects the extension top level only, never the `event_kind` field's enum-literal value.

### 6.1 Stable error codes

| Trigger                                                                                                                                                                                                   | Stable error code                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Forbidden top-level key present at extension top level                                                                                                                                                    | `lifecycle.inline_value_blocked`         |
| Conditional-required field absent (per `event_kind`); includes missing `subject_ref` / `observed_at`                                                                                                      | `lifecycle.missing_required_field`       |
| `event_kind` value is not in the 9-literal enum                                                                                                                                                           | `lifecycle.event_kind_unknown`           |
| `observed_at` present but is not a valid RFC 3339 timestamp                                                                                                                                               | `lifecycle.invalid_observed_at`          |
| `*_ref` value is non-string (number, object, array, boolean, null)                                                                                                                                        | `lifecycle.ref_must_be_string`           |
| `approver_ref` value is a string containing `@`                                                                                                                                                           | `lifecycle.approver_ref_pii_blocked`     |
| `*_ref` value is a string that fails the opaque-reference grammar (whitespace, leading JSON char, no recognized prefix, bad sha256 length, empty https suffix; numeric strings like `"0.92"` reject here) | `lifecycle.opaque_ref_grammar_violation` |

The `approver_ref` priority order is: non-string → `ref_must_be_string`; contains `@` → `approver_ref_pii_blocked` (more specific subclass; checked before general grammar); otherwise → `opaque_ref_grammar_violation`. No generic Zod string error MAY leak as a public diagnostic.

Numeric-string `*_ref` values reject through the opaque-reference grammar (no recognized prefix), NOT through the inline-value-blocked path. There are NO numeric-specific or language-specific heuristics.

## 7. OpenTelemetry composition

### 7.1 Normative

`peac.record.ref` (dotted form) is a PEAC custom attribute name. The underscore form `peac.record_ref` MUST NOT appear in normative spec text. The legacy attribute name `peac.receipt_ref` is permitted only where existing receipt/header terminology is frozen (the v0.11.x `receipt_url` / `PEAC-Receipt` header surfaces); new emitters MUST use `peac.record.ref`.

PEAC does not claim ownership over OpenTelemetry semantic-convention namespaces. OpenTelemetry's GenAI and MCP semantic conventions are owned by the OpenTelemetry Specification authors; `peac.record.ref` is not an OpenTelemetry semantic convention unless and until OpenTelemetry adopts it.

PEAC ships no OpenTelemetry SDK dependency, exporter, collector, or semantic-convention package.

### 7.2 Informative

Implementations can emit `peac.record.ref` as an OpenTelemetry span attribute alongside other PEAC and OTel attributes when useful, while preserving applicable OTel semantic conventions for the underlying span. This section uses no RFC-style normative words; the normative behavior lives in §7.1.

## 8. Orchestrator boundary

PEAC may record lifecycle transitions emitted by orchestrators, workflow engines, evaluation systems, approval systems, or agent runtimes. PEAC does not assign work, run agents, schedule tasks, manage issue trackers, route approvals, decide step ordering, or enforce workflow policy. The orchestrator (or workflow engine, evaluation system, approval system, or agent runtime) is the subject of the observation, never an output of PEAC.

Specific external projects MAY appear in informative material accompanying this profile, never in normative spec text.

## 9. Conformance

Conformance vectors live at `specs/conformance/parity-corpus/lifecycle-observation/vectors.json`. The corpus contains 11 vectors: 9 positive (one per `event_kind`) plus 2 negative (`lo-neg-001-inline-score-blocked`, `lo-neg-002-numeric-result-ref-grammar-violation`). Every positive vector is internally valid against `LifecycleObservationSchema`.

Section 30 conformance requirements (LIFE-OBS-001..010) live at `specs/conformance/requirement-ids.json`. All requirements have `enforcement_class: hard_fail`.

## 10. Examples

### 10.1 Approval granted

```json
{
  "event_kind": "lifecycle-approval-granted",
  "subject_ref": "urn:peac:task:approval-002",
  "observed_at": "2026-05-12T10:05:00Z",
  "approval_ref": "urn:peac:approval:req-001",
  "approver_ref": "did:example:approver-002",
  "policy_ref": "urn:peac:policy:approvals-v1"
}
```

### 10.2 Evaluation completed

```json
{
  "event_kind": "lifecycle-evaluation-completed",
  "subject_ref": "urn:peac:eval:run-004",
  "observed_at": "2026-05-12T11:10:00Z",
  "result_ref": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  "result_digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
}
```

### 10.3 Workflow transition

```json
{
  "event_kind": "lifecycle-workflow-transition",
  "subject_ref": "urn:peac:task:wf-008",
  "observed_at": "2026-05-12T13:00:00Z",
  "from_state": "pending",
  "to_state": "running"
}
```

### 10.4 Mode observed

```json
{
  "event_kind": "lifecycle-mode-observed",
  "subject_ref": "urn:peac:run:mode-009",
  "observed_at": "2026-05-12T14:00:00Z",
  "observed_mode": "agent_loop"
}
```
