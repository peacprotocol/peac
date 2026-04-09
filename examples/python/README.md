# Python API-First Examples

Consumer examples for the PEAC Hosted Verify API using Python and httpx.

These are **examples only, not an SDK**. Demo code, not production-hardened. They demonstrate how to call the Hosted Verify API from Python using standard HTTP.

## Requirements

- Python 3.12+ (tested on 3.13 and 3.14)
- httpx >= 0.27

## Setup

```bash
pip install httpx
```

## Verify a Receipt

```bash
# Start the Hosted Verify API locally
cd /path/to/peac && node apps/api/dist/index.js &

# Verify a receipt
python httpx_verify.py <compact-jws> [<base64url-public-key>]
```

### Example output

```
Verified: True
Issuer:   https://example.com
Ref:      sha256:abc123...
```

## API Reference

The Hosted Verify API accepts `POST /v1/verify` with:

```json
{
  "receipt": "<compact JWS>",
  "public_key": "<optional base64url Ed25519 public key>"
}
```

Returns a DD-210 verification report:

```json
{
  "verified": true,
  "receipt_ref": "sha256:...",
  "claims": {},
  "warnings": [],
  "policy_binding": "unavailable",
  "issuer": "https://example.com",
  "kid": "key-1",
  "wire_version": "0.2"
}
```

Errors use RFC 9457 Problem Details (`application/problem+json`).

See `apps/api/openapi.yaml` for the full OpenAPI 3.1 specification.
