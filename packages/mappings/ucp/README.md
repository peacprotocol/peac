# @peac/mappings-ucp

Universal Commerce Protocol (UCP) order mapping to PEAC signed receipts, webhook signature verification, and dispute evidence generation.

## Installation

```bash
pnpm add @peac/mappings-ucp
```

## What It Does

`@peac/mappings-ucp` maps UCP order data to PEAC receipt claims, verifies UCP request and webhook signatures, and generates structured dispute evidence bundles. The current UCP signing model is RFC 9421 HTTP Message Signatures (`Signature-Input` / `Signature` with an RFC 9530 `Content-Digest` over the raw body bytes), verified by `verifyUcpHttpSignature`. The earlier `Request-Signature` detached JWS (RFC 7797) path remains available for backward compatibility, deprecated, via `verifyUcpWebhookSignature`; the two schemes never silently fall back to each other. Order state is kept distinct from payment state: the `payment_state_source` field marks whether payment status was explicitly provided or derived from order fulfillment, so downstream consumers can distinguish observed payment evidence from inferred status.

## How Do I Use It?

### Map a UCP order to receipt claims

```typescript
import { mapUcpOrderToReceipt } from '@peac/mappings-ucp';
import { sign } from '@peac/crypto';

const claims = mapUcpOrderToReceipt({
  order: ucpOrder,
  issuer: 'https://merchant.example.com',
  subject: 'agent:shopper-bot-123',
  currency: 'USD',
});

// Sign the mapped claims into a JWS receipt (Ed25519 private key + kid)
const receiptJws = await sign(claims, privateKey, kid);
```

### Verify a UCP request or webhook signature (RFC 9421)

`verifyUcpHttpSignature` is the current signing model. It verifies the RFC 9421
`Signature-Input` / `Signature` and, when a body is present, an RFC 9530
`Content-Digest` over the raw request body bytes. The algorithm (ES256 for P-256,
ES384 for P-384) is resolved from the signing key's curve; UCP does not put `alg`
in `Signature-Input`. The UCP party profile is resolved by the caller (SSRF-safe,
host-allowlisted) and passed in; this function performs no network I/O.

The verifier parses a signed `UCP-Agent` header and returns its profile as
`signer_profile_url`. When you supply `expected_profile_url`, it also binds that
signed profile to the expected signer: the `UCP-Agent` component MUST be signed
and its profile MUST equal the expected URL, or verification fails. An unsigned
component is never trusted.

```typescript
import { verifyUcpHttpSignature } from '@peac/mappings-ucp';

const result = await verifyUcpHttpSignature({
  signature_input: req.headers['signature-input'],
  signature: req.headers['signature'],
  method: 'POST',
  url: 'https://platform.example.com/webhooks/ucp/orders',
  headers: {
    'content-type': req.headers['content-type'],
    'content-digest': req.headers['content-digest'],
    'idempotency-key': req.headers['idempotency-key'],
    'ucp-agent': req.headers['ucp-agent'],
  },
  body_bytes: rawBody,
  profile: ucpProfile, // the /.well-known/ucp document, resolved by the caller
  expected_profile_url: 'https://business.example.com/.well-known/ucp', // bind the signer
});

if (result.valid) {
  // Signature verified and Content-Digest bound the raw body; proceed with mapping.
  // result.signer_profile_url is the bound UCP-Agent profile.
}
```

This verifier covers request-shaped UCP signatures; UCP response signatures use
`@status` and are a separate component model, out of scope here.

### Legacy: verify a Request-Signature detached JWS (deprecated)

Earlier UCP integrations used a `Request-Signature` detached JWS (RFC 7797). That
path remains exported as `verifyUcpWebhookSignature` for backward compatibility
and is deprecated; new integrations should use `verifyUcpHttpSignature`. There is
no silent fallback between the two schemes: the caller selects one explicitly.

```typescript
import { verifyUcpWebhookSignature } from '@peac/mappings-ucp';

// Deprecated: legacy Request-Signature / RFC 7797 path.
const result = await verifyUcpWebhookSignature({
  signature_header: req.headers['request-signature'],
  body_bytes: rawBody,
  profile_url: 'https://business.example.com/.well-known/ucp',
});

if (result.valid) {
  // Signature verified; proceed with order mapping
}
```

### Extract line item summaries and order statistics

```typescript
import { extractLineItemSummary, calculateOrderStats } from '@peac/mappings-ucp';

const summary = extractLineItemSummary(ucpOrder);
const stats = calculateOrderStats(ucpOrder);

console.log(stats.total_items); // number of line items
console.log(stats.fulfilled_items); // items marked fulfilled
```

### Attach and extract evidence carriers on webhook payloads

```typescript
import {
  UcpCarrierAdapter,
  attachCarrierToWebhookPayload,
  extractCarrierFromWebhookPayload,
} from '@peac/mappings-ucp';

// Attach a signed receipt carrier to a UCP webhook payload
attachCarrierToWebhookPayload(webhookPayload, carrier);

// Extract carrier from an incoming webhook payload
const result = extractCarrierFromWebhookPayload(webhookPayload);
if (result) {
  console.log(result.receipts[0].receipt_ref);
}

// Or use the adapter interface
const adapter = new UcpCarrierAdapter();
const extracted = adapter.extract(webhookPayload);
```

## Integrates With

- `@peac/kernel` (Layer 0): Evidence carrier types and constants
- `@peac/schema` (Layer 1): Receipt schemas and carrier validation
- `@peac/crypto` (Layer 2): Sign mapped receipt claims into JWS receipts with `sign()`

## For Agent Developers

If you are building an AI agent that interacts with UCP-based commerce platforms:

- Use `mapUcpOrderToReceipt()` to produce signed evidence of order observations
- Use `verifyUcpHttpSignature()` to verify the RFC 9421 signature on incoming UCP requests and webhooks before mapping (the legacy `verifyUcpWebhookSignature()` covers the deprecated `Request-Signature` path)
- Order status reflects fulfillment state; payment status requires explicit `payment_state` when the upstream source provides it
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise protocol overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
