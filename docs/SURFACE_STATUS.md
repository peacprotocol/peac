# Surface Status by Layer

Do not edit manually. Source: `REPO_SURFACE_STATUS.json`. Rebuild via `node scripts/generate-surface-status.mjs`.

**Version:** 0.13.0 | **Updated:** 2026-05-01

## Layer 1

| Surface           | npm            | State   | Wire |
| ----------------- | -------------- | ------- | ---- |
| `packages/schema` | `@peac/schema` | default | 0.2  |

## Layer 2

| Surface           | npm            | State   | Wire |
| ----------------- | -------------- | ------- | ---- |
| `packages/crypto` | `@peac/crypto` | default | 0.2  |

## Layer 2.5

| Surface                   | npm                    | State     | Wire |
| ------------------------- | ---------------------- | --------- | ---- |
| `packages/capture/core`   | `@peac/capture-core`   | supported | 0.2  |
| `packages/capture/node`   | `@peac/capture-node`   | supported | 0.2  |
| `packages/telemetry`      | `@peac/telemetry`      | supported | 0.2  |
| `packages/telemetry-otel` | `@peac/telemetry-otel` | supported | 0.2  |

## Layer 3

| Surface               | npm                | State    | Wire |
| --------------------- | ------------------ | -------- | ---- |
| `archive/discovery`   | `@peac/disc`       | archived | 0.2  |
| `packages/audit`      | `@peac/audit`      | default  | 0.2  |
| `packages/control`    | `@peac/control`    | default  | 0.2  |
| `packages/policy-kit` | `@peac/policy-kit` | default  | 0.2  |
| `packages/protocol`   | `@peac/protocol`   | default  | 0.2  |

## Layer 3.5

| Surface                       | npm                        | State   | Wire |
| ----------------------------- | -------------------------- | ------- | ---- |
| `packages/middleware-core`    | `@peac/middleware-core`    | default | 0.2  |
| `packages/middleware-express` | `@peac/middleware-express` | default | 0.2  |

## Layer 4

| Surface                                | npm                                | State        | Wire |
| -------------------------------------- | ---------------------------------- | ------------ | ---- |
| `packages/adapters/core`               | `@peac/adapter-core`               | supported    | 0.2  |
| `packages/adapters/did`                | `@peac/adapter-did`                | supported    | 0.2  |
| `packages/adapters/eas`                | -                                  | experimental | 0.2  |
| `packages/adapters/eat`                | `@peac/adapter-eat`                | supported    | 0.2  |
| `packages/adapters/managed-agents`     | `@peac/adapter-managed-agents`     | supported    | 0.2  |
| `packages/adapters/openai-compatible`  | `@peac/adapter-openai-compatible`  | supported    | 0.2  |
| `packages/adapters/openclaw`           | `@peac/adapter-openclaw`           | supported    | 0.2  |
| `packages/adapters/runtime-governance` | `@peac/adapter-runtime-governance` | supported    | 0.2  |
| `packages/adapters/x402`               | `@peac/adapter-x402`               | supported    | 0.2  |
| `packages/adapters/x402/daydreams`     | `@peac/adapter-x402-daydreams`     | supported    | 0.2  |
| `packages/adapters/x402/fluora`        | `@peac/adapter-x402-fluora`        | supported    | 0.2  |
| `packages/adapters/x402/pinata`        | `@peac/adapter-x402-pinata`        | supported    | 0.2  |
| `packages/contracts`                   | `@peac/contracts`                  | supported    | 0.2  |
| `packages/http-signatures`             | `@peac/http-signatures`            | supported    | 0.2  |
| `packages/jwks-cache`                  | `@peac/jwks-cache`                 | supported    | 0.2  |
| `packages/mappings/a2a`                | `@peac/mappings-a2a`               | default      | 0.2  |
| `packages/mappings/acp`                | `@peac/mappings-acp`               | supported    | 0.2  |
| `packages/mappings/aipref`             | `@peac/mappings-aipref`            | supported    | 0.2  |
| `packages/mappings/content-signals`    | `@peac/mappings-content-signals`   | supported    | 0.2  |
| `packages/mappings/intoto`             | `@peac/mappings-intoto`            | supported    | 0.2  |
| `packages/mappings/mcp`                | `@peac/mappings-mcp`               | default      | 0.2  |
| `packages/mappings/paymentauth`        | `@peac/mappings-paymentauth`       | supported    | 0.2  |
| `packages/mappings/rsl`                | `@peac/mappings-rsl`               | supported    | 0.2  |
| `packages/mappings/slsa`               | `@peac/mappings-slsa`              | supported    | 0.2  |
| `packages/mappings/tap`                | `@peac/mappings-tap`               | supported    | 0.2  |
| `packages/mappings/ucp`                | `@peac/mappings-ucp`               | supported    | 0.2  |
| `packages/net/node`                    | `@peac/net-node`                   | supported    | 0.2  |
| `packages/pay402`                      | `@peac/pay402`                     | supported    | 0.2  |
| `packages/rails/card`                  | `@peac/rails-card`                 | supported    | 0.2  |
| `packages/rails/razorpay`              | `@peac/rails-razorpay`             | supported    | 0.2  |
| `packages/rails/stripe`                | `@peac/rails-stripe`               | supported    | 0.2  |
| `packages/rails/x402`                  | `@peac/rails-x402`                 | supported    | 0.2  |
| `packages/receipts`                    | `@peac/receipts`                   | supported    | 0.2  |
| `packages/transport/grpc`              | `@peac/transport-grpc`             | supported    | 0.2  |
| `packages/transport/http`              | -                                  | experimental | 0.2  |
| `packages/transport/ws`                | -                                  | experimental | 0.2  |

## Layer 5

| Surface                        | npm                 | State        | Wire |
| ------------------------------ | ------------------- | ------------ | ---- |
| `apps/api`                     | -                   | default      | 0.2  |
| `apps/sandbox-issuer`          | -                   | compat-only  | 0.1  |
| `apps/verifier`                | -                   | default      | 0.2  |
| `packages/cli`                 | `@peac/cli`         | default      | 0.2  |
| `packages/conformance-harness` | -                   | supported    | 0.2  |
| `packages/mcp-server`          | `@peac/mcp-server`  | default      | 0.2  |
| `packages/server`              | `@peac/server`      | supported    | 0.2  |
| `packages/worker-core`         | `@peac/worker-core` | supported    | 0.2  |
| `packages/worker-shared`       | -                   | supported    | 0.2  |
| `surfaces/analytics`           | -                   | supported    | 0.2  |
| `surfaces/nextjs/middleware`   | -                   | experimental | 0.2  |
| `surfaces/plugin-pack/codex`   | -                   | supported    | 0.2  |
| `surfaces/workers/akamai`      | -                   | supported    | 0.2  |
| `surfaces/workers/cloudflare`  | -                   | supported    | 0.2  |
| `surfaces/workers/fastly`      | -                   | supported    | 0.2  |

## Layer 6

| Surface                        | npm                 | State     | Wire |
| ------------------------------ | ------------------- | --------- | ---- |
| `archive/pillars/access`       | -                   | archived  | null |
| `archive/pillars/compliance`   | -                   | archived  | null |
| `archive/pillars/consent`      | -                   | archived  | null |
| `archive/pillars/intelligence` | -                   | archived  | null |
| `archive/pillars/provenance`   | -                   | archived  | null |
| `packages/attribution`         | `@peac/attribution` | supported | 0.2  |
| `packages/privacy`             | -                   | supported | 0.2  |

## Layer 0

| Surface           | npm            | State   | Wire |
| ----------------- | -------------- | ------- | ---- |
| `packages/kernel` | `@peac/kernel` | default | 0.2  |

## Layer legacy

| Surface           | npm         | State    | Wire   |
| ----------------- | ----------- | -------- | ------ |
| `apps/bridge`     | -           | archived | 0.9.13 |
| `packages/sdk-js` | `@peac/sdk` | archived | 0.1    |

## Layer sdk

| Surface   | npm | State     | Wire |
| --------- | --- | --------- | ---- |
| `sdks/go` | -   | supported | 0.2  |

## Layer null

| Surface        | npm          | State    | Wire |
| -------------- | ------------ | -------- | ---- |
| `archive/pref` | `@peac/pref` | archived | null |

## Layer undefined

| Surface                              | npm | State    | Wire |
| ------------------------------------ | --- | -------- | ---- |
| `archive/0.9.0-0.9.14/packages-core` | -   | archived | 0.1  |
