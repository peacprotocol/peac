# Error Response Registry

## RFC 7807 Problem Details

PEAC Protocol uses RFC 7807 Problem Details for structured error responses. All error responses use the `application/problem+json` media type.

## Problem Type Registry

### Core Protocol Errors

#### `/usage-forbidden`

**Type:** `https://peacprotocol.org/problems/usage-forbidden`
**Status:** 403 Forbidden
**Description:** Resource usage is not permitted under current policy

```json
{
  "type": "https://peacprotocol.org/problems/usage-forbidden",
  "title": "Usage Forbidden",
  "status": 403,
  "detail": "Current policy does not permit training use of this resource",
  "instance": "/verify",
  "policy_sources": [
    "https://example.com/.well-known/peac.txt",
    "https://example.com/agent-permissions.json"
  ],
  "required_purpose": "training",
  "denied_reason": "purpose_mismatch"
}
```

#### `/payment-required`

**Type:** `https://peacprotocol.org/problems/payment-required`
**Status:** 402 Payment Required
**Description:** Payment is required to access this resource

```json
{
  "type": "https://peacprotocol.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "Resource access requires payment of $0.01 USD",
  "instance": "/verify",
  "payment": {
    "amount": "0.01",
    "currency": "USD",
    "methods": ["x402", "stripe"]
  },
  "resource": "https://example.com/content",
  "min_tier": "standard"
}
```

#### `/invalid-receipt`

**Type:** `https://peacprotocol.org/problems/invalid-receipt`
**Status:** 422 Unprocessable Entity
**Description:** Receipt format or signature is invalid

```json
{
  "type": "https://peacprotocol.org/problems/invalid-receipt",
  "title": "Invalid Receipt",
  "status": 422,
  "detail": "Receipt signature verification failed",
  "instance": "/verify",
  "receipt_error": "signature_invalid",
  "validation_failures": ["Signature does not match expected key", "Receipt has expired"]
}
```

#### `/rate-limited`

**Type:** `https://peacprotocol.org/problems/rate-limited`
**Status:** 429 Too Many Requests
**Description:** Request rate limit exceeded

```json
{
  "type": "https://peacprotocol.org/problems/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "Rate limit exceeded: 100 requests per minute",
  "instance": "/verify",
  "retry_after": 45,
  "limit": 100,
  "window": "60s",
  "reset_time": "2025-01-01T00:01:00Z"
}
```

#### `/policy-conflict`

**Type:** `https://peacprotocol.org/problems/policy-conflict`
**Status:** 409 Conflict
**Description:** Multiple policies provide conflicting requirements

```json
{
  "type": "https://peacprotocol.org/problems/policy-conflict",
  "title": "Policy Conflict",
  "status": 409,
  "detail": "AIPREF and agent-permissions provide conflicting access rules",
  "instance": "/verify",
  "conflicts": [
    {
      "source": "https://example.com/.well-known/peac.txt",
      "rule": "deny:training"
    },
    {
      "source": "https://example.com/agent-permissions.json",
      "rule": "allow:training"
    }
  ],
  "resolution": "deny_wins"
}
```

### Technical Errors

#### `/processing-error`

**Type:** `https://peacprotocol.org/problems/processing-error`
**Status:** 500 Internal Server Error
**Description:** Server encountered an unexpected error

```json
{
  "type": "https://peacprotocol.org/problems/processing-error",
  "title": "Processing Error",
  "status": 500,
  "detail": "Failed to fetch policy from remote source",
  "instance": "/verify",
  "error_code": "FETCH_TIMEOUT",
  "trace_id": "01HVQK7Z8TD6QTGNT4ANPK7XXQ"
}
```

#### `/invalid-request`

**Type:** `https://peacprotocol.org/problems/invalid-request`
**Status:** 400 Bad Request
**Description:** Request format is invalid

```json
{
  "type": "https://peacprotocol.org/problems/invalid-request",
  "title": "Invalid Request",
  "status": 400,
  "detail": "Request body must contain 'receipt' field",
  "instance": "/verify",
  "validation_failures": ["receipt field is required", "receipt must be a string"]
}
```

## Extension Fields

PEAC Protocol defines these extension fields for Problem Details:

- `policy_sources`: Array of URLs where policies were discovered
- `required_purpose`: The purpose that was required but not provided
- `denied_reason`: Specific reason for denial
- `payment`: Payment details for 402 responses
- `resource`: Resource URL that caused the error
- `min_tier`: Minimum payment tier required
- `receipt_error`: Specific receipt validation error
- `validation_failures`: Array of validation error messages
- `retry_after`: Seconds to wait before retrying
- `limit`: Rate limit threshold
- `window`: Rate limit time window
- `reset_time`: When rate limit resets
- `conflicts`: Array of conflicting policy rules
- `resolution`: How conflicts are resolved
- `error_code`: Machine-readable error code
- `trace_id`: Request trace identifier

## Client Handling

Clients SHOULD:

1. Check the `type` field to determine error category
2. Use `status` for HTTP-level error handling
3. Display `title` and `detail` to users
4. Use extension fields for specific error handling
5. Respect `retry_after` for rate limiting
6. Log `trace_id` for debugging

## Security Considerations

- Do not expose internal system details in error messages
- Sanitize URLs and paths in error responses
- Rate limit error responses to prevent information leakage
- Use generic error messages for authentication failures
