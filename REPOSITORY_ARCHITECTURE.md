# PEAC Protocol - Repository Architecture

## Current State + Roadmap (v0.9.15 → v0.9.21)

**Date:** 2025-11-18 IST
**Branch:** `feat/monorepo-scaffold`
**Status:** v0.9.15 Complete → v0.9.16 Next (CAL + Security)

---

## 🎯 Legend

**⚠️ NOTE**: This document shows the ORIGINAL v0.9.15 plan (CAL + Security).
**ACTUAL v0.9.15** (completed 2025-11-18) was: Naming + Vendor Neutrality + Envelope Alignment.
**CAL + Security moved to v0.9.16**.

- ✅ **SHIPPED** (v0.9.14 + v0.9.15 naming work)
- 🔜 **v0.9.16** (CAL + Security - originally planned for v0.9.15)
- 📋 **v0.9.17+** (Future releases)
- 📚 **Documentation**

---

## 📁 Complete Repository Structure

```
peac/                                    # Monorepo root
│
├── 📦 packages/                         # All protocol packages
│   │
│   ├── 🔐 Core Protocol Packages
│   │   │
│   │   ├── kernel/                      # 📋 v0.9.16: Pure constants (zero deps)
│   │   │   ├── src/
│   │   │   │   ├── constants.ts         # Wire constants, error codes
│   │   │   │   ├── types.ts             # Core TypeScript types
│   │   │   │   └── errors.ts            # Error classes (PEACError)
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   │
│   │   ├── schema/ ✅                   # Type definitions & validators
│   │   │   ├── src/
│   │   │   │   ├── types.ts             # ✅ PEACReceiptClaims, NormalizedPayment
│   │   │   │   ├── validators.ts        # ✅ Zod schemas
│   │   │   │   ├── constants.ts         # ✅ PEAC_WIRE_TYP, PEAC_ALG
│   │   │   │   ├── index.ts             # ✅ Main exports
│   │   │   │   ├── control.ts           # 🔜 v0.9.15: ControlBlock types
│   │   │   │   └── payment.ts           # 🔜 v0.9.15: ExtendedPayment types
│   │   │   ├── schemas/
│   │   │   │   └── receipt.schema.json  # ✅ JSON Schema (RFC compliance)
│   │   │   ├── openapi/
│   │   │   │   └── verify.yaml          # ✅ OpenAPI 3.1 spec
│   │   │   ├── package.json             # ✅ @peac/schema v0.9.15
│   │   │   └── tsconfig.json
│   │   │
│   │   ├── crypto/ ✅                   # Cryptographic primitives
│   │   │   ├── src/
│   │   │   │   ├── jws.ts               # ✅ Ed25519 JWS signing (RFC 8032)
│   │   │   │   ├── jcs.ts               # ✅ JSON Canonicalization (RFC 8785)
│   │   │   │   ├── base64url.ts         # ✅ Base64url encoding (RFC 4648)
│   │   │   │   └── index.ts             # ✅ Main exports
│   │   │   ├── tests/
│   │   │   │   ├── jws.test.ts          # ✅ JWS signing/verification tests
│   │   │   │   ├── jcs.test.ts          # ✅ Canonicalization tests
│   │   │   │   └── base64url.test.ts    # ✅ Encoding tests
│   │   │   ├── package.json             # ✅ @peac/crypto v0.9.15
│   │   │   └── tsconfig.json
│   │   │
│   │   ├── protocol/ ✅                 # Core protocol logic
│   │   │   ├── src/
│   │   │   │   ├── issue.ts             # ✅ issueReceipt() with UUIDv7
│   │   │   │   ├── verify.ts            # ✅ verifyReceipt() with JWKS
│   │   │   │   ├── discovery.ts         # ✅ parseManifest() for peac.txt
│   │   │   │   ├── headers.ts           # ✅ HTTP header utilities
│   │   │   │   ├── index.ts             # ✅ Main exports
│   │   │   │   ├── dpop.ts              # 🔜 v0.9.15: DPoP L3/L4 (RFC 9449)
│   │   │   │   ├── ssrf-guard.ts        # 🔜 v0.9.15: SSRF protection
│   │   │   │   └── validation.ts        # 🔜 v0.9.15: Payment field rule
│   │   │   ├── tests/
│   │   │   │   ├── protocol.test.ts     # ✅ Issue/verify tests
│   │   │   │   ├── discovery.test.ts    # ✅ Discovery tests
│   │   │   │   ├── dpop.test.ts         # 🔜 v0.9.15: DPoP tests
│   │   │   │   └── ssrf.test.ts         # 🔜 v0.9.15: SSRF tests
│   │   │   ├── package.json             # ✅ @peac/protocol v0.9.15
│   │   │   └── tsconfig.json
│   │   │
│   │   ├── server/ ✅                   # HTTP server with /verify
│   │   │   ├── src/
│   │   │   │   ├── server.ts            # ✅ Express/Fastify server
│   │   │   │   ├── rate-limiter.ts      # ✅ Token bucket rate limiter
│   │   │   │   ├── circuit-breaker.ts   # ✅ Circuit breaker pattern
│   │   │   │   ├── cli.ts               # ✅ CLI entry point
│   │   │   │   ├── index.ts             # ✅ Main exports
│   │   │   │   └── slo.ts               # 🔜 v0.9.15: Session logout (/slo)
│   │   │   ├── package.json             # ✅ @peac/server v0.9.15
│   │   │   └── tsconfig.json
│   │   │
│   │   └── cli/ ✅                      # Command-line tools
│   │       ├── src/
│   │       │   ├── index.ts             # ✅ peac verify, peac gen-key
│   │       │   └── rotate-keys.ts       # 🔜 v0.9.15: peac rotate-keys
│   │       ├── package.json             # ✅ @peac/cli v0.9.15
│   │       └── tsconfig.json
│   │
│   ├── 🎛️ Control & Infrastructure
│   │   │
│   │   ├── control/                # 🔜 v0.9.15: Control Abstraction Layer
│   │   │   ├── src/
│   │   │   │   ├── interfaces.ts        # CAL engine-agnostic interfaces
│   │   │   │   ├── types.ts             # ControlBlock, ControlEngine types
│   │   │   │   ├── validators.ts        # Zod schemas for control{}
│   │   │   │   ├── test-helpers.ts      # CAL test utilities
│   │   │   │   └── index.ts             # Main exports
│   │   │   ├── tests/
│   │   │   │   └── control.test.ts      # CAL unit tests
│   │   │   ├── package.json             # @peac/control v0.9.15
│   │   │   └── tsconfig.json
│   │   │
│   │   └── infrastructure/              # Infrastructure utilities
│   │       ├── src/
│   │       │   ├── jwks-rotation.ts     # 🔜 v0.9.15: 90-day rotation
│   │       │   ├── outbox.ts            # 📋 v0.9.16: Outbox pattern
│   │       │   └── observability.ts     # 📋 v0.9.17: OpenTelemetry
│   │       ├── package.json             # @peac/infrastructure v0.9.15+
│   │       └── tsconfig.json
│   │
│   ├── 💳 Payment Rails
│   │   │
│   │   ├── rails/
│   │   │   ├── x402/ ✅                 # Lightning/x402 adapter (FIRST)
│   │   │   │   ├── src/
│   │   │   │   │   ├── index.ts         # ✅ x402 → NormalizedPayment
│   │   │   │   │   └── webhooks.ts      # ✅ Lightning webhook handlers
│   │   │   │   ├── tests/
│   │   │   │   │   └── x402.test.ts     # ✅ x402 adapter tests
│   │   │   │   ├── package.json         # ✅ @peac/rails-x402 v0.9.15
│   │   │   │   └── tsconfig.json
│   │   │   │
│   │   │   ├── stripe/ ✅               # Stripe adapter (production-grade)
│   │   │   │   ├── src/
│   │   │   │   │   ├── index.ts         # ✅ Stripe → NormalizedPayment
│   │   │   │   │   └── webhooks.ts      # ✅ Stripe webhook handlers
│   │   │   │   ├── tests/
│   │   │   │   │   └── stripe.test.ts   # ✅ Stripe adapter tests
│   │   │   │   ├── package.json         # ✅ @peac/rails-stripe v0.9.15
│   │   │   │   └── tsconfig.json
│   │   │   │
│   │   │   └── razorpay/                # 📋 v0.9.19: India-focused adapter
│   │   │       ├── src/
│   │   │       │   ├── index.ts         # Razorpay → NormalizedPayment
│   │   │       │   └── webhooks.ts      # UPI, cards, netbanking
│   │   │       ├── tests/
│   │   │       │   └── razorpay.test.ts
│   │   │       ├── package.json         # @peac/rails-razorpay v0.9.19
│   │   │       └── tsconfig.json
│   │
│   ├── 🔗 Protocol Mappings
│   │   │
│   │   ├── mappings/
│   │   │   ├── mcp/ ✅                  # Model Context Protocol (Anthropic)
│   │   │   │   ├── src/
│   │   │   │   │   ├── index.ts         # ✅ MCP → PEAC mapping
│   │   │   │   │   └── vectors.ts       # ✅ MCP golden vectors
│   │   │   │   ├── tests/
│   │   │   │   │   └── mcp.test.ts      # ✅ MCP conformance tests
│   │   │   │   ├── package.json         # ✅ @peac/mappings-mcp v0.9.15
│   │   │   │   └── tsconfig.json
│   │   │   │
│   │   │   ├── acp/ ✅                  # Agentic Commerce Protocol (OpenAI/Stripe)
│   │   │   │   ├── src/
│   │   │   │   │   ├── index.ts         # ✅ ACP → PEAC mapping
│   │   │   │   │   └── vectors.ts       # ✅ ACP golden vectors
│   │   │   │   ├── tests/
│   │   │   │   │   └── acp.test.ts      # ✅ ACP conformance tests
│   │   │   │   ├── package.json         # ✅ @peac/mappings-acp v0.9.15
│   │   │   │   └── tsconfig.json
│   │   │   │
│   │   │   ├── ap2/                     # 📋 v0.9.16: Google AP2 (mandate metadata)
│   │   │   │   ├── src/
│   │   │   │   │   ├── index.ts         # AP2 mandate → control{} + payment{}
│   │   │   │   │   └── vectors.ts       # AP2 golden vectors
│   │   │   │   ├── tests/
│   │   │   │   │   └── ap2.test.ts      # AP2 conformance tests
│   │   │   │   ├── package.json         # @peac/mappings-ap2 v0.9.16
│   │   │   │   └── tsconfig.json
│   │   │   │
│   │   │   ├── tap/                     # 📋 v0.9.17: Visa TAP (agent auth)
│   │   │   │   ├── src/
│   │   │   │   │   ├── index.ts         # TAP → control{} evidence
│   │   │   │   │   └── vectors.ts       # TAP golden vectors
│   │   │   │   ├── tests/
│   │   │   │   │   └── tap.test.ts      # TAP conformance tests
│   │   │   │   ├── package.json         # @peac/mappings-tap v0.9.17
│   │   │   │   └── tsconfig.json
│   │   │   │
│   │   │   └── a2a/                     # 📋 v0.9.18: Agent-to-Agent
│   │   │       ├── src/index.ts
│   │   │       └── package.json
│   │
│   ├── 🚀 Transport Abstraction Layer (TAL)
│   │   │
│   │   ├── transport/
│   │   │   ├── http/                    # ✅ HTTP/1.1, HTTP/2, HTTP/3 (implicit)
│   │   │   │   ├── src/
│   │   │   │   │   └── index.ts         # PEAC-Receipt header handling
│   │   │   │   └── package.json         # @peac/transport-http v0.9.15
│   │   │   │
│   │   │   ├── grpc/                    # 📋 v0.9.20: gRPC transport
│   │   │   │   ├── src/
│   │   │   │   │   ├── index.ts         # Metadata carriage (peac-receipt)
│   │   │   │   │   └── interceptor.ts   # gRPC interceptor
│   │   │   │   ├── tests/
│   │   │   │   │   └── grpc.test.ts
│   │   │   │   ├── package.json         # @peac/transport-grpc v0.9.20
│   │   │   │   └── tsconfig.json
│   │   │   │
│   │   │   └── ws/                      # 📋 v0.9.20: WebSocket transport
│   │   │       ├── src/
│   │   │       │   ├── index.ts         # Handshake header + first message
│   │   │       │   └── refresh.ts       # Receipt refresh flow
│   │   │       ├── tests/
│   │   │       │   └── ws.test.ts
│   │   │       ├── package.json         # @peac/transport-ws v0.9.20
│   │   │       └── tsconfig.json
│   │
│   ├── 🎨 Distribution & Integrations
│   │   │
│   │   ├── surfaces/
│   │   │   ├── plugins/
│   │   │   │   ├── wordpress/           # 📋 v0.9.16: WordPress plugin
│   │   │   │   │   ├── src/
│   │   │   │   │   │   ├── admin-ui.php # Admin UI (Settings → PEAC)
│   │   │   │   │   │   ├── verify.php   # /wp-json/peac/v1/verify
│   │   │   │   │   │   └── dashboard-widget.php
│   │   │   │   │   ├── assets/
│   │   │   │   │   ├── package.json
│   │   │   │   │   └── plugin-header.php
│   │   │   │   │
│   │   │   │   └── vercel/              # 📋 v0.9.17: Vercel middleware
│   │   │   │       ├── src/
│   │   │   │       │   └── index.ts     # @peac/nextjs withPEAC()
│   │   │   │       └── package.json
│   │   │   │
│   │   │   ├── workers/
│   │   │   │   └── cloudflare/          # 📋 v0.9.16: Edge verifier
│   │   │   │       ├── src/
│   │   │   │       │   └── index.ts     # Lightweight verify (<5ms p95)
│   │   │   │       └── wrangler.toml
│   │   │   │
│   │   │   └── langchain/               # 📋 v0.9.18: LangChain toolkit
│   │   │       ├── python/
│   │   │       │   └── peac_langchain/
│   │   │       │       ├── toolkit.py   # PeacTool base class
│   │   │       │       └── __init__.py
│   │   │       └── typescript/
│   │   │           └── src/index.ts
│   │
│   ├── 📚 SDKs
│   │   │
│   │   └── sdks/
│   │       ├── typescript/              # ✅ TypeScript SDK
│   │       │   ├── src/
│   │       │   │   ├── client.ts        # PEACClient class
│   │       │   │   └── index.ts
│   │       │   ├── package.json         # @peac/sdk v0.9.15
│   │       │   └── tsconfig.json
│   │       │
│   │       ├── python/                  # ✅ Python SDK
│   │       │   ├── peac/
│   │       │   │   ├── client.py        # PEACClient class
│   │       │   │   └── __init__.py
│   │       │   ├── setup.py
│   │       │   └── pyproject.toml
│   │       │
│   │       └── go/                      # 📋 v0.9.21: Go SDK (for IETF)
│   │           ├── client.go
│   │           └── go.mod
│   │
│   └── 🏛️ Advanced Pillars (Post-v1.0)
│       │
│       ├── compliance/                  # 📋 Post-v1.0 (v1.1+)
│       │   ├── src/
│       │   │   ├── eu-ai-act.ts        # EU AI Act exports
│       │   │   ├── soc2.ts             # SOC2 compliance
│       │   │   └── hipaa.ts            # HIPAA compliance
│       │   └── package.json
│       │
│       ├── consent/                     # 📋 Post-v1.0 (v1.1+)
│       │   ├── src/
│       │   │   ├── consent-manager.ts  # GDPR/CCPA lifecycle
│       │   │   └── revocation.ts       # Consent revocation
│       │   └── package.json
│       │
│       ├── attribution/                 # 📋 Post-v1.0 (v1.2+)
│       │   ├── src/
│       │   │   ├── c2pa.ts             # C2PA integration
│       │   │   └── royalty-splits.ts   # Royalty tracking
│       │   └── package.json
│       │
│       └── intelligence/                # 📋 Post-v1.0 (v1.2+)
│           ├── src/
│           │   ├── price-discovery.ts  # k-anonymity pricing
│           │   └── fraud-detection.ts  # Fraud heuristics
│           └── package.json
│
├── 🧪 tests/                            # Test infrastructure
│   ├── vectors/
│   │   └── negative.spec.ts            # ✅ 14 attack scenarios
│   ├── performance/
│   │   └── verify.bench.ts             # ✅ p95 ≤ 5ms gate
│   ├── conformance/
│   │   ├── parity.spec.ts              # ✅ x402 == Stripe parity
│   │   ├── dpop.spec.ts                # 🔜 v0.9.15: DPoP L3/L4 tests
│   │   └── golden.spec.ts              # 📋 v0.9.16: Golden vectors
│   └── integration/
│       ├── e2e.spec.ts                 # 📋 v0.9.17: End-to-end tests
│       └── interop.spec.ts             # 📋 v0.9.18: Cross-mapping tests
│
├── 🚀 apps/                             # Example applications
│   ├── demo-api/                       # ✅ Demo API with PEAC
│   │   └── src/
│   └── validator-web/                  # ✅ Web-based validator
│       └── src/
│
├── 🛠️ scripts/                          # Automation scripts
│   ├── ci/
│   │   ├── forbid-strings.sh           # ✅ Forbidden string guard
│   │   └── surface-validator.sh        # ✅ Surface validator
│   ├── codegen/
│   │   └── generate-vectors.ts         # 📋 v0.9.16: Vector generation
│   └── evidence/
│       └── generate-evidence.ts        # 📋 v0.9.17: Evidence generation
│
├── 📚 docs/                             # Documentation
│   ├── strategy/                       # ✅ Strategy docs
│   ├── api/                            # 📋 v0.9.16: API reference
│   ├── guides/                         # 📋 v0.9.16: User guides
│   │   ├── getting-started.md
│   │   ├── jwks-rotation.md           # 🔜 v0.9.15
│   │   └── dpop-l3-l4.md              # 🔜 v0.9.15
│   └── specs/                          # 📋 v0.9.21: IETF specs
│       ├── draft-peac-receipts-00.xml
│       └── IANA-REQUESTS.md
│
├── 📖 materplan/                        # 40+ masterplan documents
│   ├── 00_START_HERE.md
│   ├── EXECUTION_ROADMAP_12_WEEKS.md
│   ├── STATUS.md
│   ├── PEAC_v1.0_DEFINITIVE_MASTER_PLAN.md
│   └── ... (40+ docs)
│
├── 📄 Root Files
│   ├── COMPLETE_ROADMAP_ANALYSIS.md    # ✅ Full roadmap
│   ├── QUICK_START_REFERENCE.md        # ✅ Quick reference
│   ├── LEGACY_VS_NEW_COMPARISON.md     # ✅ Coverage analysis
│   ├── GITHUB_AUDIT_REPORT.md          # ✅ Historical audit
│   ├── IMPLEMENTATION_STATUS.md        # ✅ Week 0 status
│   ├── README.md                       # ✅ Main README
│   ├── LICENSE                         # ✅ Apache 2.0
│   ├── package.json                    # ✅ Monorepo config
│   ├── tsconfig.json                   # ✅ TypeScript config
│   └── .gitignore
│
└── 🔧 CI/CD
    └── .github/
        └── workflows/
            ├── ci.yml                  # ✅ CI pipeline
            ├── performance.yml         # ✅ Performance gates
            └── conformance.yml         # ✅ Conformance gates
```

---

## 📊 Package Statistics

### Week 0 (✅ COMPLETE)

- **Total Packages:** 9
- **Lines of Code:** ~4,100
- **Files:** 36
- **Test Suites:** 10

### v0.9.15 Target (🔜 NEXT)

- **New Packages:** +2 (control, infrastructure enhancements)
- **New LOC:** ~1,700
- **New Files:** ~25
- **Duration:** 3-4.5 weeks

### v0.9.21 Target (📋 FUTURE)

- **Total Packages:** 25+
- **Total LOC:** ~14,500
- **Total Files:** 200+
- **Test Suites:** 70+
- **Duration:** 16-22.5 weeks from Week 0

---

## 🎯 Key Package Dependencies

```
@peac/kernel (pure, zero deps)
    ↓
@peac/schema (depends on kernel)
    ↓
@peac/crypto (depends on schema)
    ↓
@peac/protocol (depends on crypto, schema)
    ↓
┌───┴───────────────────────────────┐
│                                   │
@peac/server                  @peac/control
(depends on protocol)         (depends on schema)
    ↓                              ↓
@peac/cli                     @peac/mappings-*
                              (depends on control)
                                   ↓
                              @peac/rails-*
                              (depends on mappings)
```

---

## 🚦 CI/CD Pipeline

### Gates (All Releases)

```yaml
Performance:
  - Verify p95 ≤ 5ms ✅
  - Sign p95 < 10ms ✅
  - Throughput ≥1k rps ✅

Conformance:
  - Rail parity (x402 == Stripe) ✅
  - Negative vectors (14 attack scenarios) ✅
  - Protocol mapping parity 🔜 v0.9.16
  - OWASP baseline clean 🔜 v0.9.15

Security:
  - No HIGH/CRITICAL vulnerabilities 🔜 v0.9.15
  - Dependency audit clean 🔜 v0.9.15
  - SSRF protection verified 🔜 v0.9.15
  - DPoP L3/L4 tests passing 🔜 v0.9.15
```

---

## 📈 Growth Trajectory

```
Week 0 (v0.9.14)          9 packages    ~4,100 LOC
    ↓
v0.9.15 (CAL + Security)  11 packages   ~5,800 LOC
    ↓
v0.9.16 (AP2 + Distribution) 14 packages ~8,000 LOC
    ↓
v0.9.17 (TAP + Vercel)    16 packages   ~9,500 LOC
    ↓
v0.9.18 (LangChain)       18 packages   ~11,000 LOC
    ↓
v0.9.19 (Razorpay + Examples) 20 packages ~13,100 LOC
    ↓
v0.9.20 (TAL: gRPC + WS)  22 packages   ~14,500 LOC
    ↓
v0.9.21 (RFC-Ready)       25+ packages  ~14,500 LOC (feature freeze)
    ↓
v1.0 (EARNED)             Wire format flip to peac.receipt/1.0
    ↓
v1.1-v1.2 (Post-v1.0)     32+ packages  ~20,000 LOC (advanced pillars)
```

---

## 🎨 Code Organization Principles

### 1. **Layered Architecture**

- Layer 1 (Crypto) → Layer 2 (Rails + CAL) → Layer 3 (Protocol) → Layer 4 (TAL) → Layer 5 (Mappings) → Layer 6 (Distribution) → Layer 7 (Apps)

### 2. **Zero-Dependency Kernel**

- `@peac/kernel` has ZERO dependencies
- All other packages depend on kernel for constants/types

### 3. **Rail Neutrality**

- All payment rails produce byte-identical `NormalizedPayment` (except scheme, reference, metadata)
- Parity tests enforce neutrality (x402 == Stripe == Razorpay)

### 4. **Protocol Mapping Consistency**

- All protocol mappings (MCP, ACP, AP2, TAP) produce byte-identical core claims
- Golden vectors validate consistency

### 5. **Transport Agnostic**

- Core protocol works with HTTP, gRPC, WebSocket
- Transport Abstraction Layer (TAL) handles transport-specific details

---

## 🔐 Security Architecture

### Defense in Depth

1. **Input Validation** (schema package with Zod)
2. **SSRF Protection** (protocol package, v0.9.15)
3. **DPoP L3/L4** (protocol package, v0.9.15)
4. **Rate Limiting** (server package)
5. **Circuit Breaker** (server package)
6. **Signature Verification** (crypto package)
7. **JWKS Rotation** (infrastructure package, v0.9.15)

### Attack Surface Minimization

- ✅ No X-PEAC aliases (single header: PEAC-Receipt)
- ✅ HTTPS-only (except localhost)
- 🔜 Private IP blocking
- 🔜 Metadata URL blocking (169.254.169.254)
- 🔜 5-second discovery timeout

---

## 📋 Next Actions

### Week 1 (Starting Now)

1. 🔜 Create `packages/control` package
2. 🔜 Add control{} types to `packages/schema`
3. 🔜 Implement DPoP L3/L4 in `packages/protocol`
4. 🔜 Add SSRF protection in `packages/protocol`

### Week 2

5. 🔜 Implement JWKS rotation in `packages/infrastructure`
6. 🔜 Add /slo endpoint in `packages/server`
7. 🔜 Enforce payment field rule
8. 🔜 Update documentation

### Week 3-4

9. 🔜 Integration testing
10. 🔜 Performance optimization
11. 🔜 Documentation polish
12. 🔜 v0.9.15 release preparation

---

**Document Version:** v1.1
**Last Updated:** 2025-11-18 IST
**Status:** ⚠️ OUTDATED - Shows original v0.9.15 plan (CAL). Actual v0.9.15 was Naming/Neutrality. This architecture spans v0.9.15-v0.9.21.
