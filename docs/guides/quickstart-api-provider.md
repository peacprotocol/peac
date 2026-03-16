# Quickstart: API Provider

Add signed receipts to your Express.js API in under 5 minutes. Every response will include a `PEAC-Receipt` header with a verifiable JWS.

## Prerequisites

- Node.js >= 22.0.0
- An existing Express.js application (or create one below)

## 1. Install

```bash
pnpm add @peac/middleware-express @peac/crypto express
```

## 2. Generate a signing key

```typescript
import { generateKeypair, exportJWK } from '@peac/crypto';

const { publicKey, privateKey } = await generateKeypair();
const jwk = await exportJWK(publicKey, privateKey);
console.log(JSON.stringify(jwk, null, 2));
// Save this JWK securely. Share only the public key.
```

## 3. Add the middleware

```typescript
import express from 'express';
import { peacMiddleware } from '@peac/middleware-express';

const app = express();

app.use(
  peacMiddleware({
    issuer: 'https://api.example.com',
    signingKey: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: '<base64url public key from step 2>',
      d: '<base64url private key from step 2>',
    },
    keyId: 'prod-2026-03',
  })
);

app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello World' });
  // PEAC-Receipt header is automatically added to the response
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

## 4. Verify it works

```bash
curl -i http://localhost:3000/api/data
```

You should see a `PEAC-Receipt` header in the response containing a compact JWS.

## 5. Verify the receipt offline

```typescript
import { verifyLocal } from '@peac/protocol';

const receiptJws = '<the PEAC-Receipt header value>';
const result = await verifyLocal(receiptJws, publicKey);
console.log('Valid:', result.valid);
if (result.valid) {
  console.log('Issuer:', result.claims.iss);
  console.log('Kind:', result.claims.kind);
}
```

## What you get

- Every API response carries a signed receipt
- Receipts verify offline with just the public key
- No network calls needed for verification
- Receipts survive across organizational boundaries

## Next steps

- Publish your policy: see [PEAC-TXT](../specs/PEAC-TXT.md) for `/.well-known/peac.txt`
- Publish your keys: see [PEAC-ISSUER](../specs/PEAC-ISSUER.md) for `/.well-known/peac-issuer.json`
- Add typed extensions: see [Wire 0.2 spec](../specs/WIRE-0.2.md) for commerce, access, identity groups
- See [examples/pay-per-inference](../../examples/pay-per-inference/) for a full 402 payment flow
