# PEAC Protocol - Quick Start Reference
## Code Generation & Engineering Guide

**Date:** 2025-11-18 IST
**Wire Format:** `peac.receipt/0.9` (flip to `1.0` when v1.0 is EARNED)
**Current Branch:** `feat/monorepo-scaffold` (local only)
**Status:** Week 0 Complete → v0.9.15 In Progress

---

## 🎯 Version Strategy (DEFINITIVE)

```
v0.9.14 (GitHub - LEGACY, being archived)
    ↓
v0.9.15 → v0.9.21 (NEW architecture, 7 releases, 16-22.5 weeks)
    ↓
v1.0 (EARNED after IETF + multi-implementation + production validation)
```

**Key Rules:**
- Wire format: `peac.receipt/0.9` throughout development
- Breaking changes ALLOWED during v0.9.x
- v1.0 flip happens when EARNED (no date commitment)
- Header: `PEAC-Receipt` ONLY (no X-PEAC aliases)

---

## ✅ Week 0 Complete (9 Packages, ~4,100 LOC)

### Core Packages
1. **@peac/schema** - Types, validators, constants
   - ✅ NormalizedPayment interface
   - ✅ PEACReceiptClaims interface
   - ✅ aipref_snapshot field (in extensions)
   - ❌ **MISSING:** control{} block types
   - ❌ **MISSING:** payment.facilitator, payment.evidence

2. **@peac/crypto** - Ed25519, JCS, base64url ✅

3. **@peac/protocol** - issue(), verify(), discovery ✅
   - ❌ **MISSING:** DPoP L3/L4 validation
   - ❌ **MISSING:** SSRF protection
   - ❌ **MISSING:** AIPREF mandatory enforcement

4. **@peac/server** - /verify endpoint, rate limiting ✅
   - ❌ **MISSING:** /slo (session logout)

5. **@peac/cli** - peac verify, peac gen-key ✅
   - ❌ **MISSING:** peac rotate-keys

### Payment Rails
6. **@peac/rails-x402** - Lightning/x402 adapter ✅
7. **@peac/rails-stripe** - Stripe adapter ✅
8. ❌ **@peac/rails-razorpay** - Directory exists, needs implementation

### Protocol Mappings
9. **@peac/mappings-mcp** - Model Context Protocol ✅
10. **@peac/mappings-acp** - Agentic Commerce Protocol ✅

### Test Infrastructure
11. **tests/vectors/negative.spec.ts** - 14 attack scenarios ✅
12. **tests/performance/verify.bench.ts** - Performance gates ✅
13. **tests/conformance/parity.spec.ts** - Rail parity (x402 == Stripe) ✅

---

## 🔜 v0.9.15 Remaining Work (CAL + Security)

### 1. Control Abstraction Layer (CAL) - ~500 LOC
**Priority:** HIGHEST
**Time:** 4-5 days

**Tasks:**
- [ ] Create `packages/control-core/` package
  - `src/interfaces.ts` - CAL engine-agnostic interfaces
  - `src/types.ts` - control{} block TypeScript types
  - `src/validators.ts` - Zod schemas for control{}
  - `src/test-helpers.ts` - CAL test utilities

- [ ] Update `packages/schema/src/types.ts`:
  ```typescript
  export interface ControlBlock {
    engine: "locus" | "ap2" | "tap" | string;
    policy_id: string;
    result: "approved" | "denied" | "conditional";
    limits_snapshot?: Record<string, unknown>;
    reason?: string;
    evidence?: Record<string, unknown>;
  }

  export interface ExtendedPayment extends NormalizedPayment {
    facilitator?: string;  // NEW
    evidence?: Record<string, unknown>;  // NEW
  }

  export interface PEACReceiptClaims {
    // ... existing fields ...
    control?: ControlBlock;  // NEW
    payment?: ExtendedPayment;  // UPDATED
  }
  ```

- [ ] Update `packages/protocol/src/issue.ts` to handle control{} validation
- [ ] Add control receipt tests

**Files to Create:**
```
packages/control-core/
├── src/
│   ├── interfaces.ts
│   ├── types.ts
│   ├── validators.ts
│   └── test-helpers.ts
├── package.json
└── tsconfig.json
```

---

### 2. DPoP L3/L4 Implementation - ~300 LOC
**Priority:** HIGH
**Time:** 3-4 days

**Tasks:**
- [ ] Create `packages/protocol/src/dpop.ts`:
  - RFC 9449 proof verification
  - Nonce anti-replay checks
  - HTM/HTU validation
  - JTI uniqueness enforcement

- [ ] Add `security.dpop` field to schema
- [ ] Enforce DPoP at L3/L4 conformance levels
- [ ] Add DPoP negative test vectors

**Implementation:**
```typescript
export interface DPoPProof {
  jti: string;
  htm: string;
  htu: string;
  iat: number;
}

export async function verifyDPoP(
  proof: string,
  method: string,
  uri: string,
  nonce: string
): Promise<DPoPProof> {
  // RFC 9449 verification logic
}
```

---

### 3. JWKS Rotation - ~200 LOC
**Priority:** MEDIUM
**Time:** 2-3 days

**Tasks:**
- [ ] Create `packages/infrastructure/src/jwks-rotation.ts`:
  - 90-day rotation schedule
  - 7-day overlap window
  - Automated cron job

- [ ] Add `peac rotate-keys` CLI command
- [ ] Document rotation procedures

**Files to Create:**
```
packages/infrastructure/
├── src/
│   ├── jwks-rotation.ts
│   ├── outbox.ts (future)
│   └── observability.ts (future)
├── package.json
└── tsconfig.json
```

---

### 4. SSRF Protection - ~150 LOC
**Priority:** HIGH (Security)
**Time:** 1-2 days

**Tasks:**
- [ ] Create `packages/protocol/src/ssrf-guard.ts`:
  - Block private IP ranges (10.0.0.0/8, 192.168.0.0/16, 127.0.0.1)
  - Block metadata URLs (169.254.169.254)
  - Enforce HTTPS (except localhost)
  - 5-second timeout for discovery

- [ ] Integrate into JWKS fetching
- [ ] Add SSRF negative test vectors

---

### 5. Discovery + AIPREF Invariants - ~150 LOC
**Priority:** HIGH
**Time:** 2-3 days

**Tasks:**
- [ ] Update `packages/protocol/src/discovery.ts`:
  - Enforce `/.well-known/peac.txt` ≤20 lines limit
  - Make AIPREF snapshot MANDATORY when present
  - Add required triplet validation

- [ ] Add AIPREF field to PEACReceiptClaims:
  ```typescript
  export interface PEACReceiptClaims {
    // ... existing fields ...
    aipref?: {
      url: string;
      retrieved_at: number;
      hash: string;  // sha256-...
    };
  }
  ```

---

### 6. Payment Field Rule - ~100 LOC
**Priority:** HIGH
**Time:** 1 day

**Tasks:**
- [ ] Implement rule: `payment` is **REQUIRED** when `enforcement.method=='http-402'`
- [ ] Otherwise, `payment` present only if payment adapter was used
- [ ] Add validation tests
- [ ] Update error messages

---

### 7. Session Logout (/slo) - ~100 LOC
**Priority:** MEDIUM
**Time:** 1-2 days

**Tasks:**
- [ ] Create `packages/server/src/slo.ts`:
  - POST /slo endpoint
  - Redis blacklist implementation
  - Early invalidation flow

- [ ] Add /slo tests
- [ ] Document usage

---

### 8. Documentation Updates - ~0 LOC
**Priority:** MEDIUM
**Time:** 2-3 days

**Tasks:**
- [ ] Update materplan/STATUS.md with CAL and security hardening status
- [ ] Create JWKS rotation guide
- [ ] Document DPoP L3/L4 requirements
- [ ] Document CAL integration
- [ ] Add scheduling & timezone note (IST discipline)
- [ ] Update examples to use PEAC-Receipt only

---

## 📐 Wire Format (v0.9.15+)

### JWS Header
```json
{
  "typ": "peac.receipt/0.9",
  "alg": "EdDSA",
  "kid": "2025-01-17T12:00:00+05:30"
}
```

### Payload (Claims) - WITH CAL
```json
{
  "rid": "rcpt_01JBXX...",
  "iat": 1737096600,
  "exp": 1737100200,

  "subject": {
    "uri": "https://api.example.com/resource",
    "method": "GET"
  },

  "policy_hash": "sha256-abc123...",

  "control": {
    "engine": "locus",
    "policy_id": "pol_abc123",
    "result": "approved",
    "limits_snapshot": {
      "daily_spend": 1000,
      "remaining": 750
    },
    "reason": "within-limits",
    "evidence": {
      "mandate_id": "mdt_xyz789",
      "wallet_balance": 5000
    }
  },

  "payment": {
    "scheme": "x402",
    "facilitator": "lnpay.co",
    "reference": "inv_abc123",
    "amount": 100,
    "currency": "USD",
    "idempotency_key": "idem_...",
    "evidence": {
      "invoice": "lnbc10n...",
      "payment_hash": "abc123..."
    }
  },

  "aipref": {
    "url": "https://example.com/.well-known/ai.txt",
    "retrieved_at": 1737096600,
    "hash": "sha256-def456..."
  },

  "security": {
    "level": "L3",
    "dpop": {
      "jti": "unique_id",
      "htm": "GET",
      "htu": "https://api.example.com/resource",
      "iat": 1737096600
    }
  }
}
```

---

## 🏗️ Architecture Layers

```
┌────────────────────────────────────────────────┐
│  LAYER 7: Applications (Post-v1.0)            │
└────────────────────────────────────────────────┘
                     ↕
┌────────────────────────────────────────────────┐
│  LAYER 6: Distribution (v0.9.16+)             │
│  - WordPress, Vercel, LangChain, Cloudflare   │
└────────────────────────────────────────────────┘
                     ↕
┌────────────────────────────────────────────────┐
│  LAYER 5: Protocol Mappings                    │
│  - MCP (FIRST), ACP, AP2 (v0.9.16), TAP       │
└────────────────────────────────────────────────┘
                     ↕
┌────────────────────────────────────────────────┐
│  LAYER 4: Transport Abstraction (v0.9.20)     │
│  - HTTP, gRPC, WebSocket                      │
└────────────────────────────────────────────────┘
                     ↕
┌────────────────────────────────────────────────┐
│  LAYER 3: Core Protocol ✅ COMPLETE            │
│  - Discovery, Policy, Receipts, Verify        │
│  - 🔜 v0.9.15: +CAL, +DPoP L3/L4, +AIPREF    │
└────────────────────────────────────────────────┘
                     ↕
┌────────────────────────────────────────────────┐
│  LAYER 2A: Control Abstraction (CAL)          │
│  - 🔜 v0.9.15: Locus, AP2, TAP engines        │
└────────────────────────────────────────────────┘
                     ↕
┌────────────────────────────────────────────────┐
│  LAYER 2B: Payment Rails ✅ COMPLETE           │
│  - x402 (FIRST), Stripe, Razorpay             │
└────────────────────────────────────────────────┘
                     ↕
┌────────────────────────────────────────────────┐
│  LAYER 1: Cryptography ✅ COMPLETE             │
│  - Ed25519, JCS, Base64url, UUIDv7            │
└────────────────────────────────────────────────┘
```

---

## 🎯 Six Pillars Status

| Pillar | v0.9.14-v0.9.21 Scope | Post-v1.0 Scope |
|--------|----------------------|-----------------|
| **1. COMMERCE** | ✅ Multi-rail (x402, Stripe, Razorpay), HTTP 402, receipts | Revenue analytics |
| **2. ACCESS** | ✅ Discovery, AIPREF, policy, CAL, DPoP L3/L4 | Advanced AAA |
| **3. COMPLIANCE** | ⏸️ Basic receipts & audit | v1.1: EU AI Act, SOC2, HIPAA exports |
| **4. CONSENT** | ⏸️ Basic policy signals | v1.1: GDPR revocation automation |
| **5. ATTRIBUTION** | ⏸️ Basic provenance | v1.2: C2PA, royalty splits |
| **6. INTELLIGENCE** | ⏸️ Basic pricing | v1.2: Price discovery, fraud detection |

**Focus for v0.9.15-v0.9.21:** COMMERCE + ACCESS only. Others deferred to post-v1.0.

---

## 📦 Repository Structure (Current)

```
peac/
├── packages/
│   ├── schema/           ✅ COMPLETE (needs CAL types)
│   ├── crypto/           ✅ COMPLETE
│   ├── protocol/         ✅ COMPLETE (needs DPoP, SSRF, AIPREF)
│   ├── server/           ✅ COMPLETE (needs /slo)
│   ├── cli/              ✅ COMPLETE (needs rotate-keys)
│   ├── rails/
│   │   ├── x402/         ✅ COMPLETE
│   │   ├── stripe/       ✅ COMPLETE
│   │   └── razorpay/     📋 PLANNED (v0.9.19)
│   ├── mappings/
│   │   ├── mcp/          ✅ COMPLETE
│   │   ├── acp/          ✅ COMPLETE
│   │   ├── ap2/          📋 PLANNED (v0.9.16)
│   │   └── tap/          📋 PLANNED (v0.9.17)
│   ├── control-core/     🔜 v0.9.15 (NEW)
│   ├── infrastructure/   🔜 v0.9.15 (JWKS rotation)
│   └── conformance/      📋 PLANNED
│
├── tests/
│   ├── vectors/
│   │   └── negative.spec.ts     ✅ 14 attack scenarios
│   ├── performance/
│   │   └── verify.bench.ts      ✅ p95 ≤ 5ms gate
│   └── conformance/
│       └── parity.spec.ts       ✅ x402 == Stripe
│
├── materplan/           📚 40+ docs
├── docs/                📋 PLANNED
└── .github/workflows/   ✅ CI gates
```

---

## 🚦 CI/CD Gates (ENFORCED)

### Performance Gates
- ✅ **Verify p95 ≤ 5ms** (maintained through v0.9.21)
- ✅ **Sign p95 < 10ms**
- ✅ **Throughput ≥1k rps baseline**
- Memory usage within bounds
- Zero memory leaks

### Conformance Gates
- ✅ **Rail parity:** x402 == Stripe (byte-identical core claims)
- ✅ **14 negative test vectors** (attack scenarios)
- 🔜 Protocol mapping parity (MCP, ACP, AP2, TAP)
- OWASP baseline clean

### Security Gates
- 🔜 No HIGH/CRITICAL vulnerabilities (Semgrep, CodeQL)
- 🔜 Dependency audit clean
- 🔜 SSRF protection verified
- 🔜 DPoP L3/L4 tests passing

---

## 🎨 Code Style Guidelines

### Naming Conventions
- **Packages:** `@peac/package-name` (kebab-case)
- **Types:** `PascalCase` (e.g., `PEACReceiptClaims`)
- **Functions:** `camelCase` (e.g., `issueReceipt()`)
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `PEAC_WIRE_TYP`)

### File Structure
```typescript
/**
 * Package purpose (1-2 sentences)
 */

import { ... } from "...";

// Types first
export interface Foo { ... }
export type Bar = ...;

// Functions second
export function baz() { ... }

// Tests inline or separate .test.ts
```

### Error Handling
```typescript
// Use typed errors
export class PEACError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "PEACError";
  }
}

// Throw with context
throw new PEACError(
  "Invalid payment scheme",
  "INVALID_PAYMENT_SCHEME",
  { scheme, expected: ["stripe", "x402", "razorpay"] }
);
```

### Testing
```typescript
import { describe, it, expect } from "vitest";

describe("issueReceipt", () => {
  it("should issue valid receipt with payment", async () => {
    const receipt = await issueReceipt({ ... });
    expect(receipt).toMatchObject({ ... });
  });

  it("should reject invalid currency", async () => {
    await expect(
      issueReceipt({ currency: "invalid" })
    ).rejects.toThrow("Invalid currency");
  });
});
```

---

## 📖 Key Documents

1. **[COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md)** - Full roadmap v0.9.15 → v0.9.21
2. **[LEGACY_VS_NEW_COMPARISON.md](LEGACY_VS_NEW_COMPARISON.md)** - Legacy vs new architecture
3. **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Week 0 completion status
4. **materplan/** - 40+ masterplan documents
5. **This file** - Quick reference for code generation

---

## ⚡ Quick Commands

```bash
# Build all packages
npm run build

# Run tests
npm test

# Run performance benchmarks
npm run bench

# Run parity tests
npm run test:parity

# Run negative vectors
npm run test:vectors

# Lint and format
npm run lint
npm run format

# Generate receipt
peac issue --iss https://example.com --aud https://api.example.com/resource

# Verify receipt
peac verify <jws>

# Generate Ed25519 keypair
peac gen-key

# Rotate JWKS (v0.9.15+)
peac rotate-keys
```

---

## 🎯 Next Steps (v0.9.15)

**Week 1-2 Priority:**
1. 🔜 **CAL Integration** (control-core package, schema updates)
2. 🔜 **DPoP L3/L4** (dpop.ts, negative vectors)
3. 🔜 **SSRF Protection** (ssrf-guard.ts)
4. 🔜 **AIPREF Enforcement** (mandatory when present, ≤20 lines)

**Week 2-3:**
5. 🔜 **JWKS Rotation** (infrastructure package)
6. 🔜 **Session Logout** (/slo endpoint)
7. 🔜 **Payment Field Rule** (validation logic)
8. 🔜 **Documentation** (STATUS.md, guides)

**Target:** v0.9.15 complete in 3-4.5 weeks (~1,700 LOC)

---

## 🔗 External Resources

- **IETF RFCs:**
  - RFC 8032 (Ed25519)
  - RFC 8785 (JSON Canonicalization Scheme)
  - RFC 9449 (DPoP)
  - RFC 9457 (Problem Details)
  - RFC 9562 (UUIDv7)

- **Standards:**
  - ISO 4217 (Currency codes)
  - ISO 8601 (Timestamps)

- **GitHub:** https://github.com/peacprotocol/peac (legacy v0.9.14)

---

**Document Version:** v1.0
**Last Updated:** 2025-11-18 IST
**Maintained By:** Engineering Team
**Status:** ✅ READY FOR CODE GENERATION
