# PEAC Problem+JSON Catalog

This document enumerates the canonical problem types used across PEAC Protocol implementations, following RFC 9457 Problem Details for HTTP APIs.

## Base URI

All PEAC problem types use the base URI: `https://peacprotocol.org/problems/`

## Problem Types

### Payment Required (`payment-required`)

**URI:** `https://peacprotocol.org/problems/payment-required`
**Status:** 402
**Title:** Payment Required

Returned when a resource requires payment before access is granted.

**Example:**

```json
{
  "type": "https://peacprotocol.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "This resource requires payment via x402",
  "requirements": {
    "scheme": "x402",
    "network": "base-mainnet",
    "amount": "1000000"
  }
}
```

### Invalid Signature (`invalid-signature`)

**URI:** `https://peacprotocol.org/problems/invalid-signature`
**Status:** 422
**Title:** Invalid Signature

Returned when receipt signature verification fails.

### Invalid JWS Format (`invalid-jws-format`)

**URI:** `https://peacprotocol.org/problems/invalid-jws-format`
**Status:** 400
**Title:** Invalid JWS Format

Returned when the receipt is not a valid JWS compact serialization.

### Schema Validation Failed (`schema-validation-failed`)

**URI:** `https://peacprotocol.org/problems/schema-validation-failed`
**Status:** 422
**Title:** Schema Validation Failed

Returned when the receipt payload does not conform to the required schema.

**Example:**

```json
{
  "type": "https://peacprotocol.org/problems/schema-validation-failed",
  "title": "Schema Validation Failed",
  "status": 422,
  "validation-failures": [
    "receipt.typ: must be equal to constant",
    "receipt.jti: must match pattern"
  ]
}
```

### Unknown Key ID (`unknown-key-id`)

**URI:** `https://peacprotocol.org/problems/unknown-key-id`
**Status:** 422
**Title:** Unknown Key ID

Returned when the receipt references a key ID that cannot be resolved.

### Expired Receipt (`expired-receipt`)

**URI:** `https://peacprotocol.org/problems/expired-receipt`
**Status:** 422
**Title:** Expired Receipt

Returned when the receipt has passed its expiration time.

### Processing Error (`processing-error`)

**URI:** `https://peacprotocol.org/problems/processing-error`
**Status:** 500
**Title:** Processing Error

Returned when an unexpected error occurs during processing.

### Policy Not Found (`policy-not-found`)

**URI:** `https://peacprotocol.org/problems/policy-not-found`
**Status:** 404
**Title:** Policy Not Found

Returned when no policy can be discovered for a resource.

### Replay Detected (`replay-detected`)

**URI:** `https://peacprotocol.org/problems/replay-detected`
**Status:** 409
**Title:** Replay Detected

Returned when a receipt has already been used.

### Rate Limited (`rate-limited`)

**URI:** `https://peacprotocol.org/problems/rate-limited`
**Status:** 429
**Title:** Rate Limited

Returned when request rate limits are exceeded.

**Example:**

```json
{
  "type": "https://peacprotocol.org/problems/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "Request rate limit exceeded",
  "retry_after": 60
}
```

## Usage Guidelines

1. **Media Type:** Always use `application/problem+json` for Problem Details responses
2. **Retry-After:** Include `Retry-After` header for 429 and 503 responses
3. **Instance:** Include `instance` field with request path when helpful for debugging
4. **Extensions:** Problem Details may include additional fields specific to the problem type
5. **Client Handling:** Clients should handle unknown problem types gracefully

## Implementation

Problem Details are generated using the `ProblemFactory` class in `@peac/core/problems`:

```typescript
import { Problems } from '@peac/core/problems';

const problem = Problems.paymentRequired('x402', 'base-mainnet', '1000000');
return Response.json(problem, {
  status: 402,
  headers: {
    'Content-Type': 'application/problem+json',
    'Retry-After': '0',
  },
});
```
