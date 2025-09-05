# PEAC Protocol Error Catalog (RFC 9457 Problem Details)

## Overview

All PEAC API errors follow [RFC 9457 Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) format.

## Base Error Structure

```json
{
  "type": "https://peac.dev/errors/{error-code}",
  "title": "Human-readable error summary",
  "status": 400,
  "detail": "Specific error details for this instance",
  "instance": "/peac/verify/abc123",
  "timestamp": "2025-09-05T12:00:00Z"
}
```

## Error Catalog

### 400 Bad Request - Schema Validation Failed

```json
{
  "type": "https://peac.dev/errors/schema-validation-failed",
  "title": "Receipt Schema Validation Failed",
  "status": 400,
  "detail": "Missing required field: aipref.status",
  "instance": "/peac/verify",
  "errors": [
    {
      "field": "aipref.status",
      "code": "required",
      "message": "Field is required"
    }
  ]
}
```

### 401 Unauthorized - Invalid Proof

```json
{
  "type": "https://peac.dev/errors/invalid-proof",
  "title": "Receipt Signature Verification Failed",
  "status": 401,
  "detail": "EdDSA signature verification failed for kid: site-2025-09",
  "instance": "/peac/verify",
  "kid": "site-2025-09",
  "algorithm": "EdDSA"
}
```

### 401 Unauthorized - Unknown Key ID

```json
{
  "type": "https://peac.dev/errors/unknown-kid",
  "title": "Unknown Key Identifier",
  "status": 401,
  "detail": "No public key found for kid: old-key-2023",
  "instance": "/peac/verify",
  "kid": "old-key-2023",
  "available_kids": ["site-2025-09", "site-2025-08"]
}
```

### 402 Payment Required - Payment Challenge

```json
{
  "type": "https://www.rfc-editor.org/rfc/rfc9110.html#status.402",
  "title": "Payment Required",
  "status": 402,
  "detail": "Access to this resource requires payment",
  "instance": "/api/resource",
  "accept-payment": [
    {
      "rail": "x402",
      "challenge": "x402:pay:0x123...abc@1:2.50:USD",
      "estimate": { "value": "2.50", "currency": "USD" }
    },
    {
      "rail": "tempo",
      "challenge": "tempo:pay:contract@testnet:2.50:USD",
      "estimate": { "value": "2.50", "currency": "USD" }
    }
  ]
}
```

### 422 Unprocessable Entity - Policy Precondition Failed

```json
{
  "type": "https://peac.dev/errors/policy-precondition-failed",
  "title": "AIPREF Policy Precondition Not Met",
  "status": 422,
  "detail": "Resource requires train-ai=false but policy allows train-ai=true",
  "instance": "/api/protected-content",
  "policy_mismatch": {
    "required": { "train-ai": false },
    "provided": { "train-ai": true }
  }
}
```

### 429 Too Many Requests - Rate Limited

```json
{
  "type": "https://peac.dev/errors/rate-limited",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "Exceeded 100 requests per minute limit",
  "instance": "/peac/verify",
  "retry_after": 30,
  "limit": {
    "requests": 100,
    "window": "1m",
    "remaining": 0,
    "reset_at": "2025-09-05T12:01:00Z"
  }
}
```

### 500 Internal Server Error - Crypto Operation Failed

```json
{
  "type": "https://peac.dev/errors/crypto-operation-failed",
  "title": "Cryptographic Operation Failed",
  "status": 500,
  "detail": "Failed to import Ed25519 public key",
  "instance": "/peac/verify",
  "trace_id": "abc-123-def"
}
```

### 502 Bad Gateway - Upstream Provider Error

```json
{
  "type": "https://peac.dev/errors/upstream-provider-error",
  "title": "Payment Provider Unavailable",
  "status": 502,
  "detail": "Failed to verify payment with x402 provider",
  "instance": "/peac/verify",
  "provider": "x402",
  "retry_after": 5
}
```

### 503 Service Unavailable - Rail Unavailable

```json
{
  "type": "https://peac.dev/errors/rail-unavailable",
  "title": "Payment Rail Temporarily Unavailable",
  "status": 503,
  "detail": "Tempo payment rail is currently unavailable",
  "instance": "/api/resource",
  "rail": "tempo",
  "alternative_rails": ["x402", "l402", "stripe"],
  "retry_after": 60
}
```

### 504 Gateway Timeout - Discovery Timeout

```json
{
  "type": "https://peac.dev/errors/discovery-timeout",
  "title": "Discovery Operation Timed Out",
  "status": 504,
  "detail": "Failed to fetch .well-known/peac.txt within 5 seconds",
  "instance": "/peac/discover",
  "operation": "fetch_peac_txt",
  "timeout_ms": 5000,
  "url": "https://example.com/.well-known/peac.txt"
}
```

## Error Code Mapping

| Error Type | HTTP Status | Type URI |
|------------|------------|----------|
| Schema Validation | 400 | https://peac.dev/errors/schema-validation-failed |
| Invalid Signature | 401 | https://peac.dev/errors/invalid-proof |
| Unknown KID | 401 | https://peac.dev/errors/unknown-kid |
| Payment Required | 402 | https://www.rfc-editor.org/rfc/rfc9110.html#status.402 |
| Policy Failed | 422 | https://peac.dev/errors/policy-precondition-failed |
| Rate Limited | 429 | https://peac.dev/errors/rate-limited |
| Crypto Failed | 500 | https://peac.dev/errors/crypto-operation-failed |
| Provider Error | 502 | https://peac.dev/errors/upstream-provider-error |
| Rail Unavailable | 503 | https://peac.dev/errors/rail-unavailable |
| Timeout | 504 | https://peac.dev/errors/discovery-timeout |

## Client Error Handling

```typescript
// Example client error handling
try {
  const result = await fetch('/peac/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/jose' },
    body: receipt
  });
  
  if (!result.ok) {
    const problem = await result.json();
    
    switch (problem.type) {
      case 'https://peac.dev/errors/rate-limited':
        // Wait and retry after problem.retry_after seconds
        await sleep(problem.retry_after * 1000);
        return retry();
        
      case 'https://peac.dev/errors/rail-unavailable':
        // Try alternative rail
        return tryAlternativeRail(problem.alternative_rails[0]);
        
      case 'https://peac.dev/errors/unknown-kid':
        // Refresh keys and retry
        await refreshKeys();
        return retry();
        
      default:
        throw new Error(`${problem.title}: ${problem.detail}`);
    }
  }
} catch (error) {
  console.error('Failed to verify receipt:', error);
}
```

## Security Considerations

- Error messages MUST NOT leak sensitive information
- Stack traces MUST NOT be exposed in production
- Timing attacks mitigation: Use constant-time operations for crypto
- Rate limiting errors include retry_after to prevent thundering herd
- Instance URIs should be opaque identifiers, not expose internal paths