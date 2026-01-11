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
2. Issues a receipt with payment evidence
3. Verifies the receipt signature
4. Prints the verified claims

## Expected output

```
PEAC Quickstart Demo

1. Generating Ed25519 keypair...
   Done.

2. Issuing receipt...
   JWS: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMucmVjZWlwdC8wLjkiLC...

3. Verifying receipt...
   Signature valid!

   Claims:
   - Issuer: https://api.example.com
   - Audience: https://client.example.com
   - Amount: 1000 USD
   - Rail: stripe
   - Reference: pi_1234567890
   - Receipt ID: <uuidv7>
   - Issued at: <timestamp>

Done.
```

## Next steps

- See [docs/specs/PROTOCOL-BEHAVIOR.md](../../docs/specs/PROTOCOL-BEHAVIOR.md) for wire format
- See [@peac/policy-kit](../../packages/policy-kit/) for policy authoring
- See [examples/pay-per-inference/](../pay-per-inference/) for a 402 flow example
