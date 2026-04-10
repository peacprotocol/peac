# External Pilot Kit

Self-contained pilot kit for an independent external entity to issue a PEAC Interaction Record and verify it through a self-hostable reference verifier API.

## Prerequisites

- Node.js >= 22.0.0
- pnpm

## Quick Start

```bash
pnpm install
pnpm demo
```

## With a Deployed Reference Verifier

```bash
pnpm demo --verifier-url=https://verify.example.com
```

## What This Does

1. Generates a fresh Ed25519 keypair (never stored or exported)
2. Issues a signed Interaction Record with your issuer URL
3. Verifies locally (always works, no network needed)
4. Optionally verifies via a reference verifier API
5. Writes a deterministic, inspectable JSON artifact that passes the schema gate

## Pilot Artifact

The script writes a JSON file with:

- `pilot_id`: unique identifier
- `pilot_organization`: your organization name
- `issuer`: your issuer URL
- `kid`: key identifier used
- `receipt_ref`: SHA-256 hash of the signed receipt
- `verified`: whether verification passed
- `verified_at`: ISO 8601 timestamp
- `wire_version`: Interaction Record format version
- `reference_verifier_url`: which verifier was used
- `verification_method`: `local` or `reference_verifier`

## Environment Variables

- `PILOT_ORG`: your organization name (default: `pilot-organization`)
- `PILOT_ISSUER`: your issuer URL (default: `https://pilot.example.com`)
- `VERIFIER_URL`: reference verifier URL (default: `http://localhost:3000`)

## Security

- No private keys are included in this kit
- Fresh keys are generated at runtime
- Output artifacts never contain private key material
- The reference verifier URL is caller-supplied, not hardcoded
