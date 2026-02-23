# Integration Guide: [Ecosystem Name]

## Prerequisites

- Node.js >= 22.0.0
- An Ed25519 signing keypair
- A PEAC issuer identity (HTTPS URL)

## Step 1: Install dependencies

```bash
npm install @peac/protocol @peac/crypto
```

## Step 2: Generate a signing key

```typescript
import { generateKeypair } from '@peac/crypto';

const { privateKey, publicKey } = await generateKeypair();
```

Store the private key securely. Publish the public key via JWKS at your issuer URL.

## Step 3: Issue a receipt

```typescript
import { issue } from '@peac/protocol';

const { jws } = await issue({
  iss: 'https://your-service.example.com',
  aud: 'https://consumer.example.com',
  amt: 1000,
  cur: 'USD',
  rail: 'x402',
  reference: 'tx_abc123',
  asset: 'USD',
  env: 'production',
  evidence: {
    /* your evidence data */
  },
  privateKey,
  kid: 'key-2026-01',
});
```

## Step 4: Verify a receipt

```typescript
import { verifyLocal } from '@peac/protocol';

const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://your-service.example.com',
});

if (result.valid) {
  console.log('Receipt verified:', result.claims);
} else {
  console.error('Verification failed:', result.code, result.message);
}
```

## Step 5: Run conformance tests

Ensure your integration passes the conformance harness:

```bash
pnpm exec tsx scripts/conformance-harness.ts --adapter core --format pretty
```

## Ecosystem-specific notes

Add notes specific to [Ecosystem Name] integration here.
