# ADR-001: Telemetry Package Taxonomy

**Status:** Accepted
**Date:** 2025-12-31
**Context:** v0.9.22 Telemetry Integration

## Decision

OpenTelemetry integration is implemented as two packages in the infrastructure layer:

- `@peac/telemetry` - Interfaces + no-op implementation
- `@peac/telemetry-otel` - OpenTelemetry adapter

These packages are placed at the root of `packages/`, NOT under `rails/`, `mappings/`, or `transport/`.

## Context

When adding OpenTelemetry support, we considered several package naming options:

1. `@peac/rails-otel` - Following the rails pattern
2. `@peac/mappings-otel` - Following the mappings pattern
3. `@peac/telemetry` + `@peac/telemetry-otel` - New infrastructure category

## Rationale

### Package Type Taxonomy

| Package Type  | Purpose                   | Examples                     |
| ------------- | ------------------------- | ---------------------------- |
| `rails/*`     | **Payment normalization** | stripe, x402, razorpay, card |
| `mappings/*`  | **Protocol mappings**     | mcp, acp, rsl, tap           |
| `transport/*` | **Transport bindings**    | grpc, http, ws               |

OpenTelemetry is **none of these**. It is:

- Not a payment rail
- Not a protocol mapping
- Not a transport binding

It is **observability infrastructure** - a cross-cutting concern similar to `@peac/privacy`.

### Why NOT `@peac/rails-otel`

The `rails/` directory contains payment rail adapters that normalize payment processor events into PEAC `PaymentEvidence`. Examples:

- `@peac/rails-stripe` - Stripe webhook normalization
- `@peac/rails-x402` - x402 header normalization
- `@peac/rails-razorpay` - Razorpay UPI normalization

OpenTelemetry does not normalize payment events. Placing it in `rails/` would:

1. Violate the semantic meaning of "rail"
2. Confuse developers about the package's purpose
3. Create precedent for dumping unrelated packages into `rails/`

### Why NOT `@peac/mappings-otel`

The `mappings/` directory contains protocol mapping adapters that translate between external protocols and PEAC. Examples:

- `@peac/mappings-mcp` - Model Context Protocol
- `@peac/mappings-acp` - Agent Commerce Protocol
- `@peac/mappings-tap` - Trusted Agent Protocol

OpenTelemetry is not a protocol that PEAC maps to/from. It is an instrumentation layer.

### Why `@peac/telemetry` + `@peac/telemetry-otel`

This follows the pattern established by `@peac/privacy`:

- Cross-cutting infrastructure concern
- Not payment-specific, not protocol-specific
- Used across multiple packages

The split into two packages ensures:

1. **Zero runtime cost when disabled** - Core packages depend only on `@peac/telemetry` (interfaces)
2. **Runtime portability** - `@peac/telemetry` has no OTel dependency, works in edge/WASM
3. **Opt-in OTel** - Only apps that want OTel add `@peac/telemetry-otel`

## Consequences

### Positive

- Clear semantic meaning for each package category
- Consistent with `@peac/privacy` pattern
- Zero overhead when telemetry is disabled
- Runtime-portable interfaces

### Negative

- Two packages instead of one (but this is intentional for the opt-in pattern)

## Alternatives Considered

### Single Package `@peac/otel`

Rejected because:

- Would require OTel dependency in all consuming packages
- No way to have zero-cost disabled path
- Edge/WASM runtime portability issues

### Inline Telemetry in `@peac/protocol`

Rejected because:

- Bloats core package with optional functionality
- Forces OTel dependency on all users
- Violates single-responsibility principle

## References

- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- PEAC TELEMETRY_PLAN.md (local planning doc)
