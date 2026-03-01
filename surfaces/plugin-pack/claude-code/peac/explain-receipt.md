# Explain PEAC Receipt

Decode and explain the structure and claims of a PEAC receipt without full signature verification.

## Steps

1. Obtain the receipt JWS string.
2. Use `peac_inspect` (MCP) or `decode()` (TypeScript) to parse the JWS structure.

### Via MCP Server

```bash
npx @peac/mcp-server
```

Call `peac_inspect`:

```json
{
  "jws": "<receipt_jws>"
}
```

### Via TypeScript

```typescript
import { decode } from '@peac/crypto';

const { header, payload } = decode(jws);

console.log('Type:', header.typ);       // peac-receipt/0.1
console.log('Algorithm:', header.alg);  // EdDSA
console.log('Key ID:', header.kid);
console.log('Issuer:', payload.iss);
console.log('Audience:', payload.aud);
console.log('Issued at:', new Date(payload.iat * 1000).toISOString());
```

## Receipt Structure

### Header (JOSE)

| Field | Value | Description |
|-------|-------|-------------|
| `typ` | `peac-receipt/0.1` | Wire format version (frozen) |
| `alg` | `EdDSA` | Signature algorithm (Ed25519 only) |
| `kid` | `<key-id>` | Issuer key identifier |

### Payload (Claims)

| Field | Description |
|-------|-------------|
| `iss` | Issuer URL (HTTPS) |
| `aud` | Audience URL (resource owner) |
| `iat` | Issued-at timestamp (Unix seconds) |
| `rid` | Receipt identifier (unique per issuer) |
| `payment` | Payment evidence block (rail, reference, amount, currency) |
| `ext` | Extensions (reverse-DNS keys) |

### Commerce vs Attestation

- **Commerce receipts:** Include `payment` block with `rail`, `reference`, `amount`, `currency`
- **Attestation receipts:** Include `attestation` block with `type` and evidence

## Rules

- `decode()` does NOT verify the signature; use `verifyLocal()` for trusted claims
- Never display raw JWS strings in user-facing output
- Wire format is frozen; do not modify header fields

allowed-tools: ["Bash", "Read"]
