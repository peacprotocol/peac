# @peac/mappings-ucp

Universal Commerce Protocol (UCP) mapping to PEAC receipts and dispute evidence.

## Features

- **Webhook signature verification** - Detached JWS (RFC 7797) with ES256/ES384/ES512
- **Raw-first, JCS fallback** - Handles UCP's ambiguous canonicalization spec
- **UCP order to PEAC receipt mapping** - Amounts in minor units (cents)
- **Dispute evidence generation** - Hardened YAML schema for @peac/audit bundles

## Installation

```bash
pnpm add @peac/mappings-ucp
```

## Usage

### Verify Webhook Signature

```typescript
import { verifyUcpWebhookSignature } from '@peac/mappings-ucp';

const result = await verifyUcpWebhookSignature({
  signature_header: req.headers['request-signature'],
  body_bytes: rawBody, // Uint8Array
  profile_url: 'https://business.example.com/.well-known/ucp',
});

if (result.valid) {
  console.log(`Verified using ${result.mode_used} mode`);
  console.log(`Key: ${result.key?.kid}`);
} else {
  console.error(`Verification failed: ${result.error_code}`);
  console.log('Attempts:', result.attempts);
}
```

### Map UCP Order to PEAC Receipt

```typescript
import { mapUcpOrderToReceipt } from '@peac/mappings-ucp';
import { issue } from '@peac/protocol';

const claims = mapUcpOrderToReceipt({
  order: webhookBody.order,
  issuer: 'https://platform.example.com',
  subject: 'buyer:123',
  currency: 'USD',
});

// Sign with @peac/protocol
const receipt = await issue(claims, privateKey, kid);
```

### Create Dispute Evidence

```typescript
import { createUcpDisputeEvidence } from '@peac/mappings-ucp';
import { createDisputeBundle } from '@peac/audit';

// Create evidence from webhook
const evidence = await createUcpDisputeEvidence({
  signature_header: req.headers['request-signature'],
  body_bytes: rawBody,
  method: 'POST',
  path: '/webhooks/ucp/orders',
  received_at: new Date().toISOString(),
  profile_url: 'https://business.example.com/.well-known/ucp',
  profile_fetched_at: new Date().toISOString(),
});

// Create dispute bundle with evidence
const bundle = await createDisputeBundle({
  dispute_ref: 'dispute_123',
  created_by: 'platform:example.com',
  receipts: [receiptJws],
  keys: jwks,
  policy: evidence.evidence_yaml, // UCP evidence stored here
});
```

## Verification Strategy

UCP's webhook spec says "detached JWT over the request body" but doesn't specify canonicalization (unlike AP2 which requires JCS). This package uses:

1. **Try raw body bytes first** - Most likely what implementers expect
2. **Fallback to JCS-canonicalized body** - If raw fails and body is valid JSON
3. **Record all attempts** - For debugging and dispute evidence

Both b64=true (standard) and b64=false (RFC 7797 unencoded payload) are supported.

## Security and Correctness Notes

This verifier implements strict JOSE semantics for audit-grade correctness:

- **RFC 7797 b64=false**: Unencoded payloads are passed as raw bytes to the verification library (not ASCII-decoded strings). This ensures binary payloads and UTF-8 content verify correctly.
- **JOSE crit semantics**: If the `crit` header is present, ALL entries must be understood by this implementation. Unknown critical parameters cause immediate rejection with a clear error.
- **Strict header typing**: `crit` must be an array of strings (no objects, numbers, or duplicates). `b64` must be a boolean (not string `"false"` or number `0`).
- **Single profile fetch**: The verifier returns both the parsed profile and raw JSON, eliminating race conditions and enabling deterministic evidence hashing.
- **Deterministic evidence**: YAML output uses UTF-8 encoding, LF line endings, and exactly one trailing newline for byte-stable hashing across platforms.
- **JWS signature format**: Demo/test code uses IEEE P1363 ECDSA signatures (raw R||S) as required by JWS, not DER encoding.

The verification result includes `profile` and `profile_raw` fields, allowing callers to capture evidence without re-fetching.

## Evidence Schema

The evidence YAML uses a hardened schema that cannot be misinterpreted as executable policy:

```yaml
peac_bundle_metadata_version: 'org.peacprotocol.ucp/0.1'
kind: 'evidence_attachment'
scope: 'ucp_webhook'

request:
  method: 'POST'
  path: '/webhooks/ucp/orders'
  received_at: '2026-01-13T12:00:00Z'

payload:
  raw_sha256_hex: 'abc123...'
  raw_bytes_b64url: 'eyJ...' # Optional, for bodies <= 256KB
  jcs_sha256_hex: 'def456...' # If JSON parseable
  json_parseable: true

signature:
  header_value: 'eyJhbGc...' # Full Request-Signature header
  kid: 'business-key-001'
  alg: 'ES256'
  b64: null
  verified: true
  verification_mode_used: 'raw'
  verification_attempts:
    - mode: 'raw'
      success: true

profile:
  url: 'https://business.example.com/.well-known/ucp'
  fetched_at: '2026-01-13T11:59:30Z'
  profile_jcs_sha256_hex: 'ghi789...'
  key_jwk:
    kty: 'EC'
    crv: 'P-256'
    kid: 'business-key-001'
    x: '...'
    y: '...'
```

## Error Codes

| Code                                  | HTTP | Description                      |
| ------------------------------------- | ---- | -------------------------------- |
| E_UCP_SIGNATURE_MISSING               | 400  | Request-Signature header missing |
| E_UCP_SIGNATURE_MALFORMED             | 400  | Invalid detached JWS format      |
| E_UCP_SIGNATURE_ALGORITHM_UNSUPPORTED | 400  | Algorithm not ES256/ES384/ES512  |
| E_UCP_KEY_NOT_FOUND                   | 401  | Key ID not in profile            |
| E_UCP_SIGNATURE_INVALID               | 401  | Signature verification failed    |
| E_UCP_PROFILE_FETCH_FAILED            | 502  | Failed to fetch UCP profile      |

## License

Apache-2.0

---

Part of the [PEAC Protocol](https://peacprotocol.org) - Portable Evidence for Automated Commerce.
