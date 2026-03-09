# PEAC Quickstart

Issue and verify a receipt with one package.

## Install

```bash
pnpm add @peac/protocol
```

## Run

```bash
pnpm demo
```

## What it does

1. Generates an Ed25519 keypair
2. Issues an Interaction Record (Wire 0.2) receipt with payment evidence
3. Verifies the receipt signature and schema
4. Prints the verified claims

## Expected output

```
PEAC Quickstart Demo

1. Generating Ed25519 keypair...
   Done.

2. Issuing receipt...
   JWS: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJlY29yZC...

3. Verifying receipt...
   Signature + schema valid!

   Claims:
   - Issuer: https://api.example.com
   - Kind: evidence
   - Type: org.peacprotocol/payment
   - Issued at: <timestamp>
   - JTI: <uuidv7>

Done.
```

## Next steps

- See [docs/specs/PROTOCOL-BEHAVIOR.md](../../docs/specs/PROTOCOL-BEHAVIOR.md) for wire format
- See [@peac/policy-kit](../../packages/policy-kit/) for policy authoring
- See [examples/pay-per-inference/](../pay-per-inference/) for a 402 flow example
