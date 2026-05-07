# Test layout convention

PEAC's test layout reflects which boundary the test exercises. Authors and reviewers should place new tests according to the boundary they cover.

## Conventions

| Location                    | Scope                                                                                                                                                            | Examples                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/<pkg>/__tests__/` | Package-local unit and integration tests for a single workspace package. Default for new package-local tests unless the package already uses another convention. | `packages/schema/__tests__/`, `packages/kernel/__tests__/`, `packages/protocol/__tests__/`                                          |
| `packages/<pkg>/tests/`     | Package-local tests that use a package-specific suite layout or established package precedent.                                                                   | `packages/cli/tests/`, `packages/protocol/tests/`                                                                                   |
| `tests/tooling/`            | Cross-package boundary tests, repo-wide invariants, build/typecheck/lint guards, and dependency-graph assertions.                                                | `tests/tooling/no-otel-dep.test.ts`, `tests/tooling/private-package-deps.test.ts`, `tests/tooling/production-gate-boundary.test.ts` |
| `tests/conformance/`        | Conformance fixtures and spec tests asserting registry composition, requirement-ID coverage, and type-URI mapping invariants.                                    | `tests/conformance/registry-composition.spec.ts`                                                                                    |

## File naming

- Prefer `kebab-case.test.ts` for new test files unless a directory has a strong existing convention.
- Use `.spec.ts` where the existing directory convention uses that suffix for normative or conformance-style assertions.
- Avoid mixing unrelated concerns in one file; split by boundary or behavior.

## When in doubt

Find the closest existing test by package and boundary, then follow that precedent. This note documents current convention only; it does not rename existing tests.
