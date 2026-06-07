# PEAC Sample Records

This directory contains sample PEAC records for local testing and demonstration.
Generated valid samples are PEAC signed interaction records that pass local
verification. They are for local testing and demonstration; they do not prove
that any real-world event occurred.

## Directory Structure

```
samples/
  valid/                    # Valid sample records (issue() input recipes)
    basic-record.json       # Minimal valid record
    full-record.json        # Optional fields (subject, declared purpose)
    mcp-tool-run.json       # MCP tool run (org.peacprotocol/mcp extension)
    payment-event.json      # Payment event (org.peacprotocol/commerce extension)
    event-time-record.json  # Carries an event time (occurred_at)
  invalid/                  # Legacy rejection fixtures (raw claims, intentionally invalid)
    expired.json
    future-iat.json
    missing-iss.json
  bundles/
    offline-verification.json   # Generated-sample + JWKS metadata
```

Valid samples are stored as `issue()` input recipes (`format: "issue-options"`).
The CLI issues them through the current issue path at generation time, so the
generated records are current and locally verifiable. Invalid samples are stored
as raw legacy claims so they can carry intentionally invalid shapes that the
issue path would refuse to produce.

## Generating Signed Samples

Use the CLI to generate actual signed records:

```bash
# Generate all samples
peac samples generate -o ./samples

# Generate only valid samples
peac samples generate -o ./samples --category valid

# Generate as JSON (decoded, not signed)
peac samples generate -o ./samples -f json
```

`peac samples generate` also writes `bundles/sandbox-jwks.json`, a single-key
JWKS holding the public verification key for the generated samples.

### Timestamps and identifiers

- `--now <unix-seconds>` sets each valid sample's **event time** (`occurred_at`),
  not its issuance time. `iat` always reflects the actual issuance time produced
  by the issue path. When valid samples are selected, the CLI rejects a future
  `--now` before writing any sample files (so generated valid samples are never
  written in a state that would fail local verification).
- Because `iat` reflects issuance time, generated valid record bytes are not
  identical across runs.
- `--kid <kid>` sets the key id in both the generated JWS protected header and
  `bundles/sandbox-jwks.json`.

## Sample Categories

### Valid Samples

Generated valid samples are current PEAC signed interaction records that pass
local verification:

- **basic-record**: minimal valid record
- **full-record**: record with optional fields (subject, declared purpose)
- **mcp-tool-run**: record for an MCP tool run
- **payment-event**: record for a payment event
- **event-time-record**: record carrying an event time (`occurred_at`)

### Invalid Samples

These are legacy rejection fixtures that local verification rejects:

- **expired**: already expired
- **future-iat**: issuance time in the future (clock-skew violation)
- **missing-iss**: missing the required issuer claim

## Using Samples

```typescript
import { readFileSync } from 'node:fs';
import { verifyLocal } from '@peac/protocol';
import { jwkToPublicKeyBytes } from '@peac/crypto';

// Load the generated public verification key (single-key JWKS).
const jwks = JSON.parse(readFileSync('bundles/sandbox-jwks.json', 'utf8'));
const publicKey = jwkToPublicKeyBytes(jwks.keys[0]);

// Verify a generated valid sample offline (no network, no server).
const jws = readFileSync('valid/basic-record.jws', 'utf8').trim();
const result = await verifyLocal(jws, publicKey);
console.log('valid:', result.valid);
```

## Notes

- Sample records are signed with sandbox keys (kid starts with `sandbox-`).
- Do NOT use these in production.
- Re-generate samples to refresh them.
