# PEAC Sample Receipts

This directory contains sample PEAC receipts for testing and demonstration purposes.

## Directory Structure

```
samples/
  valid/                    # Valid sample receipts
    basic-receipt.json      # Minimal valid receipt
    full-receipt.json       # All optional claims
    interaction-evidence.json
    payment-evidence.json
    long-expiry.json
  invalid/                  # Invalid samples (for testing rejection)
    expired.json
    future-iat.json
    missing-iss.json
  bundles/
    offline-verification.json   # Receipt + JWKS bundle
```

## Generating Signed Samples

Use the CLI to generate actual signed JWS samples:

```bash
# Generate all samples
peac samples generate -o ./samples

# Generate only valid samples
peac samples generate -o ./samples --category valid

# Generate as JSON (decoded, not signed)
peac samples generate -o ./samples -f json
```

## Sample Categories

### Valid Samples

These receipts should pass verification when signed with a valid key:

- **basic-receipt**: Minimal receipt with only required fields (iss, aud, iat, exp, rid)
- **full-receipt**: Receipt with all optional claims populated
- **interaction-evidence**: Receipt with InteractionEvidence extension for AI agent calls
- **payment-evidence**: Receipt with payment evidence (402 flow)
- **long-expiry**: Receipt with 24-hour expiration

### Invalid Samples

These receipts should be rejected by verifiers:

- **expired**: Receipt that has already expired
- **future-iat**: Receipt with iat in the future (clock skew violation)
- **missing-iss**: Receipt missing required issuer claim

## Offline Verification Bundle

The `bundles/offline-verification.json` file contains:

- JWKS with test public keys
- Metadata about the samples
- Can be used for offline verification testing

## Using Samples

```typescript
import { verifyReceipt } from '@peac/protocol';

// Read a sample receipt
const receipt = fs.readFileSync('valid/basic-receipt.jws', 'utf8');

// Verify it
const result = await verifyReceipt(receipt);
if (result.ok) {
  console.log('Valid receipt:', result.claims);
} else {
  console.log('Invalid:', result.reason);
}
```

## Notes

- Sample receipts are signed with test keys (kid starts with `sandbox-`)
- Do NOT use these in production
- Expiration times are relative to when samples were generated
- Re-generate samples periodically to keep them fresh
