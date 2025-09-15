# Receipt Claims Specification

## Receipt Format

PEAC receipts are Ed25519-signed JWS tokens in detached format following RFC 7797.

### Structure

```
{payload-base64url}..{signature-base64url}
```

The protected header is embedded in the signature but not transmitted separately.

## Required Claims

### Core Claims

- **`iss`** (Issuer): URL of the issuing authority
- **`sub`** (Subject): Resource URL being accessed
- **`aud`** (Audience): Canonical resource URL (after normalization)
- **`iat`** (Issued At): Unix timestamp when receipt was issued
- **`exp`** (Expires): Unix timestamp when receipt expires
- **`rid`** (Receipt ID): Unique receipt identifier (MUST be UUIDv7)
- **`policy_hash`**: Deterministic hash of the policy state (base64url)

### Example

```json
{
  "iss": "https://peac-authority.example.com",
  "sub": "https://example.com/content",
  "aud": "https://example.com/content",
  "iat": 1704067200,
  "exp": 1704067500,
  "rid": "01HVQK7Z8TD6QTGNT4ANPK7XXQ",
  "policy_hash": "YkNBV_ZjNGVhNGU4ZTIxMzlkZjcyYWQ3NDJjOGY0YTM4"
}
```

## Conditional Claims

### Payment Context

When payment is involved:

- **`purpose`**: Intended use of the resource (e.g., "training", "inference")
- **`payment`**: Payment details object

```json
{
  "purpose": "training",
  "payment": {
    "rail": "x402",
    "reference": "tx_abc123",
    "amount": "0.01",
    "currency": "USD",
    "settled_at": 1704067180,
    "idempotency": "idem_xyz789"
  }
}
```

### Context Information

- **`amount`**: Payment amount (string, decimal)
- **`currency`**: Payment currency (ISO 4217 code)
- **`trace_id`**: W3C trace ID for observability
- **`compliance`**: Regulatory compliance metadata

## Optional Claims

### Extended Information

- **`dpop_jkt`**: DPoP JWK thumbprint for binding
- **`ext`**: Extension object for future use
- **`x-*`**: Custom claims (parsers MUST ignore unknown fields)

## Constraints and Validation

### Temporal Constraints

- **Clock Skew Tolerance**: Accept `iat` within ±60 seconds
- **Expiration Window**: `exp` MUST be ≤ `iat` + 300 seconds (5 minutes)
- **Receipt ID Uniqueness**: `rid` MUST be unique per `iss` for the `exp` window

### Receipt ID (rid) Requirements

- **Format**: MUST be UUIDv7 per RFC 9562
- **Monotonicity**: UUIDv7 provides millisecond timestamp ordering
- **Uniqueness**: MUST be unique within the issuer's namespace
- **Cache Duration**: Replay protection cache MUST maintain `rid` until `exp`

### UUIDv7 Format

```
01HVQK7Z8T-D6QT-7GNT-8ANP-K7XXQD6QT89
xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
```

- First 48 bits: Unix timestamp in milliseconds
- Version nibble: 7
- 12 random bits
- Variant bits: 10
- 62 random bits

### Audience Canonicalization

The `aud` claim MUST contain the canonical form of the resource URL:

1. Apply URL normalization rules (see policy-hash.md)
2. Scheme and host to lowercase
3. Remove default ports
4. Resolve dot segments
5. Decode unreserved percent-encodings
6. Preserve trailing slashes

### Examples

```json
// Original URL
"sub": "https://Example.com:443/Path/../Content"

// Canonical audience
"aud": "https://example.com/Content"
```

## Security Considerations

### Replay Protection

- Implement nonce cache with TTL matching receipt expiration
- Reject receipts with duplicate `rid` values
- Cache SHOULD be shared across service instances

### Key Management

- Use Ed25519 keys with rotating `kid` format: `YYYY-MM-DD/nn`
- Publish public keys via `/.well-known/jwks.json`
- Support key rotation with grace periods

### Validation Requirements

- MUST verify signature against known public keys
- MUST check receipt expiration
- MUST validate audience match for resource access
- MUST prevent replay attacks
- SHOULD validate issuer authorization

## JSON Number Format

Numeric values MUST use the shortest round-trip representation:

- No exponential notation
- No trailing zeros after decimal point
- No unnecessary precision
- NaN and Infinity are forbidden

### Examples

```json
// Correct
"amount": "1.5"
"timestamp": 1704067200

// Incorrect
"amount": "1.50"
"timestamp": 1.704067200e9
```

## Policy Hash Binding

The `policy_hash` claim binds the receipt to the specific policy state that authorized the access:

- MUST be computed using the canonical policy hash algorithm
- MUST include all policy sources discovered during evaluation
- MUST be deterministic and reproducible
- Verification SHOULD recompute and compare hash values

## Implementation Notes

- Receipts MUST be transmitted in the `PEAC-Receipt` header
- Parsers MUST ignore unknown claims for forward compatibility
- Implementations SHOULD validate against JSON Schema
- Clock synchronization is critical for temporal validation
