# x402 Weather Proof Demo

Demonstrates x402 offer/receipt verification and PEAC record generation using `@peac/adapter-x402`.

## What This Shows

1. **Offer verification** - Verify signed offers against accept terms
2. **Receipt verification** - Validate receipt structure
3. **acceptIndex as untrusted hint** - Term-matching is the binding, not the unsigned index
4. **PEAC record generation** - Normalize x402 artifacts into a canonical record
5. **Stable digest** - JCS+SHA-256 hash for audit/dispute workflows

## Key Insight

`acceptIndex` is outside the x402 signed payload (envelope field). It can be modified in transit without invalidating the signature.

**PEAC strategy:** Treat `acceptIndex` as a hint only. Verifiers MUST compare `accepts[acceptIndex]` terms against signed payload fields and reject on mismatch.

## Run

```bash
pnpm install
pnpm demo
```

## Output

```
=== x402 Weather Proof Demo ===

Resource: https://api.weather.example/v1/forecast/london
Network:  eip155:8453 (Base)
Asset:    USDC
Amount:   $0.10 (100000 minor units)

1. Verifying signed offer against accept terms...
   OK: Offer verified
   - Matched accept index: 0
   - Used hint: true
   - Network: eip155:8453
   - Asset: USDC

2. Verifying signed receipt structure...
   OK: Receipt structure verified
   - Network: eip155:8453
   - txHash: 0xdeadbeef12345678...

3. Testing acceptIndex as UNTRUSTED hint...
   OK: Wrong acceptIndex correctly rejected via term-matching
   OK: Offer verified without acceptIndex (full scan)

4. Generating PEAC interaction record...
   Record version: peac-x402-offer-receipt/0.1
   Evidence fields (from signed payloads):
   - network: eip155:8453
   - asset: USDC
   - amount: 100000
   - payee: 0x742d35Cc6634C053...
   - txHash: 0xdeadbeef12345678...
   Hints (unsigned, untrusted):
   - acceptIndex: 0
   - untrusted: true

5. Computing stable digest (JCS+SHA-256)...
   Digest: 0x...
   (Deterministic - same inputs always produce same hash)
```

## Architecture

```
x402 (payment handshake)
        |
        v
@peac/adapter-x402 (verification + normalization)
        |
        v
PEAC Record (evidence layer)
        |
        v
Audit / Dispute / Compliance workflows
```

x402 generates receipts. PEAC makes them verifiable, auditable, and composable.
