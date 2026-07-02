# PEAC Integration Kit: UCP (Universal Commerce Protocol)

Integration guide for recording PEAC evidence from Universal Commerce Protocol (UCP) surfaces.

UCP is a date-versioned commerce specification (`ucp.dev`) that defines commerce
messages and their signatures. PEAC observes UCP surfaces and preserves what they
reported as portable, offline-verifiable interaction records. UCP message signatures
remain UCP/RFC 9421 + RFC 9530 semantics; PEAC records the observation and PEAC-side
evidence, and does not execute checkout, process payment, or replace UCP signature
verification or UCP conformance.

## What You Need

- `@peac/mappings-ucp`: UCP surface verification and evidence mapping

## What PEAC Records

- An observation of a UCP webhook or signed UCP surface, preserved as a PEAC interaction record.
- The UCP message and its signature material, preserved as observed (the raw upstream artifact is not modified).
- A PEAC record envelope using RFC 8785 JCS and SHA-256.

## Quick Start

```bash
npm install @peac/mappings-ucp
```

See [`examples/ucp-webhook-express/`](../../examples/ucp-webhook-express/) for a
runnable Express webhook example that verifies a UCP surface and records PEAC
evidence.

## Reference

- `@peac/mappings-ucp`: UCP surface verification and evidence mapping
- Example: [`examples/ucp-webhook-express/`](../../examples/ucp-webhook-express/)
- Upstream snapshot + drift guard: [`specs/upstream/ucp/signatures-snapshot.json`](../../specs/upstream/ucp/signatures-snapshot.json) (pinned tag `v2026-04-08`)
- Conformance fixtures: [`specs/conformance/fixtures/ucp/`](../../specs/conformance/fixtures/ucp/)
- UCP signatures specification: [ucp.dev/2026-04-08/specification/signatures](https://ucp.dev/2026-04-08/specification/signatures/)

## Non-goals

- PEAC does not execute checkout.
- PEAC does not process payment or hold funds.
- PEAC does not replace UCP signatures or UCP conformance.
- PEAC does not claim UCP partnership or support. Inclusion here is descriptive and does not imply endorsement, dependency, or support.
