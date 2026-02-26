# @peac/schema

PEAC protocol schemas: Zod validators, TypeScript types, and pure validation functions. No I/O.

## Installation

```bash
pnpm add @peac/schema
```

## What It Does

`@peac/schema` is Layer 1 of the PEAC stack. It provides Zod schemas for all PEAC receipt types, validation functions, and utility functions like `computeReceiptRef()`. It contains only schemas and pure functions: no I/O, no network calls, no side effects.

## How Do I Validate a Receipt?

```typescript
import { parseReceiptClaims } from '@peac/schema';

const result = parseReceiptClaims(decodedPayload);

if (result.ok) {
  console.log(result.variant); // 'commerce' or 'attestation'
  console.log(result.claims.iss); // validated issuer
}
```

## How Do I Compute a Receipt Reference?

```typescript
import { computeReceiptRef } from '@peac/schema';

const ref = await computeReceiptRef(jws);
// 'sha256:a1b2c3...' (content-addressed, deterministic)
```

## How Do I Validate Evidence Before Signing?

```typescript
import { assertJsonSafeIterative } from '@peac/schema';

const result = assertJsonSafeIterative(evidence);
if (!result.safe) {
  throw new Error(result.violations.join(', '));
}
```

## How Do I Validate an Evidence Carrier?

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

- `@peac/kernel` (Layer 0): Types that schemas validate
- `@peac/protocol` (Layer 3): Uses schemas for issuance and verification
- `@peac/mappings-*` (Layer 4): Transport-specific carrier validation
- All packages that handle receipt data

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
