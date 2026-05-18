# Issue harness execution records

> **Outcome:** A deterministic harness (CI pipeline, justfile target, build-tool hook, agent harness) runs a bounded unit of work. You want a portable signed PEAC record of each bounded execution that any downstream reviewer can verify offline, without depending on the CI service, the runner, or the harness implementation.
>
> **Audience:** Harness operator, build-tool integrator, or CI pipeline owner who already controls execution and wants portable signed evidence of each bounded run.
>
> **Time:** About 5 minutes from a clean clone, using the existing `peac record command` CLI surface and the existing agent-action profile.

## The canonical framing

> **Harnesses control execution. PEAC records bounded work. Logs stay local; PEAC records travel.**

The harness decides what to run, when to run it, and how to retry. PEAC records what the harness reported about each bounded run, signs it with the caller's issuer key, and emits a portable record any downstream party can verify offline. The two layers compose; they do not replace one another.

## The problem

Deterministic harnesses already produce rich local logs: stdout, stderr, exit codes, timing, environment fingerprints. Those logs are valuable inside the operator's infrastructure. Outside the operator's infrastructure, an auditor, customer, downstream reviewer, or compliance team has no portable way to confirm that a specific bounded run happened, with a specific argv, against a specific binary digest, at a specific time, without trusting the operator's read-only view of its own logs.

PEAC records each bounded unit of work as a signed interaction record. The record uses an existing extension namespace and an existing CLI surface; the harness keeps owning execution.

## What PEAC records (and what it does NOT)

PEAC supports two existing record families for harness work:

- **CLI execution records** (`org.peacprotocol/cli-execution`, v0.14.1, [`docs/specs/CLI-CARRIER-PROFILE.md`](../specs/CLI-CARRIER-PROFILE.md)). One record per bounded command execution: a signed observation of argv (hashed by default), stdin / stdout / stderr captures (length + sha256 + truncated sample by default), exit status, elapsed time, and an opaque binary digest. The bounded harness step emits one record per run.
- **Agent action records** (`org.peacprotocol/agent-action`, v0.14.3, [`docs/specs/AGENT-ACTION-RECORDS.md`](../specs/AGENT-ACTION-RECORDS.md)). One record per observed action event (invoked / delegated / approved / denied / cancelled / timed-out). Useful when the bounded run is itself an agent invocation rather than a generic command.

Both record families have an OBSERVER scope: the record reports what the harness observed; the harness owns execution.

PEAC does **NOT**:

- run evaluations
- score model quality
- certify model safety
- operate the harness
- decide benchmark pass / fail truth
- replace evaluator logs
- authorize deployment
- create training-data provenance

The harness, the CI runner, the build tool, the secret manager, the artifact store, the dashboard, and the rerun policy all stay where they are. PEAC records what the harness attested; it does not become the harness.

## What you'll use

PEAC packages and CLI surfaces (all existing; no new public surface):

- [`@peac/cli`](https://www.npmjs.com/package/@peac/cli): `peac record command` (v0.14.1 CLI execution records); `peac emit lifecycle` (v0.14.1 lifecycle observations).
- [`@peac/schema`](https://www.npmjs.com/package/@peac/schema): `validateAgentAction`, `validateLifecycleObservation`, the canonical extension keys.
- [`@peac/protocol`](https://www.npmjs.com/package/@peac/protocol): issuance and offline verification.

Prerequisites: Node 22+, pnpm 8+. No external service, no network call, no managed-runtime install.

## Generic first: bounded execution shape

The generic pattern is the same on every deterministic harness:

1. The harness picks a bounded unit of work (a command, a test invocation, a build step, an agent call).
2. The harness wraps the bounded step with `peac record command -- <bounded command>`.
3. The wrapper spawns the command exactly as supplied (`shell: false`); it does not modify the command, the environment, or the working directory beyond what the caller passed.
4. After the bounded run completes, the wrapper emits one signed interaction record whose JOSE header `typ` is `interaction-record+jwt`. The record carries the command observation (argv-hash, stdin/stdout/stderr metadata, exit code, elapsed time, binary digest) under the `org.peacprotocol/cli-execution` extension key.
5. Any downstream reviewer with the issuer's public key can verify the record offline via `verifyLocal()`. No call to the CI service, runner, or operator is needed.

Step-by-step:

1. Install dependencies, build the workspace, and create the output directory the CLI will write into. The CLI's output preflight requires the parent directory to exist before it writes.

   ```bash
   pnpm install
   pnpm build
   mkdir -p out
   ```

2. Wrap one bounded harness step locally with the ephemeral signing flag so the command runs from a clean clone. The example below records a single bounded invocation; replace the trailing command with whatever bounded step the harness runs. The `pnpm --filter @peac/cli exec` form sets the CLI's working directory to `packages/cli`, so the `--output` path is interpolated with `$PWD` (the caller's working directory) to keep records under `out/` at the workspace root.

   ```bash
   pnpm --filter @peac/cli exec node dist/index.cjs record command \
     --capture-mode hashed \
     --capture-stdin-mode none \
     --unsafe-ephemeral-key \
     --issuer-id https://harness.example.com \
     --output "$PWD/out/test-run.jws" \
     -- node -e "console.log('bounded step ok')"
   ```

   `--unsafe-ephemeral-key` generates an ephemeral local signing key whose public key is not published through normal issuer-key discovery. The flag is suitable for local development and tests only. For external verification, swap `--unsafe-ephemeral-key` for `--issuer-key env:PEAC_ISSUER_KEY` (or `file:/path/to/jwk.json`) and publish the public key through the operator's normal issuer-key path; the corresponding `--issuer-id` MUST remain the canonical issuer URL recorded as `iss`.

   The wrapper observes argv, stdin, stdout, stderr, exit code, elapsed time, and a binary digest under the operator's chosen capture-mode defaults (hashed argv, no stdin capture, length + sha256 + truncated sample for stdout / stderr). Raw capture requires DOUBLE opt-in (`--capture-mode raw` AND `--unsafe-allow-raw-capture`); raw env capture requires DOUBLE opt-in (`--env-mode raw` AND `--unsafe-allow-raw-env`).

3. (Optional, illustrative shape only) When the bounded run represents an agent invocation rather than a generic command, pair the command record with an `agent-action-invoked-observed` extension whose body carries the agent-action common required fields. The full normative shape, field grammar, validator (`validateAgentAction`), and required common fields (`agent_ref`, `action_ref`, `observed_at`) are documented in [`docs/specs/AGENT-ACTION-RECORDS.md`](../specs/AGENT-ACTION-RECORDS.md); the canonical extension key is `AGENT_ACTION_EXTENSION_KEY` exported from `@peac/schema`. The shipped runnable demo at [`examples/agent-action-records/`](../../examples/agent-action-records/) exercises every event kind end-to-end via `pnpm issue` + `pnpm verify`.

4. Verify the records offline as a downstream reviewer. Save the issuer's public key and the signed records anywhere off-host. From any environment that can run `@peac/protocol`, call `verifyLocal()` on each record with the issuer's public key. The verifier returns the canonical record contents and the reported extension content; no call to the harness is needed. Ephemeral-key records signed in step 2 will not verify across a reviewer who does not hold the ephemeral public key; for external verification, use a stable issuer key per the caveat above.

## When the bounded unit is a workflow transition

When the harness already models its own internal state machine (pending -> running -> succeeded / failed / cancelled / timed-out), the `lifecycle-workflow-transition` URI carries the observed transition without inventing a new family. See the companion recipe [Record evaluation-platform events](eval-platform-records.md) for the `peac emit lifecycle` invocation pattern.

## Composition discipline (harness-engineering boundary)

PEAC composes with deterministic harnesses, workflow engines, CI runners, build tools, and agent hooks. PEAC does **not** become:

- a workflow engine
- a state-machine DSL
- a policy engine
- a TDD enforcer
- a task planner
- a hosted agent runtime
- an observability dashboard
- a trust-score system
- an orchestrator
- a supervisor

The bounded-work boundary is enforced by the wrapper, not by harness wording in the recipe: argv is hashed by default; stdin captures default to `none`; stdout / stderr default to length + sha256 + truncated sample; env capture is deny-by-default; cwd and binary path are hashed by default; raw modes require DOUBLE opt-in. The CLI execution profile §8 documents the security defaults in full.

## Provider-specific notes

Provider references appear here only as examples of the same bounded shape; the recipe does not depend on any of them. The harness operator runs the runner, the secrets, the artifact store, and the rerun policy; PEAC provides one bounded signed-record surface.

- CI pipelines that already wrap each step (CI runners with composite-action hooks; GitLab CI / CircleCI / Jenkins / Buildkite step blocks) call `peac record command` from inside the step wrapper. The CI pipeline still decides which steps to run.
- Local task runners (justfile, make, mise, npm-scripts) wrap each bounded recipe with `peac record command` and write the signed record next to the existing local log.
- Agent harnesses that already serialize each agent step into a JSON message can pair the message with an `agent-action-invoked-observed` record via the API path; the harness still owns scheduling and retry.

## Composition with OpenTelemetry

When the harness already publishes OpenTelemetry spans for each bounded step, the integrator may add a local correlation attribute such as `peac.record.ref` that points to the PEAC record. This is implementation-local and informative only; PEAC does not define an OTel semantic convention, ship an exporter, or require an OTel SDK. The harness's OTel surface remains untouched.

## Evidence of output

A successful `peac record command` invocation writes a single compact JWS. Verifying that JWS with `verifyLocal()` returns a deterministic report whose `claims.extensions["org.peacprotocol/cli-execution"]` carries the command observation. The structure and signature of the record are validated; the truth of the harness's underlying execution stays with the harness.

## Where to go from here

- [`docs/specs/CLI-CARRIER-PROFILE.md`](../specs/CLI-CARRIER-PROFILE.md): full normative profile for `org.peacprotocol/cli-execution` (security defaults, conformance Section 29 CLI-EXEC-001..006).
- [`docs/specs/AGENT-ACTION-RECORDS.md`](../specs/AGENT-ACTION-RECORDS.md): full normative profile for `org.peacprotocol/agent-action` (six type URIs, conformance Section 32 AGENT-ACT-001..010).
- [Record evaluation-platform events](eval-platform-records.md): the companion recipe for evaluation platforms emitting `lifecycle-observation` records.
- [Verify agent-action records](verify-agent-action.md): downstream verification recipe for agent-action records.
- [Compatibility matrix](../COMPATIBILITY_MATRIX.md): adapter-readiness rows and stability classes.
