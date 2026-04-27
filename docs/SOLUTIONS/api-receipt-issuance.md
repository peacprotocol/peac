# API record issuance

> **Outcome:** Your HTTP API emits signed records on every response so consumers can verify what terms applied and what happened — offline, with just your public key.
>
> **Audience:** API provider.
>
> **Time:** About 5 minutes from a clean clone.

## The problem

An API operator wants to add portable proof to every response. Consumers may be paying partners, downstream services, auditors, or agents acting on behalf of users. Local logs are not enough — the other party needs a signed record that survives your log retention and can be checked without calling back to your service.

PEAC issues a compact JWS on every response, carried in the `PEAC-Receipt` HTTP header. The signature lets anyone with your public key verify offline.

## What you'll use

PEAC packages:

- `@peac/middleware-express` — Express middleware that issues records on each response.
- `@peac/protocol` — issuance and offline verification.
- `@peac/crypto` — Ed25519 signing.

Optional adjacent systems: any HTTP server (Express shown; Hono / Koa / Fastify adapters exist). Any signing-key custody option (in-process key, KMS, HSM) works as long as it implements the signing callback.

Prerequisites: Node 22+, pnpm 8+, Express.

## Step-by-step

1. Install dependencies:

   ```bash
   pnpm add @peac/middleware-express @peac/protocol @peac/crypto
   ```

2. Create an Ed25519 keypair and publish the public key at `/.well-known/peac-issuer.json` + JWKS (`/.well-known/jwks.json`). A minimal harness:

   ```typescript
   import { generateKeypair } from '@peac/crypto';

   const { privateKey, publicKey, kid } = await generateKeypair();
   ```

3. Wire the middleware into your Express app:

   ```typescript
   import express from 'express';
   import { peacIssue } from '@peac/middleware-express';

   const app = express();

   app.use(
     peacIssue({
       issuer: 'https://api.example.com',
       privateKey,
       kid,
       // Map each response into a claim payload.
       claimsFromResponse: (req, res) => ({
         kind: 'evidence',
         type: 'org.peacprotocol/api-receipt',
         pillars: ['access'],
         ext: {
           access: {
             path: req.path,
             method: req.method,
             status: res.statusCode,
           },
         },
       }),
     })
   );

   app.get('/api/v1/resource', (req, res) => {
     res.json({ ok: true });
   });
   ```

4. Inspect a response:

   ```bash
   curl -i https://api.example.com/api/v1/resource
   # ...
   # PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZCtqd3QifQ...
   # Link: </.well-known/peac-issuer.json>; rel="issuer"
   ```

5. Verify the record offline from any consumer:

   ```typescript
   import { verifyLocal } from '@peac/protocol';

   const result = await verifyLocal(receiptHeader, publicKey, {
     issuer: 'https://api.example.com',
   });
   console.log(result.valid, result.claims.type, result.claims.ext.access);
   ```

## Evidence of output

A decoded record payload for an authorized GET looks like this:

```json
{
  "iss": "https://api.example.com",
  "iat": 1781609600,
  "jti": "019676d0-0000-7000-8000-000000000000",
  "kind": "evidence",
  "type": "org.peacprotocol/api-receipt",
  "pillars": ["access"],
  "peac_version": "0.2",
  "schema": "interaction-record+jwt",
  "ext": {
    "access": {
      "path": "/api/v1/resource",
      "method": "GET",
      "status": 200
    }
  }
}
```

The JOSE header carries `typ: interaction-record+jwt`, `alg: EdDSA`, and `kid` for the signing key. The HTTP response body remains whatever your handler returned; the `receipt` is additive on the response.

## Validated with

```bash
pnpm install && pnpm build
pnpm --filter @peac/middleware-express test
pnpm --filter @peac/example-hello-world demo
```

The `@peac/middleware-express` test suite exercises the issue-on-response path; `examples/hello-world` issues a record and verifies it offline in the same script.

## Where to go from here

- [API Provider Quickstart](../guides/quickstart-api-provider.md) — the five-minute walkthrough with full source.
- [`packages/middleware-express/`](../../packages/middleware-express/) — middleware reference.
- [`docs/specs/PROTOCOL-BEHAVIOR.md`](../specs/PROTOCOL-BEHAVIOR.md) — normative issuance and verification behavior.
- [`docs/compatibility/COMPATIBILITY_MATRIX.md`](../COMPATIBILITY_MATRIX.md) — Adapter Readiness for `@peac/middleware-express` and `@peac/protocol`.
