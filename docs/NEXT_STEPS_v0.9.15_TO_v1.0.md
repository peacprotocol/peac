# PEAC Protocol - Next Steps (v0.9.15 → v1.0)

**Last Updated**: 2025-11-18 IST
**Current Version**: v0.9.15 (CODE COMPLETE, not yet committed)
**Purpose**: Comprehensive guide for continuing PEAC development

---

## IMMEDIATE NEXT STEPS (v0.9.15 Commit & Release)

### 1. Code Review & Verification ✅

- [x] All builds passing
- [x] Vendor neutrality verified
- [x] Documentation complete
- [ ] **Manual review** of all changes
- [ ] **Cross-check** migration guide accuracy

### 2. Git Commit

See git commit history for v0.9.15 release details.

### 3. Tag Release

```bash
# Create annotated tag
git tag -a v0.9.15 -m "v0.9.15: Naming + Vendor Neutrality + Envelope Alignment

Breaking release focused on foundational cleanup.
See docs/notes/v0.9.15_NAMING_AND_NEUTRALITY_SUMMARY.md for migration guide.

Wire format: peac.receipt/0.9 (unchanged)
Deprecated aliases: Available until v0.9.17
"

# Verify tag
git tag -n9 v0.9.15
```

### 4. Update package.json Versions

```bash
# Update all package.json files to version 0.9.15
# (If not already done)

# packages/schema/package.json
# packages/control/package.json
# packages/protocol/package.json
# packages/crypto/package.json
```

---

## NEXT RELEASE: v0.9.16 (CAL + Security Hardening)

### Scope

See [COMPLETE_ROADMAP_ANALYSIS.md](../COMPLETE_ROADMAP_ANALYSIS.md) section "v0.9.16: Control Abstraction Layer + Security Hardening"

**Key Features**:

1. Control Abstraction Layer (CAL) - Full implementation
2. DPoP L3 Implementation (RFC 9449)
3. JWKS Rotation (90-day schedule)
4. SSRF Protection
5. Discovery + AIPREF Invariants
6. Payment Field Rule (precise validation)
7. Session Logout (/slo endpoint)
8. Protocol Envelope Refactor (use PEACEnvelope types)
9. Server + CLI Updates
10. Documentation

**Estimated Effort**: 18-25 days (3.5-5 weeks)

### Key Files to Create/Modify

**New Files**:

- `packages/protocol/src/dpop.ts` - DPoP implementation
- `packages/infrastructure/src/jwks-rotation.ts` - Key rotation
- `packages/protocol/src/ssrf-guard.ts` - SSRF protection
- `packages/server/src/slo.ts` - Session logout
- `docs/guides/JWKS_ROTATION.md` - Rotation guide
- `docs/guides/DPOP_INTEGRATION.md` - DPoP guide

**Modify**:

- `packages/schema/src/control.ts` - Expand control{} block
- `packages/schema/src/evidence.ts` - Add AIPREF fields
- `packages/control/src/adapter.ts` - Enhance CAL interfaces
- `packages/protocol/src/issue.ts` - Use PEACEnvelope structure
- `packages/protocol/src/verify.ts` - Use PEACEnvelope structure
- `packages/protocol/src/discovery.ts` - AIPREF invariants

---

## DEVELOPMENT GUIDELINES

### 1. Coding Standards

**Follow**:

- [docs/CODING_STANDARDS_PROTOCOL.md](CODING_STANDARDS_PROTOCOL.md) - Protocol-specific standards
- [docs/ARCHITECTURE_VENDOR_NEUTRALITY.md](ARCHITECTURE_VENDOR_NEUTRALITY.md) - Vendor neutrality principles
- TypeScript strict mode (already enabled)
- No hardcoded vendor names in core packages

**Naming Conventions**:

- Packages: `@peac/{name}` (no -core suffix)
- Types: PascalCase, descriptive (e.g., `PaymentRailId` not `PaymentScheme`)
- Functions: camelCase, verb-first (e.g., `enforceConstraint`)
- Constants: SCREAMING_SNAKE_CASE (e.g., `PEAC_WIRE_TYP`)

**Vendor Neutrality**:

- Core packages: Use opaque strings (`PaymentRailId = string`)
- Adapters: Vendor-specific code goes in `@peac/rails-*`, `@peac/engines-*`
- Registry: Add vendors to `docs/specs/registries.json` (informational)
- Verification: `grep -r "stripe\|razorpay\|locus" packages/*/src` must be empty

### 2. Decision Making

**Before making architectural decisions**:

1. Check [PEAC_NORMATIVE_DECISIONS_LOG.md](PEAC_NORMATIVE_DECISIONS_LOG.md) for existing decisions
2. Evaluate alternatives
3. Document decision with:
   - Context (why needed)
   - Decision (what was decided)
   - Rationale (why this choice)
   - Consequences (impact)
   - Alternatives considered
4. Add to decision log with unique ID (DEC-YYYYMMDD-NNN)

**Example decision format**:

```markdown
### DEC-20250120-001: Example Decision Title

**Date**: 2025-01-20
**Status**: ACCEPTED
**Context**: Why was this decision needed?
**Decision**: What was decided?
**Rationale**: Why this choice?
**Consequences**: What's the impact?
**Alternatives Considered**: What else was evaluated?
**Related**: Links to relevant docs
```

### 3. Breaking Changes

**When to break**:

- During v0.9.x (we're in development, breaking changes allowed)
- Document in CHANGELOG and migration guide
- Provide deprecated aliases when possible
- 2-release migration window minimum (v0.9.x → v0.9.x+2)

**When NOT to break**:

- Wire format `peac.receipt/0.9` (frozen until v1.0)
- After v1.0 (only non-breaking or major version bump)

### 4. Testing Requirements

**Before committing**:

```bash
# All builds must pass
pnpm --filter @peac/schema build
pnpm --filter @peac/control build
pnpm --filter @peac/protocol build
pnpm --filter @peac/crypto build

# Run tests (when available)
pnpm --filter @peac/schema test
pnpm --filter @peac/control test
pnpm --filter @peac/protocol test

# Vendor neutrality check
grep -r "stripe\|razorpay\|locus" packages/{schema,protocol,control,crypto}/src

# Package name check
grep -r "@peac/control-core" packages/*/package.json
```

**For new features**:

- Add unit tests
- Add integration tests (if applicable)
- Add negative test vectors (for security features)
- Update performance benchmarks (if performance-critical)

### 5. Documentation Requirements

**For each release**:

- Update [COMPLETE_ROADMAP_ANALYSIS.md](../COMPLETE_ROADMAP_ANALYSIS.md) with completion status
- Create release summary in `docs/notes/v{version}_SUMMARY.md`
- Update `docs/PEAC_v{version}_ACTUAL_SCOPE.md` if scope changed
- Add migration guide for breaking changes
- Update relevant specs in `docs/specs/`

**For new features**:

- Add to `docs/guides/` if user-facing
- Add examples to `examples/`
- Update relevant JSON Schema files
- Update OpenAPI specs (if API changes)

---

## KEY REFERENCE DOCUMENTS

### Authoritative Sources

1. **[COMPLETE_ROADMAP_ANALYSIS.md](../COMPLETE_ROADMAP_ANALYSIS.md)**
   - Full release schedule v0.9.15 → v0.9.21
   - Each version's scope and estimates
   - Current status and completion tracking

2. **[PEAC_NORMATIVE_DECISIONS_LOG.md](PEAC_NORMATIVE_DECISIONS_LOG.md)**
   - All architectural decisions
   - Rationale and consequences
   - Alternatives considered
   - **Check this before making new decisions**

3. **[PEAC_v0.9.15_ACTUAL_SCOPE.md](PEAC_v0.9.15_ACTUAL_SCOPE.md)**
   - v0.9.15 scope documentation
   - What was completed vs planned
   - Files created/modified
   - Statistics

4. **[v0.9.15_NAMING_AND_NEUTRALITY_SUMMARY.md](notes/v0.9.15_NAMING_AND_NEUTRALITY_SUMMARY.md)**
   - Migration guide for v0.9.15
   - Breaking changes
   - Deprecation timeline
   - Code examples

### Specifications

5. **[docs/specs/registries.json](specs/registries.json)**
   - Payment rails registry
   - Agent protocols registry
   - Informational, not normative

6. **[docs/specs/PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md)**
   - Protocol behavior specification
   - HTTP interactions
   - Error handling

7. **[docs/specs/IMPLEMENTATION_GUIDE.md](specs/IMPLEMENTATION_GUIDE.md)**
   - Implementation guidance
   - Best practices
   - Security considerations

### Architecture

8. **[docs/ARCHITECTURE_VENDOR_NEUTRALITY.md](ARCHITECTURE_VENDOR_NEUTRALITY.md)**
   - Vendor neutrality principles
   - Core vs adapter separation
   - Verification procedures

9. **[docs/CODING_STANDARDS_PROTOCOL.md](CODING_STANDARDS_PROTOCOL.md)**
   - Coding standards
   - Naming conventions
   - Best practices

### Master Plans

10. **[materplan/PEAC_v1.2_UNIVERSAL_OMNI_PROTOCOL_MASTER_PLAN.md](../materplan/PEAC_v1.2_UNIVERSAL_OMNI_PROTOCOL_MASTER_PLAN.md)**
    - Long-term vision
    - Universal protocol goals
    - Future directions

11. **[materplan/EXECUTION_ROADMAP_12_WEEKS.md](../materplan/EXECUTION_ROADMAP_12_WEEKS.md)**
    - 12-week execution plan
    - Week-by-week breakdown
    - Milestones

---

## CONTEXT FOR CODE GENERATION

When generating code for future releases:

### 1. Know the Wire Format

- **Current**: `peac.receipt/0.9` (frozen)
- **Future**: `peac.receipt/1.0` (only at GA after IETF + multi-impl)
- **Breaking changes allowed** during v0.9.x
- **No breaking changes** after v1.0 (except major version bump)

### 2. Know the Package Structure

```
packages/
├── schema/         # Types, validators, JSON Schema
├── crypto/         # Ed25519, JCS, base64url
├── protocol/       # Issue, verify, discovery
├── control/        # Control engine interfaces (was control-core)
├── server/         # Server implementation
├── cli/            # Command-line tools
├── rails-*/        # Payment rail adapters (vendor-specific)
├── engines-*/      # Control engine adapters (vendor-specific)
└── mappings-*/     # Protocol mappings (MCP, ACP, etc.)
```

### 3. Know the Type System

- **Core types** in `@peac/schema`:
  - `PEACEnvelope` (auth, evidence, meta)
  - `PaymentEvidence` (rail, reference, amount, currency, asset, env, evidence)
  - `ControlBlock` (for multi-party governance)
  - `Constraint` types (for informational helpers)
- **Opaque strings**: `PaymentRailId`, `AgentProtocolId`
- **No vendor unions** in core packages

### 4. Know the Conventions

- **Header name**: `PEAC-Receipt` (not X-PEAC-Receipt)
- **Package naming**: `@peac/{name}` (no -core suffix)
- **Field naming**: `rail` not `scheme`, `constraint` not `mandate`
- **Vendor neutrality**: Core = neutral, Adapters = vendor-specific

### 5. Know the Rules

- **TypeScript strict mode**: Always enabled
- **Vendor names**: ONLY in adapters, registry, examples
- **Deprecated aliases**: 2-release migration window
- **Breaking changes**: Document in migration guide
- **Tests**: Required for new features
- **Documentation**: Required for public APIs

---

## COMMON TASKS

### Adding a New Payment Rail

1. Create adapter package: `packages/rails-{name}/`
2. Implement adapter interface from `@peac/control`
3. Add to `docs/specs/registries.json` (informational)
4. Add tests and examples
5. **Do NOT** add to core type unions

### Adding a New Control Engine

1. Create adapter package: `packages/engines-{name}/`
2. Implement `ControlEngineAdapter` from `@peac/control`
3. Add to documentation
4. Add tests and examples
5. **Do NOT** add to core type unions

### Making a Breaking Change

1. Document in `PEAC_NORMATIVE_DECISIONS_LOG.md`
2. Add deprecated alias if possible
3. Create migration guide
4. Update COMPLETE_ROADMAP_ANALYSIS.md
5. Plan 2-release migration window
6. Update all examples and tests

### Adding a New Spec

1. Create in `docs/specs/{NAME}.md`
2. Link from relevant docs
3. Add to table of contents
4. Update implementation guide if needed

---

## VERSION MILESTONES

### v0.9.15 ✅ CODE COMPLETE

- Naming cleanup
- Vendor neutrality
- Envelope alignment

### v0.9.16 (NEXT)

- CAL full implementation
- Security hardening (DPoP, JWKS rotation, SSRF)
- Protocol envelope refactor

### v0.9.17

- Remove deprecated aliases from v0.9.15
- Protocol refinements
- Additional security features

### v0.9.18-v0.9.20

- See COMPLETE_ROADMAP_ANALYSIS.md

### v0.9.21 (RFC-READY)

- Feature freeze
- IETF Draft-02
- Multi-implementation testing
- Security audit

### v1.0 (EARNED)

- IETF process complete
- Multi-implementation consensus
- Production battle-tested
- Security audit passed
- **Wire format flip**: `peac.receipt/0.9` → `peac.receipt/1.0`

---

## QUESTIONS & TROUBLESHOOTING

### "Should I add vendor X to core types?"

**No.** Use opaque strings in core. Add to adapters and registry only.

### "Can I break the API in v0.9.x?"

**Yes**, with:

- Migration guide
- Deprecated aliases if possible
- Documentation in decision log
- 2-release migration window

### "Should I create a -core package?"

**No.** Remove -core suffix. Use `@peac/{name}` pattern.

### "Where do protocol mappings go?"

**In** `packages/mappings-{protocol}/` (e.g., mappings-mcp, mappings-acp)

### "Can I change the wire format?"

**No** during v0.9.x. Only at v1.0 GA (after IETF + multi-impl).

### "How do I verify vendor neutrality?"

```bash
grep -r "stripe\|razorpay\|locus" packages/{schema,protocol,control,crypto}/src
# Should return NO matches
```

---

## USEFUL COMMANDS

### Build All Packages

```bash
pnpm --filter @peac/schema build
pnpm --filter @peac/control build
pnpm --filter @peac/protocol build
pnpm --filter @peac/crypto build
```

### Run Tests

```bash
pnpm --filter @peac/schema test
pnpm --filter @peac/control test
```

### Vendor Neutrality Check

```bash
grep -r "stripe\|razorpay\|locus" packages/{schema,protocol,control,crypto}/src
```

### Package Name Check

```bash
grep -r "@peac/control-core" packages/*/package.json
```

### Clean Rebuild

```bash
cd packages/schema && rm -f *.tsbuildinfo && pnpm build
cd ../control && rm -f *.tsbuildinfo && pnpm build
cd ../protocol && rm -f *.tsbuildinfo && pnpm build
cd ../crypto && rm -f *.tsbuildinfo && pnpm build
```

---

**Maintainer**: PEAC Protocol Team
**Review**: Before each release
**Updates**: Append new information at relevant sections
**Status**: Living document - keep current with each release
