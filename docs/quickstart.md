# PEAC Protocol Quickstart

## Hello Receipt - 10-Line Example

```javascript
import { generateEdDSAKeyPair, signDetached, verifyDetached } from '@peac/core';

// 1. Generate Ed25519 key pair
const { publicKey, privateKey } = await generateEdDSAKeyPair();

// 2. Create a simple receipt
const receipt = {
  iss: 'https://peac-authority.example.com',
  sub: 'https://example.com/content',
  aud: 'https://example.com/content',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
  rid: '01HVQK7Z8TD6QTGNT4ANPK7XXQ', // UUIDv7
  policy_hash: 'YkNBV_ZjNGVhNGU4ZTIxMzlkZjcyYWQ3NDJjOGY0YTM4',
};

// 3. Sign and verify
const jws = await signDetached(receipt, privateKey);
const result = await verifyDetached(jws, publicKey);
console.log('Receipt valid:', result.valid);
```

## Testing with curl

### 1. Verify API Endpoint

```bash
# Test /verify endpoint with sample receipt
curl -X POST http://localhost:3000/verify \
  -H "Content-Type: application/json" \
  -d '{
    "receipt": "eyJhbGciOiJFZERTQSIsInR5cCI6ImFwcGxpY2F0aW9uL3BlYWMtcmVjZWlwdCtqd3MifQ..signature",
    "resource": "https://example.com/content"
  }'
```

Expected response:

```json
{
  "valid": true,
  "claims": {
    "iss": "https://peac-authority.example.com",
    "sub": "https://example.com/content",
    "aud": "https://example.com/content",
    "iat": 1704067200,
    "exp": 1704067500,
    "rid": "01HVQK7Z8TD6QTGNT4ANPK7XXQ",
    "policy_hash": "YkNBV_ZjNGVhNGU4ZTIxMzlkZjcyYWQ3NDJjOGY0YTM4"
  },
  "reconstructed": {
    "hash": "YkNBV_ZjNGVhNGU4ZTIxMzlkZjcyYWQ3NDJjOGY0YTM4",
    "matches": true
  },
  "inputs": [
    {
      "type": "peac.txt",
      "url": "https://example.com/.well-known/peac.txt",
      "status": "not_found"
    },
    {
      "type": "aipref",
      "url": "https://example.com/content",
      "status": "not_found"
    },
    {
      "type": "agent-permissions",
      "url": "https://example.com/content",
      "status": "not_found"
    }
  ],
  "timing": {
    "started": 1704067200000,
    "completed": 1704067200123,
    "duration": 123
  }
}
```

### 2. CLI Usage Examples

```bash
# Discover policy sources
peac discover https://example.com

# Hash a policy file
echo '{"resource": "https://example.com", "purpose": "training"}' | peac hash

# Verify a receipt file
peac verify receipt.jws --resource https://example.com
```

## Installation

```bash
# Install CLI tools
pnpm add -g @peac/cli @peac/core

# Or for development
git clone https://github.com/peacprotocol/peac.git
cd peac
pnpm install
pnpm build
```

## SSRF Protection

The verifier includes SSRF protection by default:

- ✅ **HTTPS only** (http allowed only for localhost/127.0.0.1)
- ✅ **Private IP blocking** (unless `PEAC_ALLOW_PRIVATE_NET=true`)
- ✅ **Size limits** (≤256 KiB per source)
- ✅ **Timeout limits** (≤150ms per fetch, ≤250ms total)
- ✅ **Redirect limits** (≤3 same-scheme redirects)

## Next Steps

- Read [Policy Hash Algorithm](policy-hash.md) for canonicalization details
- See [Error Handling](errors.md) for RFC 7807 Problem Details
- Review [Receipt Claims](receipts.md) for complete schema
- Check [Examples](examples.md) for production deployment patterns
