# v0.13.0 mutation-baseline

> **Status:** Advisory baseline. Mutation testing at v0.13.0 is configured
> and runnable, but the run is **not** wired into CI and **no** README
> quality claim is made. The baseline exists so future releases have a
> shared reference point and so individual contributors can identify
> meaningful test gaps. Promotion to a CI gate requires a recorded
> roadmap decision after the baseline is observed stable across at
> least one follow-on release.

## Configuration

The repo-root [`stryker.conf.json`](../../stryker.conf.json) targets the
five highest-leverage layers: `@peac/kernel`, `@peac/schema`,
`@peac/crypto`, `@peac/protocol`, and `@peac/policy-kit`. Generated
files (`*.generated.ts`), test files, and `__tests__/` directories are
excluded from mutation. The runner is Vitest; the reporters are HTML
(human review) and JSON (machine archival).

Thresholds are documentary. `break` is `null`, so the run never fails
the process; the score is reported and recorded but never blocks a
push.

To run the baseline locally:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm mutation:baseline
```

The `mutation:baseline` script invokes Stryker via `pnpm dlx`, so the
runtime devDeps are not committed to the workspace. Stryker is
fetched on demand the first time the script runs. A typical local run
takes 20-40 minutes per tracked package on a developer laptop.

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

When a contributor runs the baseline locally, they should append any
survivor they think is worth recording to this section. The catalogue
is review-driven; not every survivor needs a row.

### Initial entries

_None recorded. Populate after the first local mutation run._

## Posture for v0.13.0

- The Stryker config is committed and the `pnpm mutation:baseline`
  script is wired.
- No mutation score is published in the README, the package
  descriptions, or the standards ledger. There is no public quality
  claim until at least one follow-on release confirms the baseline.
- The CI pipeline does NOT run Stryker. Wall-clock cost and noise
  potential make a CI gate premature without a stable baseline first.
- Contributors are encouraged to run the baseline locally when
  modifying any of the five tracked packages and to record interesting
  survivors here.

## What this baseline does NOT promise

- A specific mutation score. Numbers depend on machine, Vitest cache
  state, and Stryker version.
- Test-quality certification. Mutation testing is a tool, not a
  certificate.
- Drift-free survivors over time. The survivor catalogue accumulates
  entries as the baseline matures; pruning is part of the lifecycle.
