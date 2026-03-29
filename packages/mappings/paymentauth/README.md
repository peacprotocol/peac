# @peac/mappings-paymentauth

HTTP Payment authentication scheme mapping for PEAC: envelope-first parsing of paymentauth challenges, credentials, and receipts into normalized types and PEAC evidence.

## Installation

```bash
pnpm add @peac/mappings-paymentauth
```

## What It Does

`@peac/mappings-paymentauth` parses and normalizes HTTP Payment authentication scheme headers (aligned with `draft-ryan-httpauth-payment-01`) into structured types, then maps them to PEAC evidence in the Interaction Record format. It handles `WWW-Authenticate`, `Authorization`, and `Payment-Receipt` headers with envelope-first parsing: method-specific payloads are treated as `unknown` and preserved as raw bytes alongside normalized fields. No network I/O.

## How Do I Use It?

### Parse and normalize a payment challenge

```typescript
import { parsePaymentauthChallenges, normalizeChallenge } from '@peac/mappings-paymentauth';

const rawChallenges = parsePaymentauthChallenges(
  'Payment method="stripe", realm="api", request="eyJ..."'
);

const normalized = normalizeChallenge(rawChallenges[0]);
console.log(normalized.method); // 'stripe'
console.log(normalized.realm); // 'api'
console.log(normalized.intent); // decoded from request parameter
```

### Map a paymentauth receipt to PEAC evidence

```typescript
import {
  parsePaymentauthReceipt,
  normalizeReceipt,
  fromPaymentauthReceipt,
  toCommerceExtensionFields,
} from '@peac/mappings-paymentauth';

const raw = parsePaymentauthReceipt(headerValue);
const receipt = normalizeReceipt(raw);

// Map to PEAC PaymentEvidence
const evidence = fromPaymentauthReceipt(receipt);
console.log(evidence.rail); // 'paymentauth'
console.log(evidence.reference); // upstream reference

// Extract commerce extension fields (partial, only from upstream data)
const commerce = toCommerceExtensionFields(receipt);
```

### Extract evidence from HTTP response headers

```typescript
import {
  extractCarrierFromPaymentauthHeaders,
  PaymentauthCarrierAdapter,
} from '@peac/mappings-paymentauth';

// Direct extraction
const result = extractCarrierFromPaymentauthHeaders(responseHeaders);
if (result) {
  console.log(result.receiptJws);
  console.log(result.receiptRef);
}

// Or use the CarrierAdapter for transport-agnostic integration
const adapter = new PaymentauthCarrierAdapter();
```

### JSON-RPC and MCP transport helpers

```typescript
import {
  isPaymentRequiredError,
  parsePaymentauthFromJsonRpcError,
  extractCredentialFromMcpMeta,
  extractReceiptFromMcpMeta,
} from '@peac/mappings-paymentauth';

// Check if a JSON-RPC error is a payment-required response
if (isPaymentRequiredError(error)) {
  const challenges = parsePaymentauthFromJsonRpcError(error);
  // present payment challenge to user/agent
}

// Extract paymentauth artifacts from MCP tool _meta
const credential = extractCredentialFromMcpMeta(meta);
const receipt = extractReceiptFromMcpMeta(meta);
```

## Integrates With

- `@peac/kernel` (Layer 0): Core types and constants
- `@peac/schema` (Layer 1): Zod validators and commerce extension schemas
- `@peac/protocol` (Layer 3): Receipt issuance using mapped evidence
- `@peac/mcp-server` (Layer 5): MCP tool server with payment-required flow

## For Agent Developers

If you are building an AI agent that interacts with paymentauth-enabled services: use `parsePaymentauthChallenges` to decode `WWW-Authenticate: Payment` headers, `fromPaymentauthReceipt` to produce PEAC evidence from upstream receipts, and `PaymentauthCarrierAdapter` to carry evidence across HTTP boundaries. The JSON-RPC and MCP helpers handle transport-specific encoding for agent-to-agent and MCP tool call flows. All parsing is offline with no network I/O.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
