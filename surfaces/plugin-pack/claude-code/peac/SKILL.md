# PEAC Receipt Operations

Work with PEAC Protocol receipts: cryptographically signed, offline-verifiable evidence of what happened during automated interactions.

Wire format: `peac-receipt/0.1` (frozen). Signing algorithm: Ed25519 (EdDSA). Each receipt is a compact JWS (JSON Web Signature).

## Verify a Receipt

1. Obtain the receipt JWS string and the issuer's public key (Ed25519, base64url or JWK).
2. Start the MCP server: `npx @peac/mcp-server`
3. Call `peac_verify` with `{ "jws": "<receipt_jws>", "publicKey": "<base64url_or_jwk>" }`.
4. The response includes `ok: true/false`, signature validity, claims summary, and verification checks.

If you only have the issuer URL (not the raw key), the server resolves the key via `/.well-known/peac-issuer.json` -> `jwks_uri` -> JWKS.

## Inspect a Receipt

Use `peac_inspect` for debugging without full verification:

- Input: `{ "jws": "<receipt_jws>" }`
- Returns: decoded header (`typ`, `alg`, `kid`), payload metadata (issuer, audience, amount, currency, rail, timestamps), and redaction status.
- Policy redaction: if the server has a bound policy, some fields may be redacted in the response.

## Decode a Receipt (Raw)

Use `peac_decode` for raw JWS structure without any verification:

- Input: `{ "jws": "<receipt_jws>" }`
- Returns: raw header and payload objects. Marked `verified: false`.

## Issue a Receipt

Issuing requires an Ed25519 private key. Start the server with a key:

```bash
npx @peac/mcp-server --issuer-key env:PEAC_ISSUER_KEY --issuer-id https://your-service.example.com
```

Call `peac_issue` with receipt parameters:

```json
{
  "iss": "https://your-service.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/payment",
  "pillars": ["commerce"],
  "extensions": {
    "org.peacprotocol/commerce": {
      "payment_rail": "stripe",
      "amount_minor": "10000",
      "currency": "USD",
      "reference": "pi_abc123"
    }
  }
}
```

The response includes the signed JWS and a claims summary.

## Create an Evidence Bundle

Use `peac_create_bundle` to create a portable evidence bundle directory:

- Input: `{ "receipts": ["<jws1>", "<jws2>"], "bundleDir": "/path/to/output" }`
- Creates a timestamped directory with receipts, metadata, and a manifest.
- Bundle format: `peac-bundle/0.1`.

## Programmatic Usage (TypeScript/JavaScript)

Import patterns by layer:

```typescript
// Types and constants (Layer 0, zero runtime)
import { WIRE_TYPE, HEADERS, type PeacEvidenceCarrier, type CarrierAdapter } from '@peac/kernel';

// Validation schemas (Layer 1)
import {
  computeReceiptRef,
  validateCarrierConstraints,
  assertJsonSafeIterative,
} from '@peac/schema';

// Signing and verification (Layer 2)
import { sign, verify, base64urlEncode, base64urlDecode, sha256Hex } from '@peac/crypto';

// High-level APIs (Layer 3)
import { issue, verifyLocal, type IssueOptions, type VerifyLocalResult } from '@peac/protocol';
```

## Rules

- Never log or store raw JWS strings in plaintext outside of secure storage.
- Always verify a receipt before trusting its claims. Use `verifyLocal()` or `peac_verify`.
- Use `receipt_ref` (content-addressed `sha256:<hex64>`) for references, not raw JWS.
- Evidence must pass `assertJsonSafeIterative()` before signing.
- The wire format `peac-receipt/0.1` is frozen. Do not modify header fields (`typ: PEAC/0.1`, `alg: EdDSA`).
- PEAC records evidence; it does not enforce behavior or orchestrate protocols.

## References

- GitHub: https://github.com/peacprotocol/peac
- Website: https://www.peacprotocol.org
- MCP Server: `@peac/mcp-server` on npm
- llms.txt: https://www.peacprotocol.org/llms.txt

allowed-tools: ["Bash", "Read"]
