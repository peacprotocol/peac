# OpenAPI version (v0.13.0)

**Status:** Decided. The public OpenAPI contract for the PEAC reference verifier is OpenAPI 3.1.x.

## Decision

The reference verifier publishes its public contract in OpenAPI 3.1.x. Both [`packages/schema/openapi/verify.yaml`](../../packages/schema/openapi/verify.yaml) (canonical, package-level) and [`apps/api/openapi.yaml`](../../apps/api/openapi.yaml) (app-level, aligned by drift gate) use OpenAPI 3.1.1 at v0.13.0.

## Rationale

OpenAPI 3.1.x is widely supported by current OpenAPI tooling (validators, codegen, viewers, contract testers). PEAC consumers depend on stable downstream tool support; the contract surface is held at 3.1.x to keep that consumer surface stable.

## Drift control

`pnpm verify:openapi:drift` ([`scripts/verify-openapi-drift.mjs`](../../scripts/verify-openapi-drift.mjs)) enforces that the canonical and app-level OpenAPI documents agree on the shared `POST /v1/verify` contract and that downstream surfaces (integrator kits, deployment recipes) restate the contract consistently.

## Change procedure

Any OpenAPI minor-version change requires a dedicated contract update and a passing OpenAPI drift gate (`pnpm verify:openapi:drift`) across the canonical contract, the app-level contract, and every downstream surface that restates the contract.
