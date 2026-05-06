# Abstraction Boundaries

PEAC core defines reusable protocol primitives. External standards and
ecosystem-specific semantics belong in thin profiles, mappings, adapters,
fixtures, and examples. This document defines the abstraction boundaries
that keep PEAC vendor-neutral and reusable across ecosystems.

## Core hierarchy

```text
Core    = generic PEAC semantics
Profile = external standard mapping
Adapter = implementation convenience
Example = ecosystem-specific demonstration
```

| Layer   | Where it lives                                                                     | What it owns                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core    | `@peac/kernel`, `@peac/schema`, `@peac/crypto`, `@peac/protocol`                   | Generic types, schemas, validators, signing, the canonical wire envelope, shared reference grammars (`OpaqueRefSchema`, `Sha256DigestSchema`), the canonical type-to-extension map. |
| Profile | `packages/mappings/<system>/`, `docs/specs/<SYSTEM>-*-PROFILE.md`                  | Ecosystem-specific field shapes, vocabulary, and validation rules (e.g. `org.peacprotocol/a2a-handoff` for A2A v1.0 handoff records).                                               |
| Adapter | `packages/adapters/<system>/`, `packages/rails-<system>/`, `packages/middleware-*` | Implementation convenience that bridges PEAC primitives to a specific runtime, framework, or rail.                                                                                  |
| Example | `examples/<system>-*/`, `integrator-kits/<system>/`                                | Vendor- or project-specific demonstrations of profiles in action.                                                                                                                   |

## Standing principle

PEAC should be generic where semantics are shared, profile-specific where
correctness requires it, adapter-specific only at the implementation edge,
and vendor-specific only in examples or compatibility notes.

## Rules

1. **Core is ecosystem-neutral.** Names, types, and runtime imports in the
   core layer (`@peac/kernel`, `@peac/schema`, `@peac/crypto`, `@peac/protocol`)
   must not encode any single ecosystem's vocabulary. Shared names like
   `OpaqueRefSchema`, `Sha256DigestSchema`, `HandoffObservation`-shaped types,
   and `TYPE_TO_EXTENSION_MAP` are correct. Names like `A2ATaskRef`,
   `McpToolReceipt`, `OpenAITraceRecord`, or `StripePaymentRecord` are not
   acceptable in core; they belong in the profile or adapter layer.

2. **Profile validators stay strict.** Generic abstraction must not weaken
   profile-specific validation. The generic layer provides reusable shape;
   the profile layer enforces ecosystem-specific correctness. For example,
   `A2AHandoffSchema` uses a discriminated union over per-event
   `z.literal(...)` schemas so a payload's `type` and `event` fields cannot
   drift apart, even though the surrounding extension namespace is generic.

3. **Compose with external systems; do not absorb them.** PEAC composes with
   A2A, MCP, x402, AP2, OpenTelemetry, gateways, agent frameworks, CI
   systems, CLIs, and orchestration systems. PEAC does not become an
   orchestrator, observability backend, payment rail, auth system,
   governance engine, agent runtime, policy-decision engine, workflow
   manager, task scheduler, or monitoring platform.

4. **External SDKs do not enter core.** Mapping to another ecosystem's
   vocabulary does not require depending on its SDK. A profile understands
   the external wire or document shape; a helper accepts caller-supplied
   JSON and normalizes it internally; PEAC core does not import the
   external runtime SDK. Adding an external SDK dependency to the core
   layer requires explicit architecture review.

5. **Extension points are explicit, not loose.** Every profile or
   integration surface uses named extension points: extension namespace
   (`org.peacprotocol/<group>`), type URIs, carrier profile, reference
   grammar, digest grammar, error-code family (when emitted), conformance
   section, fixture verifier, and profile version. Avoid `metadata: any`,
   `extra: object`, `custom: object`, vague vendor-shaped payloads in core,
   or silent pass-through semantics without validation.

6. **Custom attributes are scoped.** When PEAC publishes an attribute name
   intended to compose with an external standard's namespace
   (for example, OpenTelemetry span attributes), the attribute is a PEAC
   custom attribute unless that standard has accepted it. PEAC does not
   ship exporters, SDK dependencies, collectors, or
   semantic-convention claims for external standards unless a release
   explicitly adds one.

## Promoting a primitive to core

A concept is admitted to the core layer only if it satisfies all of:

1. It applies to at least two plausible integrations.
2. Its semantics are stable independent of any one vendor or project.
3. It can be validated without importing the originating ecosystem's SDK.
4. It does not weaken correctness for the first concrete profile.
5. Its name still makes sense if the first integration disappeared.

If any criterion fails, the concept stays in its profile or adapter
package.

## Worked example

The v0.14.1 A2A handoff records release illustrates the hierarchy in
practice:

- **Core** (`@peac/schema`): `OpaqueRefSchema` (multi-prefix grammar with
  UTF-8 byte bounds), `Sha256DigestSchema` (canonical digest grammar),
  `validateA2AHandoff` structured-error contract, the
  `org.peacprotocol/a2a-handoff` extension group entry, and the 10
  type URIs in the canonical type-to-extension map.
- **Profile** (`@peac/mappings-a2a` and
  [`docs/specs/A2A-HANDOFF-RECORDS.md`](../specs/A2A-HANDOFF-RECORDS.md)):
  A2A v1.0 vocabulary mapping, the
  `signature_observation.caller_reported_verification` field shape,
  digest-only `card_ref`, and the per-event discriminated-union schemas
  that prevent `type` and `event` from drifting.
- **Examples**:
  [`examples/a2a-gateway-pattern/`](../../examples/a2a-gateway-pattern/) and
  [`integrator-kits/a2a/fixtures/`](../../integrator-kits/a2a/fixtures/)
  demonstrate the profile in action without leaking
  ecosystem-specific names back into core.

The same pattern applies to subsequent profiles (CLI execution records,
lifecycle observation records, MCP tool-call records, AP2 mandate
references): hoist truly shared pieces into core only after the
admission test above passes; everything ecosystem-specific stays at the
profile or adapter layer.

## See also

- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) (canonical layered package
  model and wire format)
- [`docs/specs/A2A-HANDOFF-RECORDS.md`](../specs/A2A-HANDOFF-RECORDS.md)
  (worked profile example)
- [`docs/architecture/ADR-001-telemetry-package-taxonomy.md`](ADR-001-telemetry-package-taxonomy.md)
