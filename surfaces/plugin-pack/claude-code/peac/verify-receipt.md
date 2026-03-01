# Verify PEAC Receipt

Verify the cryptographic signature and structural validity of a PEAC receipt.

## Steps

1. Obtain the receipt JWS string (compact serialization, three dot-separated parts).
2. Obtain the verification key:
   - If you have the raw public key: provide as base64url-encoded Ed25519 key
   - If you have the issuer URL: the server resolves via `/.well-known/peac-issuer.json` -> `jwks_uri` -> JWKS

### Via MCP Server

```bash
npx @peac/mcp-server
```

Call `peac_verify`:

```json
{
  "jws": "<receipt_jws>",
  "publicKey": "<base64url_ed25519_public_key>"
}
```

### Via TypeScript

```typescript
import { generateKeypair } from '@peac/crypto';
import { verifyLocal } from '@peac/protocol';

const result = await verifyLocal(jws, publicKey);

if (result.valid) {
  console.log('Issuer:', result.claims.iss);
  console.log('Audience:', result.claims.aud);
  console.log('Variant:', result.variant);
} else {
  console.log('Error:', result.code, result.message);
}
```

## Verification Checks

- Signature validity (EdDSA / Ed25519)
- Wire format type (`peac-receipt/0.1`)
- Schema validation (required claims)
- Temporal validity (`iat`, optional `exp`)
- Kernel constraints (DD-60, DD-121)

## Result

`verifyLocal()` returns a discriminated union:

- `{ valid: true, variant, claims, kid, policy_binding }` on success
- `{ valid: false, code, message, details? }` on failure

## Rules

- Always verify before trusting claims
- Use `receipt_ref` (`sha256:<hex64>`) for references, not raw JWS
- Wire format `peac-receipt/0.1` is frozen

allowed-tools: ["Bash", "Read"]
