# Security FAQ

## What cryptographic algorithm does PEAC use?

PEAC uses Ed25519 (RFC 8032) for signing receipts. Keys are 32 bytes. Signatures are deterministic and 64 bytes.

## How are receipts verified?

Receipts are JWS compact serialization tokens. Verification involves:

1. Decoding the JWS header and payload
2. Validating structural kernel constraints (depth, size limits)
3. Parsing the claims against the PEAC schema
4. Verifying the Ed25519 signature against the issuer's public key (via JWKS)
5. Checking temporal validity (iat, exp with clock skew tolerance)
6. Binding checks (issuer, audience, subject if applicable)

## What prevents replay attacks?

Each receipt contains a unique `rid` (receipt ID, UUIDv7) and `iat` (issued-at timestamp). Verifiers can check `rid` for uniqueness and `iat`/`exp` for temporal validity.

## What about key rotation?

Issuers publish their public keys via JWKS (JSON Web Key Set). Each receipt includes a `kid` (key ID) in the JWS header. Issuers can rotate keys by adding new entries to their JWKS and eventually removing old ones.

## What structural limits are enforced?

Kernel constraints prevent denial-of-service via bloated payloads:

| Constraint         | Limit             |
| ------------------ | ----------------- |
| JSON nesting depth | 32 levels         |
| Array length       | 10,000 elements   |
| Object keys        | 1,000 per object  |
| String length      | 65,536 code units |
| Total nodes        | 100,000           |

## Is TLS required?

Issuer URLs must use HTTPS. TLS for the MCP server is recommended but not enforced in code (deployers typically use reverse proxies).

## How does PEAC handle privacy?

PEAC receipts contain only the claims needed for the specific use case. No personal data is required in the protocol. Extensions can add privacy-preserving claims (purpose declaration, consent). See the Privacy Profile specification for details.
