# Record evaluation-platform events

> **Outcome:** An external evaluation platform, evaluation runner, or experimentation system runs an evaluation, records a result artifact, or assigns a subject to an experiment. You want each observed event to leave the platform as a portable signed PEAC record that any downstream reviewer can verify offline, without calling the platform that produced it.
>
> **Audience:** Evaluation-platform operator or evaluator integrator who already runs the evaluation and wants portable signed evidence of what the platform reported.
>
> **Time:** About 5 minutes from a clean clone, using the shipped lifecycle-observation profile and the existing `peac emit lifecycle` CLI.

## The problem

Evaluation platforms (open-source evaluation runners, internal evaluation frameworks, experimentation systems, model-quality benchmark runners) already keep their own logs of every evaluation: which subject was evaluated, when the evaluation started and completed, which rubric or experiment variant applied, where the stored result lives. Those logs are private to the platform. A reviewer outside the platform has no portable way to verify a report that "evaluation X completed at time T with result-artifact ref R" without trusting the platform's read-only view of its own logs.

PEAC turns each observed event into a signed record under the existing `org.peacprotocol/lifecycle-observation` extension namespace (v0.14.1; see [`docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md`](../specs/LIFECYCLE-OBSERVATION-PROFILE.md)). Evaluation, scoring, experiment assignment, result generation, and rubric authorship remain upstream responsibilities. PEAC produces a portable, signed record of what the platform reported observing.

This recipe walks through emitting and verifying those records using existing CLI and profile surfaces. No new schema, no new type URI, no new public API, no new package.

## What PEAC records (and what it does NOT)

PEAC records what the evaluation platform reported. The supported event kinds (existing v0.14.1 lifecycle profile) are:

| Event kind                       | Type URI                                          | Required additional fields                  |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `lifecycle-evaluation-started`   | `org.peacprotocol/lifecycle-evaluation-started`   | (none beyond `subject_ref` + `observed_at`) |
| `lifecycle-evaluation-completed` | `org.peacprotocol/lifecycle-evaluation-completed` | `result_ref` (OpaqueRef)                    |
| `lifecycle-experiment-assigned`  | `org.peacprotocol/lifecycle-experiment-assigned`  | `experiment_ref` (OpaqueRef)                |
| `lifecycle-experiment-result`    | `org.peacprotocol/lifecycle-experiment-result`    | `experiment_ref`, `result_ref`              |

Each event kind is record-only. The record carries opaque refs and optional canonical digests; raw evaluation values, score values, rubric contents, and experiment configurations are never inlined. The no-inline-value invariant (grammar-based, see lifecycle profile §5) blocks accidental inclusion of `score`, `metric`, `value`, `result_value`, and 16 other forbidden top-level keys with the stable error `lifecycle.inline_value_blocked`.

PEAC does **NOT**:

- run evaluations
- score model quality
- certify model safety
- operate the harness
- decide benchmark pass / fail truth
- replace evaluator logs
- authorize deployment
- create training-data provenance

The evaluation platform owns rubric authorship, scoring logic, experiment configuration, result storage, dashboards, and any compliance attestation. PEAC adds one bounded, portable signed record per observed event; it does not become the platform.

## What you'll use

PEAC packages and CLI surfaces (all existing; no new public surface):

- [`@peac/cli`](https://www.npmjs.com/package/@peac/cli): the `peac emit lifecycle` subcommand (issuance path shipped in v0.14.1).
- [`@peac/schema`](https://www.npmjs.com/package/@peac/schema): `validateLifecycleObservation`, `LIFECYCLE_OBSERVATION_EXTENSION_KEY`, `LIFECYCLE_OBSERVATION_TYPE_URIS`.
- [`@peac/protocol`](https://www.npmjs.com/package/@peac/protocol): offline verification via `verifyLocal()`.

Prerequisites: Node 22+, pnpm 8+. No external service, no network call, no harness install.

## Generic first: the bounded shape

The generic pattern is the same for every evaluation platform:

1. The platform observes an evaluation event (started, completed, experiment assignment, experiment result).
2. The integrator calls `peac emit lifecycle` with caller-supplied flags. `--observed-at` is REQUIRED and reports the time the EXTERNAL platform observed the event (the wrapper does not silently default to the wrapper-invocation time).
3. The CLI validates the extension content through `validateLifecycleObservation`, signs an interaction record using the caller-provided issuer key, and writes a compact JWS whose JOSE header `typ` is `interaction-record+jwt`.
4. Any downstream reviewer with the issuer's public key can verify the record offline via `verifyLocal()`. No call to the evaluation platform is needed; no platform credential is required.

Step-by-step:

1. Install dependencies, build the workspace, and create the output directory the CLI will write into. The CLI's output preflight requires the parent directory to exist before it writes.

   ```bash
   pnpm install
   pnpm build
   mkdir -p out
   ```

2. Emit a signed record for an evaluation-started observation, using the ephemeral signing flag so the command runs from a clean clone. The caller already knows when the external evaluation platform observed the event; pass it through `--observed-at`. The `pnpm --filter @peac/cli exec` form sets the CLI's working directory to `packages/cli`, so the `--output` path is interpolated with `$PWD` (the caller's working directory) to keep records under `out/` at the workspace root.

   ```bash
   pnpm --filter @peac/cli exec node dist/index.cjs emit lifecycle \
     --event-kind lifecycle-evaluation-started \
     --subject-ref urn:peac:eval:run-001 \
     --observed-at 2026-05-18T10:00:00Z \
     --rubric-ref urn:peac:rubric:helpfulness-v3 \
     --unsafe-ephemeral-key \
     --issuer-id https://eval.example.com \
     --output "$PWD/out/eval-started.jws"
   ```

   `--unsafe-ephemeral-key` generates an ephemeral local signing key whose public key is not published through normal issuer-key discovery. The flag is suitable for local development and tests only. For external verification, swap `--unsafe-ephemeral-key` for `--issuer-key env:PEAC_ISSUER_KEY` (or `file:/path/to/jwk.json`) and publish the public key through the operator's normal issuer-key path; the corresponding `--issuer-id` MUST remain the canonical issuer URL recorded as `iss`.

3. Emit a signed record for an evaluation-completed observation. `--result-ref` points at the stored result artifact via an opaque reference; `--result-digest` carries the canonical sha256 digest of that artifact. The result value itself is never inlined.

   ```bash
   pnpm --filter @peac/cli exec node dist/index.cjs emit lifecycle \
     --event-kind lifecycle-evaluation-completed \
     --subject-ref urn:peac:eval:run-001 \
     --observed-at 2026-05-18T10:05:30Z \
     --result-ref urn:peac:eval-result:run-001 \
     --result-digest sha256:1111111111111111111111111111111111111111111111111111111111111111 \
     --unsafe-ephemeral-key \
     --issuer-id https://eval.example.com \
     --output "$PWD/out/eval-completed.jws"
   ```

4. (Optional inspection only; not required quickstart) Conformance requirement IDs for the lifecycle-observation profile are declared at [`specs/conformance/requirement-ids.json`](../../specs/conformance/requirement-ids.json) under section "Lifecycle Observation Records" (LIFE-OBS-001..LIFE-OBS-010). Read the JSON directly if a structured view is helpful; no additional tooling is required.

5. Verify the records offline as a downstream reviewer. Save the issuer's public key and the signed records anywhere off-host; from any environment that can run `@peac/protocol`, call `verifyLocal()` on each record with the issuer's public key. The verifier returns the canonical record contents plus the reported lifecycle event kind; no call to the evaluation platform is needed. Ephemeral-key records signed in steps 2 and 3 will not verify across a reviewer who does not hold the ephemeral public key; for external verification, use a stable issuer key per the caveat in step 2.

## Provider-specific notes

Provider references appear here only as examples of the same bounded shape; the recipe does not depend on any of them. The integrator runs the upstream evaluation, scoring, and result storage; PEAC provides one bounded signed-record surface.

- Internal evaluation runners (custom Python / TypeScript / Go evaluators) emit lifecycle observations by invoking `peac emit lifecycle` from a wrapper hook that runs after each evaluation step. The runner retains its own log; PEAC adds a portable receipt next to it.
- Open-source evaluation runners (community-maintained evaluation runners that already produce structured per-run JSON) hand each per-run JSON to a small post-step script that pulls `subject_ref`, `observed_at`, and `result_ref` from the run record and calls the CLI. PEAC does not parse the runner's internal score schema.
- Experimentation platforms emit `lifecycle-experiment-assigned` when a subject is bound to a cohort / variant, and `lifecycle-experiment-result` when an experiment outcome lands; both URIs carry only opaque refs.

## Composition discipline (lifecycle-observation profile §8)

PEAC may record lifecycle transitions emitted by orchestrators, workflow engines, evaluation systems, approval systems, or agent runtimes. PEAC does not assign work, run agents, schedule tasks, manage issue trackers, route approvals, decide step ordering, or enforce workflow policy. The orchestrator (or workflow engine, evaluation system, approval system, or agent runtime) is the subject of the observation, never an output of PEAC. The `observed_mode` enum is descriptive only; PEAC does not classify modes algorithmically.

The grammar-based no-inline-value invariant blocks accidental drift: any attempt to inline a score, metric, rubric body, raw experiment value, or other forbidden top-level key rejects with the stable error `lifecycle.inline_value_blocked`. Any `*_ref` field that is not a string rejects with `lifecycle.ref_must_be_string`; any opaque-reference field that violates the recognized-prefix grammar rejects with `lifecycle.opaque_ref_grammar_violation`.

## Composition with OpenTelemetry

When the evaluation platform already publishes OpenTelemetry spans for each evaluation step, the integrator may add a local correlation attribute such as `peac.record.ref` that points to the PEAC record. This is implementation-local and informative only; PEAC does not define an OTel semantic convention, ship an exporter, or require an OTel SDK. The lifecycle-observation profile §7 covers this as informative composition guidance; the evaluation platform's OTel surface remains untouched.

## Evidence of output

A successful `peac emit lifecycle` invocation prints a single compact JWS. Verifying that JWS with `verifyLocal()` returns a deterministic report whose `claims.extensions["org.peacprotocol/lifecycle-observation"]` contains exactly the fields the caller supplied. No inlined value appears; only opaque refs and optional canonical digests.

## Where to go from here

- [`docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md`](../specs/LIFECYCLE-OBSERVATION-PROFILE.md): full normative profile (event kinds, field grammar, conformance Section 30 LIFE-OBS-001..010).
- [Issue harness execution records](harness-records-quickstart.md): the companion recipe for deterministic harness runs emitting `org.peacprotocol/agent-action` records.
- [Compatibility matrix](../COMPATIBILITY_MATRIX.md): adapter-readiness rows and stability classes.
- [Verify agent-action records](verify-agent-action.md): downstream verification recipe for agent-action records, applicable to lifecycle records as well via the same `verifyLocal()` path.
