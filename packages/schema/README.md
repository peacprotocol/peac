# @peac/schema

PEAC protocol schemas: Zod validators, TypeScript types, and pure validation functions for signed interaction receipts. No I/O.

## Installation

```bash
pnpm add @peac/schema
```

## What It Does

`@peac/schema` is Layer 1 of the PEAC protocol stack. It provides Zod schemas for all receipt claim types (both the legacy `peac-receipt/0.1` wire format and the current stable Interaction Record format), typed extension group accessors, evidence validation with DoS protection, and pure utility functions such as `computeReceiptRef()`. It depends only on `@peac/kernel` and Zod, performs no I/O, and has no side effects.

## How Do I Use It?

### Parse and classify receipt claims

```typescript
import { parseReceiptClaims } from '@peac/schema';

const result = parseReceiptClaims(decodedPayload);

if (result.ok) {
  console.log(result.variant); // 'commerce' | 'attestation' | 'wire-02'
  console.log(result.wireVersion); // '0.1' | '0.2'
  console.log(result.claims.iss); // validated issuer
  console.log(result.warnings); // VerificationWarning[]
}
```

### Validate Interaction Record claims with extension accessors

```typescript
import { Wire02ClaimsSchema, getCommerceExtension, getAccessExtension } from '@peac/schema';

const claims = Wire02ClaimsSchema.parse(decoded);

const commerce = getCommerceExtension(claims.ext);
if (commerce) {
  console.log(commerce.rail); // e.g. 'stripe'
  console.log(commerce.amount_minor); // string, e.g. '1999'
  console.log(commerce.cur); // e.g. 'USD'
}

const access = getAccessExtension(claims.ext);
if (access) {
  console.log(access.resource); // accessed resource URI
}
```

### Compute a content-addressed receipt reference

```typescript
import { computeReceiptRef } from '@peac/schema';

const ref = await computeReceiptRef(compactJws);
// 'sha256:a1b2c3...' (deterministic, requires WebCrypto)
```

### Validate evidence before signing

```typescript
import { validateEvidence } from '@peac/schema';

const result = validateEvidence(evidenceObject);
if (!result.valid) {
  console.log(result.error); // validation failure details
}
```

### Validate an evidence carrier against transport limits

```typescript
import { validateCarrierConstraints, CARRIER_TRANSPORT_LIMITS } from '@peac/schema';
import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';

const carrier: PeacEvidenceCarrier = {
  receipt_jws: jws,
  receipt_ref: ref,
};

const meta: CarrierMeta = {
  transport: 'mcp',
  format: 'embed',
  max_size: CARRIER_TRANSPORT_LIMITS.mcp,
};

const result = validateCarrierConstraints(carrier, meta);
// result.valid: boolean, result.violations: string[]
```

## Integrates With

- `@peac/kernel` (Layer 0): Types and constants that schemas validate against
- `@peac/crypto` (Layer 2): Signing and verification using validated claims
- `@peac/protocol` (Layer 3): High-level issuance and verification built on these schemas
- `@peac/mappings-*` and `@peac/adapter-*` (Layer 4): Transport-specific carrier validation and external system mapping

## For Agent Developers

If you are building an AI agent or MCP server that issues or verifies signed interaction receipts, you typically will not use `@peac/schema` directly. Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server, or use `@peac/protocol` for programmatic receipt issuance and verification. Reach for `@peac/schema` when you need fine-grained control over claim parsing, extension group access, or carrier validation in a custom integration.

## For Operators

Operators deploying PEAC infrastructure can use `@peac/schema` to validate receipt claims at ingestion boundaries, enforce kernel constraints with `validateKernelConstraints()`, and verify carrier size limits per transport before forwarding evidence across services.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
