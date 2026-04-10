# PEAC Pilot Kit

Step-by-step guide for running a PEAC integration pilot: issue signed Interaction Records and verify them through a self-hostable reference verifier.

## Who This Is For

Any organization that wants to:

- Issue signed interaction evidence from their own infrastructure
- Verify receipts independently (no dependency on any hosted service)
- Produce inspectable proof artifacts for stakeholders

## Steps

### 1. Generate an Ed25519 keypair

```bash
node -e "import('@peac/protocol').then(p=>p.generateKeypair()).then(k=>{console.log('Public:',Buffer.from(k.publicKey).toString('hex'));console.log('Private (keep secret):',Buffer.from(k.privateKey).toString('hex'))})"
```

### 2. Publish your JWKS

Host a JWKS endpoint at your domain:

```
https://your-domain.com/.well-known/jwks.json
```

Include the Ed25519 public key in JWK format.

### 3. Issue a receipt

Use `@peac/protocol` or the Go SDK:

```typescript
import { issue } from '@peac/protocol';

const { jws } = await issue({
  iss: 'https://your-domain.com',
  kind: 'evidence',
  type: 'org.peacprotocol/pilot-verification',
  privateKey,
  kid: 'your-key-id',
});
```

### 4. Verify

**Local verification (always works):**

```typescript
import { verifyLocal } from '@peac/protocol';
const result = await verifyLocal(jws, publicKey);
```

**Via reference verifier API (self-hosted or deployed):**

```bash
curl -X POST http://localhost:3000/v1/verify \
  -H 'Content-Type: application/json' \
  -d '{"receipt": "<jws>", "public_key": "<base64url-public-key>"}'
```

### 5. Produce a pilot artifact

Run the automated pilot script:

```bash
cd examples/external-pilot
PILOT_ORG="Your Org" PILOT_ISSUER="https://your-domain.com" pnpm demo
```

This generates a JSON artifact with: pilot ID, organization, issuer, receipt ref, verification result, and timestamp.

## Pilot Artifact Schema

```json
{
  "pilot_id": "UUID",
  "pilot_organization": "string",
  "issuer": "HTTPS URL",
  "kid": "string",
  "receipt_ref": "sha256:...",
  "verified": true,
  "verified_at": "ISO 8601",
  "wire_version": "0.2",
  "reference_verifier_url": "string",
  "verification_method": "local | reference_verifier"
}
```

## See Also

- [examples/external-pilot/](../../examples/external-pilot/) for the automated script
- [examples/minimal/](../../examples/minimal/) for a simpler starting point
