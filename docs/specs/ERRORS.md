# PEAC Error Registry

Normative error codes for PEAC Protocol v0.9.

## Format

| Code | Category | Severity | Retryable | HTTP | Description | Remediation |
| ---- | -------- | -------- | --------- | ---- | ----------- | ----------- |

## Validation Errors (400)

| Code                      | Category   | Severity | Retryable | HTTP | Description                                                                 | Remediation                                                                          |
| ------------------------- | ---------- | -------- | --------- | ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `E_CONTROL_REQUIRED`      | validation | error    | false     | 400  | Control block required when payment present or enforcement.method==http-402 | Add control{} block to auth context                                                  |
| `E_INVALID_ENVELOPE`      | validation | error    | false     | 400  | Receipt envelope structure is invalid                                       | Ensure envelope has auth, evidence, and meta blocks                                  |
| `E_INVALID_CONTROL_CHAIN` | validation | error    | false     | 400  | Control chain is invalid or inconsistent                                    | Ensure chain is non-empty and decision matches chain results                         |
| `E_INVALID_PAYMENT`       | validation | error    | false     | 400  | Payment evidence is malformed or incomplete                                 | Verify payment has required fields (scheme, reference, amount, currency, asset, env) |
| `E_INVALID_POLICY_HASH`   | validation | error    | false     | 400  | Policy hash does not match policy content                                   | Recompute policy_hash as base64url(sha256(JCS(policy)))                              |
| `E_EXPIRED_RECEIPT`       | validation | error    | false     | 401  | Receipt exp claim is in the past                                            | Use a current receipt                                                                |

## Verification Errors (401)

| Code                  | Category     | Severity | Retryable | HTTP | Description                                            | Remediation                                                     |
| --------------------- | ------------ | -------- | --------- | ---- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `E_INVALID_SIGNATURE` | verification | error    | false     | 401  | JWS signature verification failed                      | Ensure receipt is signed with correct private key and alg=EdDSA |
| `E_SSRF_BLOCKED`      | verification | error    | false     | 403  | SSRF protection blocked request to private/metadata IP | Use only public HTTPS URLs for JWKS/policy endpoints            |
| `E_DPOP_REPLAY`       | verification | error    | false     | 403  | DPoP nonce has already been used                       | Generate a fresh DPoP proof with new nonce                      |
| `E_DPOP_INVALID`      | verification | error    | false     | 403  | DPoP proof is invalid or malformed                     | Ensure DPoP JWT has correct claims (jkt, iat, htm, htu)         |

## Control Errors (403)

| Code               | Category | Severity | Retryable | HTTP | Description             | Remediation                    |
| ------------------ | -------- | -------- | --------- | ---- | ----------------------- | ------------------------------ |
| `E_CONTROL_DENIED` | control  | error    | false     | 403  | Control decision denied | Check control chain for reason |

## Infrastructure Errors (429/502/503)

| Code                    | Category       | Severity | Retryable | HTTP | Description                            | Remediation                                       |
| ----------------------- | -------------- | -------- | --------- | ---- | -------------------------------------- | ------------------------------------------------- |
| `E_JWKS_FETCH_FAILED`   | infrastructure | error    | true      | 502  | Failed to fetch JWKS from issuer       | Retry after delay; check JWKS URL is accessible   |
| `E_POLICY_FETCH_FAILED` | infrastructure | error    | true      | 502  | Failed to fetch policy from policy_uri | Retry after delay; check policy URI is accessible |
| `E_NETWORK_ERROR`       | infrastructure | error    | true      | 502  | Generic network/transport failure      | Retry after delay                                 |
| `E_RATE_LIMITED`        | infrastructure | error    | true      | 429  | Rate limit exceeded                    | Retry after Retry-After header value              |

## HTTP Status Semantics (401 vs 403)

PEAC follows standard HTTP semantics for authentication and authorization errors:

| Status  | Meaning                              | When to Use                                                    | Client Action                      |
| ------- | ------------------------------------ | -------------------------------------------------------------- | ---------------------------------- |
| **401** | Unauthorized (missing/invalid creds) | Attestation missing, expired, not yet valid, signature invalid | Retry with valid attestation       |
| **403** | Forbidden (denied by policy)         | Authenticated but control decision was deny                    | Do not retry with same credentials |

**Key distinction:**

- **401**: "I don't know who you are" or "your credentials are invalid" - client CAN retry with different/renewed credentials
- **403**: "I know who you are, but you're not allowed" - retrying with same identity won't help

## Attestation Temporal Validity (401 Convention)

Attestations (agent identity, attribution, dispute) use **401** for temporal validity errors,
while receipts use **400**. This distinction reflects their different roles:

| Credential Type | Temporal Error                               | HTTP Status | Rationale                                                                  |
| --------------- | -------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| Receipt         | E_EXPIRED, E_NOT_YET_VALID                   | 400         | Receipts are data objects - temporal issues are validation failures        |
| Attestation     | `E_{TYPE}_EXPIRED`, `E_{TYPE}_NOT_YET_VALID` | 401         | Attestations are credentials - temporal issues are authentication failures |

**Affected error codes:**

- `E_IDENTITY_NOT_YET_VALID`, `E_IDENTITY_EXPIRED` (401)
- `E_ATTRIBUTION_NOT_YET_VALID`, `E_ATTRIBUTION_EXPIRED` (401)
- `E_DISPUTE_NOT_YET_VALID`, `E_DISPUTE_EXPIRED` (401)

This convention treats attestations as token-like credentials that authenticate the presenter.
An expired or not-yet-valid attestation is analogous to an expired OAuth token - an auth failure (401),
not a format error (400).

### WWW-Authenticate Header (RFC 9110 Requirement)

Per [RFC 9110 Section 15.5.2](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2), 401 responses
**MUST** include a `WWW-Authenticate` header with at least one authentication challenge.

PEAC defines the `PEAC-Attestation` authentication scheme for attestation-based authentication:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type="identity"
Content-Type: application/problem+json

{
  "type": "https://www.peacprotocol.org/errors#E_IDENTITY_EXPIRED",
  "title": "Identity Attestation Expired",
  "status": 401,
  "detail": "The agent identity attestation has expired.",
  "instance": "/api/resource/123"
}
```

### WWW-Authenticate Parameters

Parameters follow [RFC 9110 auth-param syntax](https://www.rfc-editor.org/rfc/rfc9110#section-11.2):
`parameter = token "=" ( token / quoted-string )`.

| Parameter           | Required | Type          | Values                               | Description                      |
| ------------------- | -------- | ------------- | ------------------------------------ | -------------------------------- |
| `realm`             | Yes      | quoted-string | `"peac"`                             | Fixed realm identifier           |
| `attestation_type`  | Yes      | token         | `identity`, `attribution`, `dispute` | Attestation type required/failed |
| `error`             | No       | token         | Error code (e.g., `expired`)         | Machine-readable error category  |
| `error_description` | No       | quoted-string | Human-readable message               | Explanation for debugging        |

**Example challenges:**

```http
# Missing agent identity attestation
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=identity

# Expired identity attestation
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=identity, error=expired, error_description="Attestation expired at 2026-01-06T12:00:00Z"

# Invalid signature on attribution attestation
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=attribution, error=invalid_signature

# Dispute attestation not yet valid
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=dispute, error=not_yet_valid
```

**Error tokens (for `error` parameter):**

| Token               | Meaning                         |
| ------------------- | ------------------------------- |
| `missing`           | No attestation provided         |
| `expired`           | Attestation `exp` in the past   |
| `not_yet_valid`     | Attestation `iat` in the future |
| `invalid_signature` | Signature verification failed   |
| `invalid_format`    | Malformed attestation structure |
| `key_unknown`       | Signing key not found           |
| `key_expired`       | Signing key expired             |
| `key_revoked`       | Signing key revoked             |

Implementations MUST include the `WWW-Authenticate` header when returning 401 for attestation errors.
Failure to include this header violates HTTP semantics and may cause interoperability issues.

See also: [Error Catalog](../api/error-catalog.md) for RFC 9457 response format.

## Error Response Format

All errors MUST be returned in this JSON structure:

```json
{
  "code": "E_CONTROL_REQUIRED",
  "category": "validation",
  "severity": "error",
  "retryable": false,
  "http_status": 400,
  "pointer": "/auth/control",
  "remediation": "Add control{} block when payment{} is present",
  "details": {
    "payment_present": true,
    "control_present": false
  }
}
```

### Fields

- **code** (string, required): Error code from registry
- **category** (string, required): `validation` | `verification` | `infrastructure` | `control` | `attribution` | `identity` | `dispute`
- **severity** (string, required): `error` | `warning`
- **retryable** (boolean, required): Whether client should retry
- **http_status** (number, optional): Suggested HTTP status code
- **pointer** (string, optional): RFC 6901 JSON Pointer to problematic field
- **remediation** (string, optional): Human-readable fix guidance
- **details** (object, optional): Implementation-specific error context

## Adding New Error Codes

To add a new error code:

1. Choose a unique code following pattern `E_{CATEGORY}_{SPECIFIC}`
2. Add to this registry table
3. Add to `packages/schema/src/errors.ts` ERROR_CODES constant
4. Add test vectors demonstrating the error
5. Document in relevant package README

## Version History

- **v0.9.15**: Initial error registry with structured error model
