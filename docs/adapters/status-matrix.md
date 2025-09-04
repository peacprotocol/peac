# PEAC v0.9.12 Payment Adapter Status Matrix

**Last Updated**: 2025-09-04T20:30:00Z  
**Release**: v0.9.12-rc.1

## Status Definitions

- **Implemented**: Full verification, production-ready
- **Preview**: Stable wire format, stubbed verification  
- **Planned**: Roadmap item, not yet implemented

## Payment Rails

| Rail | Status | Default Order | Production Ready | Notes |
|------|--------|---------------|------------------|--------|
| **x402** | ✅ Implemented | #1 | Yes | Coinbase protocol, full verification |
| **L402** | ✅ Implemented | #2 | Yes | Lightning/LSAT, macaroon + preimage |
| **Tempo** | 🟡 Preview | Behind config | No | Stripe+Paradigm L1, stubbed verification |
| **Stripe** | 🟡 Preview | Excluded | No | Traditional payments, header-only stub |
| **Bridge.xyz** | 🟡 Preview | Excluded | No | Cross-chain, header-only stub |

## Default Configuration

### Production (`PEAC_PAY_ORDER` not set)
```
Order: x402, l402
Includes: Only implemented adapters
```

### Development/Demo (`PEAC_PAY_ORDER=x402,tempo,l402`)  
```
Order: x402, tempo, l402
Includes: Preview adapters for testing
```

## Verification Details

### ✅ Implemented Rails

**x402 (Coinbase)**
- Full EIP-712 signature verification
- USDC/ETH settlement validation
- Production-grade error handling
- Rate limiting and replay protection

**L402 (Lightning)**  
- Macaroon validation with caveats
- Preimage verification against invoice hash
- Lightning Network payment confirmation
- Time-bound challenge/response

### 🟡 Preview Rails (Stubbed)

**Tempo (Stripe + Paradigm)**
- ⚠️ **Placeholder verification**: Accepts demo tokens
- **Wire format**: Stable (`tempo:tx:`, `tempo:chain:`, `tempo:memo:`)
- **Headers**: `X-Tempo-*` (adapter-local, subject to change)
- **Production**: Requires official SDK integration

**Stripe (Traditional)**
- ⚠️ **Headers-only stub**: No actual PaymentIntent verification  
- **Wire format**: Stable (`stripe` rail, `pi_*` provider IDs)
- **Production**: Requires Stripe API integration

**Bridge.xyz (Cross-chain)**
- ⚠️ **Headers-only stub**: No transaction verification
- **Wire format**: Stable (`bridge:tx:`, `bridge:route:`)
- **Production**: Requires Bridge.xyz API integration

## CI/Testing Matrix

### Parity Tests (Required)
- ✅ x402 fixtures pass issue/verify
- ✅ L402 fixtures pass issue/verify  
- ✅ Tempo fixtures pass issue/verify (stubbed)

### Negotiation Tests
- ✅ `Accept-Payments: x402` → x402 challenge
- ✅ `Accept-Payments: l402` → L402 challenge
- ✅ `Accept-Payments: tempo` → Tempo challenge  
- ✅ Quality factors respected with fallbacks

### Security Tests  
- ✅ Malformed proofs rejected
- ✅ Header injection attempts blocked
- ✅ Rate limiting enforced per rail

## Upgrade Path

### v0.9.13 (Economic Layer)
- **Tempo**: Swap stubbed verification for official SDK
- **Stripe**: Add full PaymentIntent verification
- **Bridge.xyz**: Add transaction confirmation

### v0.9.14+ (Expansion)  
- Additional rails based on market demand
- Enhanced cross-chain settlement
- Advanced routing and optimization

## Configuration Examples

### Production Deployment
```bash
# Conservative: only implemented rails
export PEAC_PAY_ORDER=x402,l402
```

### Development/Testing
```bash  
# Include previews for integration testing
export PEAC_PAY_ORDER=x402,tempo,l402
export TEMPO_NET=tempo-testnet
```

### Demo Environment
```bash
# Show full multi-rail capabilities  
export PEAC_PAY_ORDER=x402,tempo,l402,stripe
export PEAC_DEMO_MODE=true
```