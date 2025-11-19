# PEAC Protocol - Normative Decisions Log

**Purpose**: Authoritative record of all architectural and design decisions
**Last Updated**: 2025-11-18 IST
**Status**: Living document - append new decisions at top

---

## Decision Format

Each decision follows this structure:
- **ID**: Unique identifier (DEC-YYYYMMDD-NNN)
- **Date**: When decision was made
- **Status**: ACCEPTED | REJECTED | SUPERSEDED | DEPRECATED
- **Context**: Why decision was needed
- **Decision**: What was decided
- **Rationale**: Why this choice was made
- **Consequences**: Impact on codebase/protocol
- **Alternatives Considered**: Other options evaluated
- **Related**: Links to other decisions or docs

---

## DECISIONS (Reverse Chronological)

### DEC-20251118-010: Protocol Must Operate on PEACEnvelope
**Date**: 2025-11-18
**Status**: ACCEPTED
**Context**: Issue and verify functions construct envelope-like structures but don't explicitly use PEACEnvelope type, creating ambiguity for implementers.

**Decision**: Protocol layer (issue/verify) must explicitly use PEACEnvelope as canonical structure:
1. issueReceipt() returns typed PEACEnvelope
2. verifyReceipt() accepts typed PEACEnvelope
3. All protocol logic operates on auth/evidence/meta blocks explicitly
4. Wire format is serialization of PEACEnvelope per JSON Schema

**Rationale**:
- Eliminates "shape compatible" ambiguity
- Makes spec-code alignment unambiguous for other language implementations
- Ensures envelope structure is canonical, not incidental
- Prevents drift between protocol behavior and envelope definition

**Consequences**:
- Protocol functions have explicit envelope types
- Better IDE autocomplete and type safety
- Clearer contract for multi-language implementations
- Minor API refinement (return types more specific)

**Alternatives Considered**:
- Keep implicit shape compatibility: rejected (too ambiguous)
- Introduce separate "SignedEnvelope" wrapper: deferred to future

**Related**: DEC-20251118-007 (kernel architecture)

---

### DEC-20251118-009: Evidence Validation Responsibilities for Rails
**Date**: 2025-11-18
**Status**: ACCEPTED
**Context**: Rails accept external payloads (webhooks, callbacks) and map to PaymentEvidence. Need clear contract for validation to prevent garbage-in-garbage-out.

**Decision**: Rail adapters MUST validate evidence before producing PaymentEvidence:
1. Each rail defines strict Zod schemas for inbound payloads
2. Validation happens at entrypoint, before any mapping
3. Rails fail closed on invalid evidence (throw, never return bad PaymentEvidence)
4. Negative test vectors required for each rail

**Rationale**:
- PaymentEvidence is generic by design (supports many rails)
- Validation specificity must live in rail adapters
- Fail-closed prevents protocol layer from processing malformed data
- Makes security contract explicit and testable

**Consequences**:
- x402 and stripe packages add strict input validation
- New rail implementations must include validation + negative tests
- Clear responsibility boundary: rails validate, protocol consumes
- Improved security posture

**Alternatives Considered**:
- Validate in protocol layer: rejected (too late, wrong layer)
- Make PaymentEvidence more specific: rejected (breaks rail neutrality)

**Related**: DEC-20251118-007 (kernel architecture)

---

### DEC-20251118-008: Constraint Extension Point (CustomConstraint)
**Date**: 2025-11-18
**Status**: ACCEPTED
**Context**: Four built-in constraint types (Temporal, Usage, Budget, Combined) cover core use cases, but vendors need experimentation path without forking schema.

**Decision**: Add CustomConstraint as official extension mechanism:
1. New constraint kind: "custom" with namespaced ID and vendor payload
2. Core enforcement treats CustomConstraint as informational (no built-in semantics)
3. Control engines may enforce out-of-band
4. IDs follow namespace convention (vendor.example/feature-name)

**Rationale**:
- Keeps core spec clean and vendor-neutral
- Provides official escape hatch for experimentation
- Prevents schema fragmentation
- No impact on core conformance

**Consequences**:
- Constraint union extended with CustomConstraint type
- JSON Schema updated to include custom branch
- Specs document extension mechanism explicitly
- Tests verify core ignores custom constraints safely

**Alternatives Considered**:
- No extension point: rejected (forces forking)
- Fully vendor-specific constraints array: rejected (too unstructured)
- Registry-based validation: deferred to v1.0+

**Related**: DEC-20251118-007 (kernel architecture)

---

### DEC-20251118-007: Kernel-First Architecture with specs/kernel
**Date**: 2025-11-18
**Status**: ACCEPTED
**Context**: Need single source of truth for constants, errors, and registries to prevent drift between code and specifications as protocol evolves toward IETF standardization.

**Decision**: Establish kernel-first architecture with normative JSON specs:
1. Create `specs/kernel/` with constants.json, errors.json, registries.json as normative sources
2. Create `packages/kernel/` to provide TypeScript exports derived from specs
3. Rewire core packages (@peac/schema, @peac/protocol, @peac/control, @peac/crypto) to import from @peac/kernel
4. Manual sync for v0.9.15, automated codegen for v0.9.16+

**Rationale**:
- Specifications must be the source of truth, not code
- JSON format enables machine-readable validation and multi-language codegen
- Prevents hardcoded constants scattered across packages
- Aligns with IETF best practices (normative specs, reference implementations)
- Enables automated parity checks between specs and code
- Prepares for future registries (payment rails, control engines, transport methods, agent protocols)

**Consequences**:
- All constants/errors must be defined in specs/kernel/*.json first
- Breaking change: some constants moved from packages to @peac/kernel
- Requires version bump in kernel specs on any change
- Improves maintainability and reduces drift
- Simplifies multi-language SDK development (single spec source)
- CI gates can enforce spec-code parity (v0.9.16+)

**Alternatives Considered**:
1. **Status quo (hardcoded constants)**: Rejected - unsustainable for IETF process
2. **Code-first with reflection**: Rejected - doesn't solve multi-language problem
3. **TypeScript-only kernel**: Rejected - TypeScript isn't protocol-neutral
4. **Full codegen in v0.9.15**: Deferred to v0.9.16 to minimize scope

**Related**:
- specs/kernel/README.md - Kernel spec contract
- DEC-20250118-006 - v0.9.15 scope decision
- Future: scripts/codegen/generate-kernel.ts (v0.9.16)

---

### DEC-20250118-006: v0.9.15 Scope Change - Naming First
**Date**: 2025-01-18
**Status**: ACCEPTED
**Context**: Originally v0.9.15 was scoped for CAL + Security Hardening, but naming and vendor neutrality issues needed resolution first.
**Decision**: Re-scope v0.9.15 to focus on:
1. Package rename (control-core → control)
2. Payment terminology (scheme → rail)
3. Vendor neutrality (remove vendor unions)
4. Envelope type alignment
5. Constraint renaming (Mandate → Constraint)

Move CAL + Security work to v0.9.16.

**Rationale**:
- Adoption is near-zero, breaking changes have minimal impact now
- Naming is foundational - deferring compounds migration complexity
- Vendor neutrality blocks clean adapter development
- Clean separation: naming (v0.9.15) vs features (v0.9.16+)

**Consequences**:
- v0.9.15 becomes a pure refactoring/naming release
- CAL + Security timeline pushed by ~1 release cycle
- All future development starts from clean, vendor-neutral base
- Migration window provided via deprecated aliases

**Alternatives Considered**:
1. Keep original scope → Rejected (would ship vendor-specific names)
2. Split into two releases (v0.9.15a, v0.9.15b) → Rejected (unnecessary complexity)
3. Do naming in v0.9.16 → Rejected (breaks semver expectations)

**Related**: PEAC_v0.9.15_ACTUAL_SCOPE.md, v0.9.15_NAMING_AND_NEUTRALITY_SUMMARY.md

---

### DEC-20250118-005: Constraint Over Mandate Terminology
**Date**: 2025-01-18
**Status**: ACCEPTED
**Context**: Control package used "Mandate" terminology which:
- Was Locus-specific (our original internal name)
- Implied legal mandate vs technical constraint
- Confused users about purpose (informational helpers, not enforcement rules)

**Decision**: Rename all Mandate types to Constraint types:
- `Mandate` → `Constraint`
- `TemporalMandate` → `TemporalConstraint`
- `UsageMandate` → `UsageConstraint`
- `BudgetMandate` → `BudgetConstraint`
- `CombinedMandate` → `CombinedConstraint`
- `EnforcementResult` → `ConstraintEnforcementResult`

Plus all related functions, validators, and schemas.

**Rationale**:
- "Constraint" is vendor-neutral and domain-agnostic
- Clarifies these are informational helpers, not protocol-enforced rules
- Aligns with industry standard terminology
- Removes Locus-specific language from core

**Consequences**:
- Breaking change for control package consumers
- Requires deprecated aliases for migration window (v0.9.15-v0.9.17)
- Clearer API for future adopters
- Removes vendor association

**Alternatives Considered**:
1. Keep "Mandate" → Rejected (vendor-specific)
2. Use "Limit" → Rejected (too narrow, doesn't cover temporal)
3. Use "Policy" → Rejected (conflicts with policy_uri in auth context)

**Related**: DEC-20250118-006, packages/control/src/constraints.ts

---

### DEC-20250118-004: Payment "rail" Over "scheme"
**Date**: 2025-01-18
**Status**: ACCEPTED
**Context**: Used "scheme" for payment method identifier, but:
- Conflicts with URI scheme terminology
- Doesn't convey HTTP 402 layering model clearly
- "Scheme" implies protocol, not settlement rail

**Decision**: Rename `scheme` to `rail` everywhere:
- Field name: `payment.scheme` → `payment.rail`
- Type name: `PaymentScheme` → `PaymentRailId`
- Variable names updated across codebase

**Rationale**:
- "Rail" accurately describes settlement layer (card rail, crypto rail, L402 rail)
- Avoids confusion with URI schemes, URL schemes, auth schemes
- Aligns with financial industry terminology (payment rails)
- Clearer in HTTP 402 layering: HTTP → 402 → Rail → Crypto/Fiat

**Consequences**:
- Breaking change for all payment-related code
- Requires deprecated alias `PaymentScheme` for migration
- Clearer documentation and examples
- Better industry alignment

**Alternatives Considered**:
1. Keep "scheme" → Rejected (confusing)
2. Use "method" → Rejected (conflicts with HTTP methods)
3. Use "provider" → Rejected (implies vendor, not neutral)
4. Use "channel" → Considered, but "rail" better conveys settlement layer

**Related**: DEC-20250118-006, packages/schema/src/evidence.ts

---

### DEC-20250118-003: Package Rename - Remove "-core" Suffix
**Date**: 2025-01-18
**Status**: ACCEPTED
**Context**: Package named `@peac/control-core` had `-core` suffix that:
- Suggested existence of non-core variant (doesn't exist)
- Violated naming convention (no other packages have -core)
- Created confusion about package purpose

**Decision**: Rename `@peac/control-core` to `@peac/control`

**Rationale**:
- Consistency with other packages (@peac/schema, @peac/crypto, @peac/protocol)
- Simpler, cleaner name
- No planned "non-core" variant
- Package IS the core control functionality

**Consequences**:
- Breaking change for importers
- All imports must change: `from '@peac/control-core'` → `from '@peac/control'`
- Directory rename required
- 14+ files updated across codebase

**Alternatives Considered**:
1. Keep @peac/control-core → Rejected (inconsistent naming)
2. Rename to @peac/cal → Rejected (CAL is protocol feature, not package name)
3. Rename to @peac/governance → Rejected (too broad)

**Related**: DEC-20250118-006

---

### DEC-20250118-002: Vendor Neutrality in Core Packages
**Date**: 2025-01-18
**Status**: ACCEPTED
**Context**: Core packages contained hardcoded vendor names in type unions:
```typescript
export type PaymentScheme = "stripe" | "razorpay" | "x402" | string;
export type AgentProtocol = "mcp" | "acp" | "ap2" | string;
```

This violated vendor neutrality principles and created false precedence.

**Decision**: Remove ALL vendor names from core packages:
- Use opaque string types: `PaymentRailId = string`, `AgentProtocolId = string`
- Move vendor names to:
  - `docs/specs/registries.json` (informational registry)
  - Adapter packages: `@peac/rails-*`, `@peac/engines-*`
  - Examples and documentation
- Treat all rails/protocols equally (no hardcoded list)

**Rationale**:
- Core protocol must be vendor-neutral
- Hardcoding vendors creates false "blessed" list
- Extensibility: new vendors shouldn't require core changes
- Equal treatment: x402 = Stripe = Razorpay = any future rail
- Registry-based discovery over hardcoded enums

**Consequences**:
- Breaking change: vendor unions removed
- Better extensibility for new rails/protocols
- Clearer separation: core (neutral) vs adapters (vendor-specific)
- Verification: `grep -r "stripe\|razorpay\|locus" packages/*/src` must return no matches

**Alternatives Considered**:
1. Keep vendor unions → Rejected (violates neutrality)
2. Use branded types → Rejected (still hardcodes names)
3. Plugin registry at runtime → Deferred (future consideration)

**Related**: DEC-20250118-006, docs/ARCHITECTURE_VENDOR_NEUTRALITY.md

---

### DEC-20250118-001: Envelope Types Match JSON Schema
**Date**: 2025-01-18
**Status**: ACCEPTED
**Context**: TypeScript types didn't match normative JSON Schema structure. Original types had flat receipt structure; JSON Schema uses 3-layer envelope (auth, evidence, meta).

**Decision**: Create TypeScript types that exactly match normative JSON Schema:
- Add `packages/schema/src/envelope.ts` with:
  - `PEACEnvelope` (auth, evidence, meta)
  - `AuthContext` (all auth fields)
  - `EvidenceBlock` (payment, attestation, payments)
  - `MetadataBlock` (redactions, privacy_budget, debug)
- Export from `@peac/schema`
- Protocol refactor to use envelope types: DEFERRED to v0.9.16+

**Rationale**:
- JSON Schema is normative source of truth
- TypeScript types should match canonical structure
- Enables type-safe envelope construction
- Future: protocol package will use envelope types directly

**Consequences**:
- New file created: packages/schema/src/envelope.ts
- Types available for import in v0.9.15
- Protocol migration work deferred (not breaking yet)
- Dual structure temporarily (old flat + new envelope)

**Alternatives Considered**:
1. Generate types from JSON Schema → Deferred (tooling complexity)
2. Refactor protocol immediately → Rejected (too much scope for v0.9.15)
3. Skip envelope types → Rejected (needed for future work)

**Related**: DEC-20250118-006, packages/schema/src/envelope.ts

---

### DEC-20241026-003: Wire Format Freeze at v0.9
**Date**: 2024-10-26
**Status**: ACCEPTED
**Context**: Need stability for early adopters while still allowing breaking changes during development.

**Decision**: Freeze wire format at `peac.receipt/0.9` throughout v0.9.14 → v0.9.21. Only flip to `peac.receipt/1.0` at GA (after v1.0 is earned).

**Rationale**:
- Signals "development version" vs "production version"
- Allows breaking changes during 0.9.x
- Clear signal when protocol is GA-ready
- Early adopters understand risks

**Consequences**:
- Wire format stays `peac.receipt/0.9` through ~7 releases
- Breaking changes allowed in v0.9.x (with migration guides)
- v1.0 earned only after IETF process and multi-implementation

**Alternatives Considered**:
1. Increment wire version with each release → Rejected (churn)
2. Use v0.9.x in wire format → Rejected (false precision)
3. Start at v1.0 immediately → Rejected (premature)

**Related**: COMPLETE_ROADMAP_ANALYSIS.md

---

### DEC-20241026-002: No v1.0 Date Commitment
**Date**: 2024-10-26
**Status**: ACCEPTED
**Context**: Need to balance shipping cadence with quality and standardization requirements.

**Decision**: v1.0 is **earned** after IETF draft and multi-implementation consensus, not date-based. RFC-ready at v0.9.21, but v1.0 only when criteria met:
- IETF Internet-Draft submitted and reviewed
- Multi-implementation consensus (≥2 independent implementations)
- Community feedback incorporated
- Security audit complete
- Production battle-testing complete

**Rationale**:
- Quality over calendar commitments
- IETF process timeline uncertain
- Need real-world validation before claiming v1.0
- v1.0 carries weight - must be earned

**Consequences**:
- Development stays on v0.9.x longer than typical projects
- Clear milestone at v0.9.21 (RFC-ready)
- No pressure to ship v1.0 prematurely
- Market positioning: honest about maturity

**Alternatives Considered**:
1. Commit to v1.0 date → Rejected (unrealistic)
2. Ship v1.0 at RFC-ready → Rejected (premature)
3. Skip v1.0 entirely → Rejected (industry expects v1.0)

**Related**: COMPLETE_ROADMAP_ANALYSIS.md

---

### DEC-20241026-001: PEAC-Receipt Header Name (Final)
**Date**: 2024-10-26
**Status**: ACCEPTED, SUPERSEDES ALL PREVIOUS HEADER NAMING DECISIONS
**Context**: Header naming had multiple revisions. Need final, authoritative decision.

**Decision**: Use **PEAC-Receipt** as the ONLY HTTP field name during v0.9.x development and beyond. No X-PEAC aliases will be shipped. All examples and tests use PEAC-Receipt exclusively.

**Rationale**:
- Clear, descriptive name
- Follows RFC 9110 (Custom Header Fields)
- Avoids X- prefix deprecation issues
- Single name = less confusion
- Aligns with PEAC-Issuer, PEAC-Policy pattern

**Consequences**:
- All code, docs, tests use PEAC-Receipt
- No fallback to X-PEAC-Receipt
- Clearer API surface
- Documentation consistency

**Alternatives Considered**:
1. X-PEAC-Receipt → Rejected (X- prefix deprecated per RFC 6648)
2. Payment-Receipt → Rejected (too generic)
3. HTTP-402-Receipt → Rejected (not all PEAC is 402)
4. Support both PEAC-Receipt and X-PEAC-Receipt → Rejected (complexity)

**Related**: All HTTP integration code, docs/specs/PROTOCOL-BEHAVIOR.md

---

## DECISION CATEGORIES

### Naming & Terminology
- DEC-20250118-006: v0.9.15 Scope Change
- DEC-20250118-005: Constraint Over Mandate
- DEC-20250118-004: Payment "rail" Over "scheme"
- DEC-20250118-003: Package Rename
- DEC-20241026-001: PEAC-Receipt Header Name

### Architecture & Design
- DEC-20250118-002: Vendor Neutrality
- DEC-20250118-001: Envelope Types
- DEC-20241026-003: Wire Format Freeze

### Process & Release
- DEC-20241026-002: No v1.0 Date Commitment

---

## FUTURE DECISIONS TO DOCUMENT

When making new decisions, capture:
1. **MCP/ACP/AP2/TAP treatment** - Registry vs hardcoded (ACCEPTED: registry-based per DEC-20250118-002)
2. **Control block structure** - When CAL is implemented in v0.9.16
3. **DPoP L3/L4 specifics** - When security hardening begins
4. **JWKS rotation schedule** - When implemented
5. **Discovery invariants** - AIPREF mandatory, peac.txt limits
6. **Payment field rules** - Precise validation logic
7. **Session logout (SLO)** - Redis blacklist approach
8. **SSRF protection details** - IP ranges, timeouts, URL validation

---

## SUPERSEDED DECISIONS

(None yet - this is the initial decision log)

When decisions are superseded, move them here with:
- Original decision ID
- Date superseded
- What superseded it
- Link to new decision

---

## DECISION REVIEW PROCESS

1. **New Decision Needed**: Identify architectural choice point
2. **Research**: Gather context, evaluate alternatives
3. **Document**: Write decision using template above
4. **Review**: Discuss with stakeholders (if applicable)
5. **Commit**: Add to this log with unique ID
6. **Communicate**: Reference in relevant code/docs
7. **Track**: Monitor consequences, revise if needed

---

**Maintainer**: PEAC Protocol Team
**Review Cadence**: Before each release (verify decisions still valid)
**Format**: Markdown, reverse chronological order
**Storage**: `docs/PEAC_NORMATIVE_DECISIONS_LOG.md` (this file)
