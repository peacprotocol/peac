# v0.13.0 mutation-testing posture

> **Status:** Configuration baseline (not a captured score). v0.13.0
> commits the Stryker config and the runner script; the first score
> capture is deferred. **No mutation score is recorded in this
> release.** The artifact exists so future releases have a shared
> reference point and so individual contributors can identify
> meaningful test gaps. Promotion to a CI gate requires a recorded
> roadmap decision after the baseline is observed stable across at
> least one follow-on release.

## Configuration

The repo-root [`stryker.conf.json`](../../stryker.conf.json) targets the
five highest-leverage layers: `@peac/kernel`, `@peac/schema`,
`@peac/crypto`, `@peac/protocol`, and `@peac/policy-kit`. Generated
files (`*.generated.ts`), test files, and `__tests__/` directories are
excluded from mutation. The runner is Vitest; the reporters are HTML
(human review), JSON (machine archival), and clear-text (terminal).
Coverage analysis is `perTest` (the Vitest runner enforces this; see
the Stryker Vitest-runner docs).

`thresholds.break` is `0`, so the run never fails the process; the
score is reported and recorded but never blocks a push. To run the
posture script locally:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm mutation:baseline
```

The `mutation:baseline` script invokes Stryker via `pnpm dlx` and
installs both `@stryker-mutator/core` and
`@stryker-mutator/vitest-runner` on demand, so the runtime devDeps
are not committed to the workspace. A typical local run takes
20-40 minutes per tracked package on a developer laptop.

Output lands under `reports/mutation/` (gitignored). Survivors appear
in the HTML report and the per-package summary; record interesting
ones in the survivor catalogue below.

## How to read mutation results

A surviving mutant is a code change Stryker produced that no test
caught. Survivors are signal, not bugs:

- **Surviving mutants in dead branches** are usually fine. If the
  branch is unreachable, no test will exercise it.
- **Surviving mutants on canonical wire-format constants** matter most.
  An off-by-one mutation in a constraint constant that no test catches
  is a real test gap.
- **Surviving mutants in error-message strings** rarely matter. Tests
  that pin user-visible error messages exist where they matter; below
  that bar, exact message bytes are not a public contract.
- **Surviving mutants in benchmark / instrumentation paths** are
  acceptable; those paths are exercised by a separate benchmark
  harness, not the unit suite.

## Per-package leverage

| Package            | Why it matters                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `@peac/kernel`     | Wire-format constants and registry types. A surviving mutant here is the loudest signal because everything depends on it. |
| `@peac/schema`     | Zod schemas + kernel-constraint validator. Survivors flag missing positive- or negative-shape coverage.                   |
| `@peac/crypto`     | JWS + JCS + Ed25519 sign/verify. Survivors here are highest-priority gaps.                                                |
| `@peac/protocol`   | Public `issue()` / `verifyLocal()` / `verify()` entry points. Survivors flag verification-path coverage gaps.             |
| `@peac/policy-kit` | Canonical policy-document parsing and validation. Survivors flag malformed-input coverage gaps.                           |

## First-score capture (deferred)

The first captured score is intentionally **not** part of this
release. When a maintainer captures it, the entry below should record:

- Run date.
- Exact command used.
- Stryker core version and Vitest-runner version.
- Per-package mutation score (killed / survived / timeout / no-coverage).
- Top survivors reviewed (or "no interesting survivors reviewed yet").

Until then, the catalogue below is empty by design.

## Survivor catalogue

The survivor catalogue is populated after the first local run. Each
entry follows this template:

```md
### <package>: <one-line description>

- **Mutator:** <Stryker mutator name>
- **File / line:** `<path>:<line>`
- **What survived:** <short prose>
- **Decision:** <add-test | accept | reclassify-dead-code>
- **Rationale:** <one sentence>
- **Tracking:** <follow-on issue or reference, if any>
```

When a contributor runs the posture script locally, they should
append any survivor they think is worth recording to this section.
The catalogue is review-driven; not every survivor needs a row.

### Initial entries

_None recorded. Populate after the first local mutation run._

## Posture for v0.13.0

- The Stryker config is committed and the `pnpm mutation:baseline`
  script is wired.
- **No mutation score is recorded in this release.** The README,
  package descriptions, and standards ledger do not advertise a
  mutation score until at least one follow-on release captures and
  confirms one.
- The CI pipeline does NOT run Stryker. Wall-clock cost and noise
  potential make a CI gate premature without a stable baseline first.
- Contributors are encouraged to run the posture script locally when
  modifying any of the five tracked packages and to record interesting
  survivors here.

## What this artifact does NOT promise

- A specific mutation score. Numbers depend on machine, Vitest cache
  state, and Stryker version.
- Test-quality certification. Mutation testing is a tool, not a
  certificate.
- Drift-free survivors over time. The survivor catalogue accumulates
  entries as the baseline matures; pruning is part of the lifecycle.
