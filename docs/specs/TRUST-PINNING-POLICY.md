# PEAC Verifier Trust Pinning Policy (NORMATIVE)

Status: NORMATIVE
Policy-Version: peac-verifier-policy/0.1
Last-Updated: 2026-02-05

This document specifies how verifiers decide whether an issuer is acceptable beyond cryptographic validity. A valid signature does not imply a trusted issuer. Trust is explicit and policy-driven.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## 2. Design goals

A verifier policy MUST:
- Make trust decisions explicit and auditable
- Be safe by default (SSRF-safe, bounded)
- Support offline verification
- Support enterprise allowlisting and key pinning
- Avoid centralized registries as a prerequisite for adoption

## 3. Trust model

### 3.1 What cryptographic verification proves

A valid PEAC signature proves:
- The receipt was signed by a key with the declared `kid`
- The receipt has not been modified since signing
- The issuer controlled the private key at signing time

### 3.2 What cryptographic verification does NOT prove

A valid signature does NOT prove:
- The issuer is legitimate
- The issuer is who they claim to be
- The receipt contents are true
- The issuer is authorized to issue receipts

### 3.3 Trust is out-of-band

By default, trust in an issuer comes from:
- Existing business relationship
- DNS ownership (issuer URL matches known domain)
- Explicit allowlist configuration
- Key pinning by the verifier

## 4. Policy object

A verifier policy is a JSON object.

### 4.1 Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `policy_version` | string | REQUIRED | Must be `peac-verifier-policy/0.1` |
| `mode` | string | REQUIRED | Verification mode |
| `issuer_allowlist` | array | OPTIONAL | Allowed issuer origins |
| `pinned_keys` | array | OPTIONAL | Pinned key fingerprints |
| `network` | object | REQUIRED | Network security settings |
| `limits` | object | REQUIRED | Resource limits |

### 4.2 Minimal policy example

```json
{
  "policy_version": "peac-verifier-policy/0.1",
  "mode": "network_allowed",
  "network": {
    "https_only": true,
    "block_private_ips": true,
    "allow_redirects": false
  },
  "limits": {
    "max_receipt_bytes": 262144,
    "max_jwks_bytes": 65536,
    "max_jwks_keys": 20,
    "max_redirects": 3,
    "fetch_timeout_ms": 5000,
    "max_extension_bytes": 65536
  }
}
```

## 5. Verification modes

### 5.1 `offline_only`

- No network fetches permitted
- Key material MUST be provided locally (bundle, cache, pins)
- If required key unavailable, fail with `key_not_found`

Use cases:
- Dispute resolution
- Air-gapped environments
- Deterministic verification

### 5.2 `offline_preferred`

- Try local keys first
- Fall back to network fetch if permitted by `network` settings
- If network blocked by policy, fail with `key_fetch_blocked`

Use cases:
- Normal operation with caching
- Graceful degradation

### 5.3 `network_allowed`

- Network fetches permitted under `network` and `limits`
- Still SSRF-safe and bounded

Use cases:
- First-time verification
- Unknown issuers

## 6. Issuer allowlisting

### 6.1 Purpose

Restrict which issuers are trusted for verification.

### 6.2 Format

Allowlist entries are **issuer origins** (scheme + host + optional port), NOT host-only:

```json
{
  "issuer_allowlist": [
    "https://api.example.com",
    "https://billing.example.net",
    "https://api.example.com:8443",
    "https://*.trusted-partner.com"
  ]
}
```

### 6.3 Matching rules

- Entries MUST be full origins: `https://host[:port]`
- Scheme MUST be `https` (no http allowed)
- Port is optional; if omitted, defaults to 443
- Wildcards MAY be used for subdomains only: `https://*.example.com`
- Exact match takes precedence over wildcard
- Path components MUST NOT be included (origins only)

### 6.4 Behavior

If `issuer_allowlist` is present and non-empty:
- Receipt issuer MUST match an entry
- If no match, verification fails with `issuer_not_allowed`

If `issuer_allowlist` is absent or empty:
- All issuers are potentially accepted
- Other policy checks still apply

## 7. Key pinning

### 7.1 Purpose

Accept only specific keys for specific issuers.

### 7.2 Pin format

```json
{
  "pinned_keys": [
    {
      "issuer": "https://api.example.com",
      "kid": "prod-2026-02",
      "jwk_thumbprint_sha256": "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
    },
    {
      "issuer": "https://api.example.com",
      "jwk_thumbprint_sha256": "0voeli3RBTBxE-8otNcVKPJIedWRPz2E_mfcwUqzIoY"
    }
  ]
}
```

### 7.3 Pin fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issuer` | string | REQUIRED | Issuer origin (`https://host[:port]`) |
| `kid` | string | OPTIONAL | Specific key ID |
| `jwk_thumbprint_sha256` | string | REQUIRED | RFC 7638 JWK thumbprint, base64url (no padding) |

### 7.4 Thumbprint calculation (RFC 7638)

The thumbprint MUST be computed exactly per RFC 7638:

1. Select required members based on `kty`:
   - For `OKP` (Ed25519): `crv`, `kty`, `x`
   - For `EC` (ES256): `crv`, `kty`, `x`, `y`
   - For `RSA`: `e`, `kty`, `n`
2. Create JSON object with members in **lexicographic order**, no whitespace
3. Compute SHA-256 digest
4. Encode as **base64url without padding** (43 characters for SHA-256)

**IMPORTANT**: Use an RFC 7638 library. Do NOT hand-roll thumbprint computation.

```javascript
// Use a standard library - example with jose
import { calculateJwkThumbprint } from 'jose';

const thumbprint = await calculateJwkThumbprint(jwk, 'sha256');
// Returns base64url string like "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
```

```go
// Go example
import "github.com/lestrrat-go/jwx/v2/jwk"

thumbprint, _ := jwk.Thumbprint(key, crypto.SHA256)
// Returns base64url string
```

**Common mistake**: Encoding as lowercase hex instead of base64url. This will cause silent trust-policy mismatches with other implementations.

### 7.5 Matching behavior

When verifying a receipt from issuer X:
1. Find all pins for issuer X
2. If pins exist for X:
   - Receipt's signing key MUST match at least one pin
   - If `kid` specified in pin, must also match
   - If no match, fail with `policy_violation`
3. If no pins for X:
   - Key discovery proceeds normally

## 8. Network policy

### 8.1 Required settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `https_only` | boolean | true | Reject non-HTTPS |
| `block_private_ips` | boolean | true | Block private ranges |
| `allow_redirects` | boolean | false | Allow HTTP redirects |

### 8.2 SSRF protections

When `block_private_ips` is true, block:
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `127.0.0.0/8`
- `169.254.0.0/16`
- `::1`, `fe80::/10`
- `fc00::/7`

### 8.3 Redirect handling

When `allow_redirects` is true:
- Limit to `limits.max_redirects`
- Same-origin redirects only (RECOMMENDED)
- Never downgrade HTTPS to HTTP

## 9. Limits

### 9.1 Required limits

| Limit | Type | Default | Description |
|-------|------|---------|-------------|
| `max_receipt_bytes` | integer | 262144 | Max receipt size |
| `max_jwks_bytes` | integer | 65536 | Max JWKS response |
| `max_jwks_keys` | integer | 20 | Max keys in JWKS |
| `max_redirects` | integer | 3 | Max HTTP redirects |
| `fetch_timeout_ms` | integer | 5000 | Fetch timeout |
| `max_extension_bytes` | integer | 65536 | Max extension data |

### 9.2 Fail-closed

If any limit is exceeded, verification MUST fail.

## 10. Offline key sources

In offline modes, verifiers MAY use:

### 10.1 Bundle-included keys

Dispute bundles MUST include issuer JWKS for contained receipts.

### 10.2 Local key cache

Verifiers MAY cache JWKS from previous fetches:
- Cache keyed by issuer origin
- Respect HTTP cache headers
- Invalidate on rotation signals

### 10.3 Policy packs

Enterprises MAY distribute "policy packs" containing:
- Verifier policy JSON
- Pinned keys for approved issuers
- Optional JWKS snapshots

Policy packs SHOULD be signed by the enterprise.

## 11. Policy examples

### 11.1 Strict enterprise policy

```json
{
  "policy_version": "peac-verifier-policy/0.1",
  "mode": "offline_only",
  "issuer_allowlist": [
    "https://api.internal.example.com",
    "https://billing.example.com"
  ],
  "pinned_keys": [
    {
      "issuer": "https://api.internal.example.com",
      "kid": "prod-2026-02",
      "jwk_thumbprint_sha256": "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
    },
    {
      "issuer": "https://billing.example.com",
      "kid": "prod-2026-01",
      "jwk_thumbprint_sha256": "0voeli3RBTBxE-8otNcVKPJIedWRPz2E_mfcwUqzIoY"
    }
  ],
  "network": {
    "https_only": true,
    "block_private_ips": true,
    "allow_redirects": false
  },
  "limits": {
    "max_receipt_bytes": 262144,
    "max_jwks_bytes": 65536,
    "max_jwks_keys": 20,
    "max_redirects": 0,
    "fetch_timeout_ms": 0,
    "max_extension_bytes": 65536
  }
}
```

### 11.2 Open verification policy

```json
{
  "policy_version": "peac-verifier-policy/0.1",
  "mode": "network_allowed",
  "network": {
    "https_only": true,
    "block_private_ips": true,
    "allow_redirects": true
  },
  "limits": {
    "max_receipt_bytes": 262144,
    "max_jwks_bytes": 65536,
    "max_jwks_keys": 20,
    "max_redirects": 3,
    "fetch_timeout_ms": 5000,
    "max_extension_bytes": 65536
  }
}
```

## 12. UI messaging

Verifiers SHOULD display clear trust indicators:

| Scenario | Message |
|----------|---------|
| Valid + pinned | "Verified (pinned issuer)" |
| Valid + allowlisted | "Verified (allowed issuer)" |
| Valid + unknown | "Signature valid (issuer not verified)" |
| Invalid | "Verification failed: [reason]" |

## 13. Security considerations

### 13.1 Pin rotation

When issuers rotate keys:
- Update pins before old key is removed
- Maintain overlap period in pins
- Test verification before removing old pins

### 13.2 Compromised pins

If a pinned key is compromised:
- Remove pin immediately
- Add new pin for replacement key
- Old receipts become unverifiable (correct behavior)

### 13.3 Allowlist vs pins

| Approach | Trust Level | Operational Burden |
|----------|-------------|-------------------|
| Allowlist only | Medium (DNS trust) | Low |
| Pins only | High (explicit keys) | High |
| Both | Highest | Medium |
