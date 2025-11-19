# PEAC Kernel Specifications

**Version:** 0.9.15
**Status:** Normative
**Last Updated:** 2025-11-18

---

## Purpose

The `specs/kernel/` directory contains the **normative source of truth** for all PEAC protocol constants, error codes, and registries. These JSON files define the canonical values that MUST be used across all implementations.

**Key Principle:** Code is derived from specs, not the other way around.

---

## Files

### 1. `constants.json`

**Normative constants** for the PEAC protocol:

- **Wire format:** `peac.receipt/0.9` (frozen until v1.0)
- **Algorithms:** EdDSA (Ed25519 signatures)
- **HTTP headers:** `PEAC-Receipt`, `DPoP`
- **Discovery:** `/.well-known/peac.txt` location and caching
- **JWKS:** Rotation schedules (90-day rotation, 7-day overlap)
- **Receipt validation:** ID length, TTL defaults
- **Amount limits:** Min/max payment amounts

**Usage:**
- TypeScript implementation: `packages/kernel/src/constants.ts`
- Codegen: `scripts/codegen/generate-constants.ts` (v0.9.16+)

---

### 2. `errors.json`

**Normative error codes** for PEAC protocol failures:

Each error includes:
- `code`: Error identifier (e.g., `E_INVALID_SIGNATURE`)
- `http_status`: HTTP status code for REST APIs
- `title`: Human-readable title
- `description`: Detailed explanation
- `retriable`: Whether the error is transient and can be retried
- `category`: Error classification (verification, validation, infrastructure, control)

**Categories:**
- **verification:** Signature or key verification failures
- **validation:** Receipt format/claim validation errors
- **infrastructure:** JWKS fetch, rate limiting, circuit breaker
- **control:** Control engine decisions (deny, review)

**Usage:**
- TypeScript implementation: `packages/kernel/src/errors.ts`
- RFC 9457 Problem Details: `packages/protocol/src/errors.ts`

---

### 3. `registries.json`

**Normative registries** for extensible protocol components:

#### Payment Rails
- Identifiers for payment settlement layers (x402, l402, card-network, upi)
- Categories: agentic-payment, card, account-to-account
- Reference URLs to specifications

#### Control Engines
- Identifiers for governance/authorization engines
- Categories: limits, fraud, mandate
- Examples: spend-control-service, risk-engine, mandate-service

#### Transport Methods
- Transport-layer bindings (DPoP, HTTP Signature, none)
- Categories: proof-of-possession, message-signature
- Reference: RFC 9449 (DPoP), RFC 9421 (HTTP Signature)

#### Agent Protocols
- Agentic protocol integrations (MCP, ACP, AP2, TAP)
- Categories: tool-protocol, commerce-protocol, agent-protocol, card-protocol
- Reference URLs to protocol specifications

**Usage:**
- TypeScript implementation: `packages/kernel/src/registries.ts`
- Validation: Registry IDs are opaque strings at wire level
- Extension: New entries can be added in v0.9.x releases

---

## Spec Contract

### For Implementation Authors

1. **MUST** derive constants/errors/registries from these JSON files
2. **MUST NOT** hardcode values in package source code
3. **SHOULD** use codegen scripts to auto-generate TypeScript (v0.9.16+)
4. **MAY** manually sync for v0.9.15 (codegen deferred to v0.9.16)

### For Spec Authors

1. **MUST** update these JSON files first before changing code
2. **MUST** increment `version` field on any change
3. **MUST** document rationale in commit message
4. **SHOULD** add new entries to registries rather than modifying existing ones

---

## Versioning

- **Spec Version:** Incremented on any change to kernel specs
- **Wire Format:** Frozen at `peac.receipt/0.9` until v1.0 GA
- **Registries:** Additive-only in v0.9.x (no removals until v1.0)

---

## Architecture Relationship

```
specs/kernel/*.json         ← Normative source
       ↓
packages/kernel/src/*.ts    ← Manual sync (v0.9.15) / Codegen (v0.9.16+)
       ↓
packages/{schema,protocol,control,crypto}  ← Import from @peac/kernel
```

**v0.9.15:** Manual synchronization (kernel package created, codegen deferred)
**v0.9.16+:** Automated codegen with CI validation

---

## Examples

### Using Constants

```typescript
import { WIRE_TYPE, ALGORITHMS, HEADERS } from '@peac/kernel';

// Issue a receipt
const header = {
  typ: WIRE_TYPE,           // "peac.receipt/0.9"
  alg: ALGORITHMS.default,  // "EdDSA"
};

// Add receipt to HTTP response
response.headers.set(HEADERS.receipt, receiptJWS);
```

### Using Errors

```typescript
import { ERRORS } from '@peac/kernel';

// Return standardized error
return {
  type: `https://peac.dev/errors/${ERRORS.E_INVALID_SIGNATURE.code}`,
  title: ERRORS.E_INVALID_SIGNATURE.title,
  status: ERRORS.E_INVALID_SIGNATURE.http_status,
  detail: "Signature verification failed for kid=2024-11-18T00:00:00Z",
};
```

### Using Registries

```typescript
import { REGISTRIES } from '@peac/kernel';

// Validate payment rail
const railInfo = REGISTRIES.payment_rails.find(r => r.id === paymentRail);
if (!railInfo) {
  throw new Error(`Unknown payment rail: ${paymentRail}`);
}

// Check if control engine is recognized
const engineInfo = REGISTRIES.control_engines.find(e => e.id === engineId);
```

---

## Migration from Hardcoded Values

**v0.9.14 and earlier:** Constants/errors hardcoded in package source
**v0.9.15:** Kernel specs created, manual sync to `@peac/kernel`
**v0.9.16+:** Codegen enforced with CI gates

### Breaking Changes in v0.9.15

- Error codes now prefixed with `E_` (e.g., `E_INVALID_SIGNATURE`)
- Wire type moved from hardcoded string to `WIRE_TYPE` constant
- Registries moved from `docs/specs/registries.json` to `specs/kernel/registries.json`

---

## Future: Codegen (v0.9.16+)

**Script:** `scripts/codegen/generate-kernel.ts`

**Workflow:**
1. Update `specs/kernel/*.json` (normative source)
2. Run `pnpm codegen:kernel`
3. TypeScript files auto-generated in `packages/kernel/src/`
4. CI verifies TypeScript matches JSON (parity gate)

**Benefits:**
- Single source of truth
- No manual drift between specs and code
- CI enforcement via `scripts/ci/gates.ts`

---

## Normative Status

This directory is **NORMATIVE** as of v0.9.15.

- Implementations MUST conform to values defined in these JSON files
- Deviations are considered protocol violations
- Future IETF Internet-Draft will reference these specs

---

**Maintained by:** PEAC Protocol Working Group
**Governance:** See `docs/PEAC_NORMATIVE_DECISIONS_LOG.md` for architectural decisions
