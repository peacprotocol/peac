# PEAC Integration Kit: paymentauth (HTTP Payment Authentication)

Integration guide for recording PEAC evidence from paymentauth/MPP payment flows.

## What You Need

- `@peac/mappings-paymentauth`: envelope parsing, evidence mapping, carrier adapter

## What You Get

- Parsed paymentauth challenges, credentials, and receipts
- PEAC evidence records from payment flows
- Carrier coexistence: PEAC-Receipt and Payment-Receipt on the same response

## Quick Start

```bash
npm install @peac/mappings-paymentauth
```

### Parse a 402 Payment Challenge

```typescript
import { parsePaymentauthChallenges, normalizeChallenge } from '@peac/mappings-paymentauth';

// Server returns 402 with WWW-Authenticate: Payment ...
const challenges = parsePaymentauthChallenges(wwwAuthenticateHeader);
const challenge = normalizeChallenge(challenges[0]);

console.log(challenge.id); // challenge identifier
console.log(challenge.method); // payment method
console.log(challenge.intent); // "charge" or "session"
console.log(challenge.decodedRequest); // decoded request payload
```

### Map Receipt to Evidence

```typescript
import {
  parsePaymentauthReceipt,
  normalizeReceipt,
  fromPaymentauthReceipt,
} from '@peac/mappings-paymentauth';

// After payment: server returns Payment-Receipt header
const raw = parsePaymentauthReceipt(paymentReceiptHeader);
const receipt = normalizeReceipt(raw);
const evidence = fromPaymentauthReceipt(receipt, challenge);

console.log(evidence.rail); // "paymentauth"
console.log(evidence.reference); // receipt reference
```

## Discovery

paymentauth uses OpenAPI extensions for pre-flight discovery:

```typescript
import { extractServiceInfo, extractPaymentInfo } from '@peac/mappings-paymentauth';

// From GET /openapi.json
const serviceInfo = extractServiceInfo(openapiDoc);
const paymentInfo = extractPaymentInfo(operationObject);
```

The live 402 challenge is always authoritative; OpenAPI discovery is advisory.

## JSON-RPC / MCP Transport

paymentauth defines JSON-RPC error codes for MCP and JSON-RPC transports:

```typescript
import {
  isPaymentRequiredError,
  extractCredentialFromMcpMeta,
  extractReceiptFromMcpMeta,
} from '@peac/mappings-paymentauth';

// JSON-RPC error: -32042 = Payment Required
if (isPaymentRequiredError(error)) {
  // Handle payment challenge from error.data
}

// MCP _meta keys (coexist with org.peacprotocol/* keys)
const credential = extractCredentialFromMcpMeta(meta);
const receipt = extractReceiptFromMcpMeta(meta);
```

## Header Coexistence

PEAC `PEAC-Receipt` and paymentauth `Payment-Receipt` can appear on the same HTTP response. They serve different purposes and have no semantic coupling:

- `PEAC-Receipt`: signed PEAC interaction record (compact JWS)
- `Payment-Receipt`: paymentauth payment receipt (base64url JSON)

## Reference

- `@peac/mappings-paymentauth`: envelope parsing, evidence mapping, carrier adapter
- paymentauth spec: `draft-ryan-httpauth-payment` (active individual draft)
- MPP ecosystem: https://mpp.dev/
