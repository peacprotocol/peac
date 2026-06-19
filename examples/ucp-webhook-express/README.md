# UCP Webhook Express Example

This example demonstrates how to receive and verify Universal Commerce Protocol (UCP) order webhooks using Express.js, then issue a PEAC receipt for the observed order.

It verifies the current UCP signing model: RFC 9421 HTTP Message Signatures (`Signature-Input` / `Signature`) with an RFC 9530 `Content-Digest` over the raw request body bytes.

## Features

- RFC 9421 HTTP Message Signature verification (`verifyUcpHttpSignature`)
- RFC 9530 `Content-Digest` binding over the raw request body bytes
- Signed `UCP-Agent` profile binding (the verifier returns the bound `signer_profile_url`)
- UCP order to PEAC receipt mapping and signed receipt issuance

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the server
pnpm run start

# In another terminal, run the demo
pnpm run demo
```

## How It Works

1. **Webhook Reception**: The server receives POST requests at `/webhooks/ucp/orders` carrying RFC 9421 `Signature-Input` and `Signature` headers, an RFC 9530 `Content-Digest`, and a `UCP-Agent` profile.

2. **Signature Verification**: The `@peac/mappings-ucp` package verifies the request with `verifyUcpHttpSignature`:
   - Resolves the signing key by `keyid` against the supplied `/.well-known/ucp` profile
   - Derives the algorithm from the key curve (ES256 for P-256, ES384 for P-384); UCP does not put `alg` in `Signature-Input`
   - Verifies the `Content-Digest` over the raw body bytes (no JSON canonicalization)
   - Enforces the required signed-component set and, via `expected_profile_url`, binds the signed `UCP-Agent` profile to the expected signer (`SIGNER_PROFILE_URL`)

3. **Receipt Mapping**: UCP order data is mapped to PEAC receipt claims:
   - Amounts in minor units (cents)
   - Extensions use `dev.ucp/*` namespace
   - Order status derived from line item fulfillment

4. **Receipt Issuance**: The example verifies the UCP signature, maps the observed order, and issues a PEAC receipt for that observation. It rejects failed signatures before mapping. PEAC does not authenticate, authorize, settle, or execute the order.

The demo also sends a tampered body with the original signature to show that the `Content-Digest` binding rejects it.

## Two URLs in this example

- `PUBLIC_URL` (default `https://platform.example.com`) is the **receiver** endpoint. UCP signs the `@authority` and `@path` derived components over this canonical public request URL, so the demo signs and verifies against it even though the local server listens on `http://localhost`. In production, derive the public URL from your deployment configuration (for example, behind a TLS-terminating proxy), never from caller-controlled `Host` headers.
- `SIGNER_PROFILE_URL` (default `https://demo.business.example.com/.well-known/ucp`) is the **signer** identity profile carried in the signed `UCP-Agent` header. The server passes it as `expected_profile_url` so the verifier binds the signature to that known signer.

## API Endpoints

### POST /webhooks/ucp/orders

Receives UCP order webhooks.

**Headers:**

- `Content-Type: application/json`
- `Content-Digest: sha-256=:<base64>:`
- `Idempotency-Key: <key>`
- `UCP-Agent: profile="https://.../.well-known/ucp"`
- `Signature-Input: sig1=("@method" "@authority" "@path" "content-digest" "content-type" "idempotency-key" "ucp-agent");keyid="<kid>"`
- `Signature: sig1=:<base64>:`

**Response (success):**

```json
{
  "status": "processed",
  "receipt_id": "rcpt_...",
  "receipt_jws": "eyJ...",
  "event_type": "order.created",
  "order_id": "order_..."
}
```

### GET /health

Health check endpoint.

### GET /.well-known/ucp

Mock UCP profile (for demo purposes).

## Legacy compatibility (deprecated)

Earlier UCP integrations used a `Request-Signature` detached JWS (RFC 7797). That path remains available in `@peac/mappings-ucp` as `verifyUcpWebhookSignature` (with the dispute-evidence helper `createUcpDisputeEvidence`) for backward compatibility and is deprecated; new integrations should use `verifyUcpHttpSignature`. There is no silent fallback between the two schemes.

## Production Considerations

1. **Key Management**: Load signing keys from secure storage (HSM, KMS, etc.)
2. **Profile Fetching**: Fetch and cache business UCP profiles with TTL over an SSRF-safe, host-allowlisted path; pass the resolved profile to the verifier (it performs no network I/O)
3. **Rate Limiting**: Add rate limiting for webhook endpoints
4. **Idempotency**: Track processed webhooks to prevent duplicates

## Related Packages

- `@peac/mappings-ucp` - UCP to PEAC mapping and signature verification
- `@peac/crypto` - Demo key generation and JWS receipt signing
- `@peac/http-signatures` - RFC 9421 signature-base construction (demo signer)
- `@peac/audit` - Dispute bundle creation (legacy compatibility path)
