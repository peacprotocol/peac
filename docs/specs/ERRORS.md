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

## Security Errors (401/403)

| Code                  | Category      | Severity | Retryable | HTTP | Description                                            | Remediation                                                     |
| --------------------- | ------------- | -------- | --------- | ---- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `E_INVALID_SIGNATURE` | security      | error    | false     | 401  | JWS signature verification failed                      | Ensure receipt is signed with correct private key and alg=EdDSA |
| `E_SSRF_BLOCKED`      | security      | error    | false     | 403  | SSRF protection blocked request to private/metadata IP | Use only public HTTPS URLs for JWKS/policy endpoints            |
| `E_DPOP_REPLAY`       | security      | error    | false     | 403  | DPoP nonce has already been used                       | Generate a fresh DPoP proof with new nonce                      |
| `E_DPOP_INVALID`      | security      | error    | false     | 403  | DPoP proof is invalid or malformed                     | Ensure DPoP JWT has correct claims (jkt, iat, htm, htu)         |
| `E_CONTROL_DENIED`    | authorization | error    | false     | 403  | Control decision was deny                              | Check control chain for denial reason                           |

## Network Errors (502/503)

| Code                    | Category | Severity | Retryable | HTTP | Description                            | Remediation                                       |
| ----------------------- | -------- | -------- | --------- | ---- | -------------------------------------- | ------------------------------------------------- |
| `E_JWKS_FETCH_FAILED`   | network  | error    | true      | 502  | Failed to fetch JWKS from issuer       | Retry after delay; check JWKS URL is accessible   |
| `E_POLICY_FETCH_FAILED` | network  | error    | true      | 502  | Failed to fetch policy from policy_uri | Retry after delay; check policy URI is accessible |
| `E_NETWORK_ERROR`       | network  | error    | true      | 502  | Generic network/transport failure      | Retry after delay                                 |

## Rate Limit Errors (429)

| Code           | Category   | Severity | Retryable | HTTP | Description         | Remediation                          |
| -------------- | ---------- | -------- | --------- | ---- | ------------------- | ------------------------------------ |
| `E_RATE_LIMIT` | rate_limit | error    | true      | 429  | Rate limit exceeded | Retry after Retry-After header value |

## Internal Errors (500)

| Code               | Category | Severity | Retryable | HTTP | Description           | Remediation            |
| ------------------ | -------- | -------- | --------- | ---- | --------------------- | ---------------------- |
| `E_INTERNAL_ERROR` | internal | error    | false     | 500  | Internal server error | Contact issuer support |

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
- **category** (string, required): `validation` | `security` | `network` | `authorization` | `rate_limit` | `internal`
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
