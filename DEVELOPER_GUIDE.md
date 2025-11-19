# PEAC Protocol - Developer Guide

**⚠️ INTERNAL ONLY - DO NOT PUBLISH OR PUSH TO GITHUB ⚠️**

**Last Updated**: 2025-11-18 IST
**Purpose**: Single authoritative guide for developers working on PEAC Protocol codebase
**Audience**: Internal developers contributing to PEAC (not end users - see README.md for usage)
**Status**: Private development documentation - keep local only

---

## 🚀 START HERE

**If you're picking up this project at any stage**, read this document first. It consolidates:
- Current state and version
- Architecture overview
- Version-wise scope
- Code generation instructions
- Development process
- Pre-commit checks
- Commit rules
- Key reference documents

---

## 📍 CURRENT STATE

### Where We Are

```
GitHub Live:    v0.9.14 (Sep 28, 2024)
Local Work:     v0.9.15 (CODE COMPLETE, not yet committed)
Next Release:   v0.9.16 (CAL + Security Hardening)
RFC-Ready:      v0.9.21 (target milestone)
v1.0:           EARNED after IETF + multi-implementation + security audit
```

### Version Timeline

```
v0.9.14  ✅ Sep 28, 2024   GitHub (9 packages, test infrastructure, CI/CD)
v0.9.15  ✅ Jan 18, 2025   LOCAL (Naming + Vendor Neutrality + Envelope Alignment)
v0.9.16  📋 NEXT           CAL + Security Hardening (DPoP, JWKS, SSRF, SLO)
v0.9.17  📋 PLANNED        AP2 Protocol Mapping + Edge Distribution
v0.9.18  📋 PLANNED        Additional features (see roadmap)
v0.9.19  📋 PLANNED        Additional features (see roadmap)
v0.9.20  📋 PLANNED        Additional features (see roadmap)
v0.9.21  🎯 RFC-READY      Feature freeze, IETF Draft-02
v1.0     🏆 EARNED         After IETF process complete
```

### Wire Format

- **Current**: `peac.receipt/0.9` (FROZEN)
- **Status**: Unchanged throughout v0.9.14 → v0.9.21
- **Next Change**: Only at v1.0 GA → `peac.receipt/1.0`
- **Breaking Changes**: Allowed in package APIs during v0.9.x, NOT in wire format

---

## 🏗️ ARCHITECTURE OVERVIEW

### Package Structure

```
packages/
├── schema/         # Core types, validators, JSON Schema, envelope types
├── crypto/         # Ed25519 JWS, JCS canonicalization, base64url
├── protocol/       # Issue, verify, discovery, JWKS caching
├── control/        # Control engine interfaces, constraint helpers (was control-core)
├── server/         # Server implementation (DoS protection, rate limiting)
├── cli/            # Command-line tools
├── rails-x402/     # x402 payment rail adapter (vendor-specific)
├── rails-stripe/   # Stripe payment rail adapter (vendor-specific)
├── mappings-mcp/   # Model Context Protocol integration
├── mappings-acp/   # Agentic Commerce Protocol integration
└── [future]/       # Additional adapters as needed
```

### Core Principles

#### 1. Vendor Neutrality (CRITICAL)
- **Core packages** (schema, protocol, control, crypto): Use opaque strings, NO vendor names
- **Adapter packages** (rails-*, engines-*): Vendor-specific implementations
- **Registry**: `docs/specs/registries.json` (informational, not normative)
- **Verification**: `grep -r "stripe\|razorpay\|locus" packages/{schema,protocol,control,crypto}/src` MUST return ZERO matches

#### 2. Wire Format Stability
- `peac.receipt/0.9` frozen until v1.0 GA
- Breaking changes to wire format NOT allowed during v0.9.x
- Additive changes via `ext` field allowed
- API can break during v0.9.x (with migration guide)

#### 3. Type System
- **Opaque strings**: `PaymentRailId = string`, `AgentProtocolId = string`
- **Envelope structure**: `PEACEnvelope` = { auth, evidence?, meta? }
- **Core types** in `@peac/schema`
- **Vendor-specific** in adapter packages

#### 4. Naming Conventions
- **Packages**: `@peac/{name}` (NO -core suffix)
- **Types**: PascalCase, descriptive (e.g., `PaymentRailId` not `PaymentScheme`)
- **Functions**: camelCase, verb-first (e.g., `enforceConstraint`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `PEAC_WIRE_TYP`)
- **Fields**: snake_case for wire format, camelCase for internal APIs

---

## 📋 VERSION-WISE SCOPE

### v0.9.15 ✅ CODE COMPLETE
**Focus**: Naming + Vendor Neutrality + Envelope Alignment

**What's Included**:
- Package rename: `@peac/control-core` → `@peac/control`
- Payment terminology: `scheme` → `rail`, `PaymentScheme` → `PaymentRailId`
- Constraint types: `Mandate` → `Constraint` (15 types, 6 functions, 5 validators)
- Vendor neutrality: Removed ALL vendor unions from core
- Envelope types: Added `PEACEnvelope` matching JSON Schema
- PaymentEvidence: Added required fields (asset, env, evidence)
- Build fixes: 15+ TypeScript errors resolved
- Documentation: Migration guide, decision log, scope docs

**Breaking Changes**: 6 categories
**Migration**: Deprecated aliases available until v0.9.17
**Docs**: [docs/notes/v0.9.15_NAMING_AND_NEUTRALITY_SUMMARY.md](docs/notes/v0.9.15_NAMING_AND_NEUTRALITY_SUMMARY.md)

### v0.9.16 📋 NEXT
**Focus**: CAL + Security Hardening

**What's Planned**:
1. Control Abstraction Layer (CAL) - Full implementation
2. DPoP L3 Implementation (RFC 9449)
3. JWKS Rotation (90-day schedule)
4. SSRF Protection (IP ranges, metadata URLs, HTTPS)
5. Discovery + AIPREF Invariants
6. Payment Field Rule (precise validation)
7. Session Logout (/slo endpoint)
8. Protocol Envelope Refactor (use PEACEnvelope types)
9. Server + CLI Updates
10. Documentation

**Estimate**: 18-25 days (3.5-5 weeks)
**Docs**: [COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md) section "v0.9.16"

### v0.9.17 - v0.9.21
See [COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md) for complete roadmap

---

## 💻 DEVELOPMENT PROCESS

### Initial Setup

```bash
# Clone repository (if starting fresh)
git clone <repo-url>
cd peac

# Install dependencies
pnpm install

# Build all packages
pnpm --filter @peac/schema build
pnpm --filter @peac/control build
pnpm --filter @peac/protocol build
pnpm --filter @peac/crypto build

# Verify builds
echo "✅ All builds should pass"
```

### Before Starting Work

1. **Check current version**:
   ```bash
   git status
   git log --oneline -5
   # Verify you know which version you're working on
   ```

2. **Review key documents**:
   - This file (DEVELOPER_GUIDE.md) - Overview
   - [COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md) - Version scope
   - [docs/PEAC_NORMATIVE_DECISIONS_LOG.md](docs/PEAC_NORMATIVE_DECISIONS_LOG.md) - Decisions
   - [docs/NEXT_STEPS_v0.9.15_TO_v1.0.md](docs/NEXT_STEPS_v0.9.15_TO_v1.0.md) - Detailed next steps

3. **Understand current scope**:
   - What version are you working on?
   - What's the scope for this version?
   - What was deferred from previous versions?

### Development Workflow

1. **Create/switch to feature branch** (optional for local work):
   ```bash
   git checkout -b feat/{feature-name}
   ```

2. **Make changes following standards**:
   - Follow [docs/CODING_STANDARDS_PROTOCOL.md](docs/CODING_STANDARDS_PROTOCOL.md)
   - Maintain vendor neutrality (core packages)
   - TypeScript strict mode (always enabled)
   - Write tests for new features

3. **Build incrementally**:
   ```bash
   # Build package you're working on
   pnpm --filter @peac/schema build

   # If errors, check TypeScript cache
   cd packages/schema && rm -f *.tsbuildinfo && pnpm build
   ```

4. **Run tests** (when available):
   ```bash
   pnpm --filter @peac/schema test
   pnpm --filter @peac/control test
   ```

---

## ✅ PRE-COMMIT CHECKLIST

**BEFORE COMMITTING**, run ALL these checks:

### 1. Build Verification
```bash
# All packages MUST build successfully
pnpm --filter @peac/schema build
pnpm --filter @peac/control build
pnpm --filter @peac/protocol build
pnpm --filter @peac/crypto build

# Expected: NO errors
```

### 2. Vendor Neutrality Check
```bash
# Core packages MUST have ZERO vendor names
grep -r "stripe\|razorpay\|locus" packages/{schema,protocol,control,crypto}/src

# Expected: NO matches (or only in comments/deprecated markers)
```

### 3. Package Name Check
```bash
# NO references to old package names
grep -r "@peac/control-core" packages/*/package.json

# Expected: NO matches
```

### 4. Type Check
```bash
# TypeScript MUST pass strict mode
cd packages/schema && npx tsc --noEmit
cd packages/control && npx tsc --noEmit
cd packages/protocol && npx tsc --noEmit
cd packages/crypto && npx tsc --noEmit

# Expected: NO errors
```

### 5. Test Check (when available)
```bash
# Tests MUST pass
pnpm test

# Expected: ALL tests passing
```

### 6. Documentation Check
- [ ] Updated relevant docs in `docs/`
- [ ] Created migration guide (if breaking changes)
- [ ] Updated COMPLETE_ROADMAP_ANALYSIS.md (if scope changed)
- [ ] Added decisions to PEAC_NORMATIVE_DECISIONS_LOG.md (if architectural)

---

## 📝 COMMIT RULES

### Commit Message Format

```bash
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring (no functional change)
- `docs`: Documentation only
- `test`: Add/update tests
- `chore`: Build process, tools, etc.
- `perf`: Performance improvement
- `style`: Code formatting (no logic change)

**Scope**: Package name (schema, control, protocol, crypto) or `v{version}` for releases

**Examples**:
```bash
# Feature
feat(schema): add PEACEnvelope types matching JSON Schema

# Breaking change
refactor(v0.9.15): rename @peac/control-core to @peac/control

BREAKING CHANGE: Package import path changed from @peac/control-core to @peac/control

# Bug fix
fix(protocol): resolve cyclic dependency with schema package
```

### Breaking Changes

**If introducing breaking changes**:
1. Add `BREAKING CHANGE:` in commit footer
2. Document in `BREAKING CHANGES:` section of commit message
3. Create migration guide in `docs/notes/v{version}_MIGRATION.md`
4. Add deprecated aliases when possible
5. Plan 2-release migration window
6. Update decision log with rationale

### Release Commits

**For version releases** (like v0.9.15):
```bash
refactor(v0.9.15): <one-line summary>

BREAKING CHANGES:
- <list each breaking change>

Features:
- <list new features>

Fixes:
- <list bug fixes>

Documentation:
- <list doc updates>

Packages affected:
- <list packages>

Files created: N
Files modified: N
LOC changed: ~N

Rationale: <why these changes>

Refs: <link to decision log, scope doc>
```

See [docs/NEXT_STEPS_v0.9.15_TO_v1.0.md](docs/NEXT_STEPS_v0.9.15_TO_v1.0.md) for full example.

---

## 🤖 CODE GENERATION INSTRUCTIONS

### Context for AI/Codegen Tools

When generating code for PEAC protocol:

#### 1. Know the Current State
- **Wire format**: `peac.receipt/0.9` (frozen)
- **Package version**: Check package.json (currently 0.9.15)
- **Architecture**: Vendor-neutral core, vendor-specific adapters

#### 2. Follow Type System
```typescript
// ✅ CORRECT - Opaque strings in core
export type PaymentRailId = string;
export type AgentProtocolId = string;

// ❌ WRONG - Vendor unions in core
export type PaymentRailId = "stripe" | "razorpay" | "x402" | string;
```

#### 3. Follow Naming Conventions
```typescript
// ✅ CORRECT
export interface PaymentEvidence {
  rail: PaymentRailId;  // snake_case for wire format
  reference: string;
  // ...
}

// ❌ WRONG
export interface PaymentEvidence {
  scheme: string;  // Old terminology
  // ...
}
```

#### 4. Package Placement
- **Core logic**: `packages/{schema,protocol,control,crypto}`
- **Vendor-specific**: `packages/rails-{vendor}` or `packages/engines-{vendor}`
- **Protocol mappings**: `packages/mappings-{protocol}`

#### 5. Import Patterns
```typescript
// ✅ CORRECT - Import from schema for types
import type { PEACEnvelope, PaymentEvidence } from '@peac/schema';
import type { Constraint } from '@peac/control';

// ❌ WRONG - Old package names
import type { Mandate } from '@peac/control-core';
```

#### 6. Must Check Before Generating
- [ ] Check [PEAC_NORMATIVE_DECISIONS_LOG.md](docs/PEAC_NORMATIVE_DECISIONS_LOG.md) for existing decisions
- [ ] Check [COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md) for version scope
- [ ] Follow [docs/CODING_STANDARDS_PROTOCOL.md](docs/CODING_STANDARDS_PROTOCOL.md)
- [ ] Verify vendor neutrality in core packages

---

## 🔑 KEY REFERENCE DOCUMENTS

### Must Read (Before Making Changes)

1. **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** (this file)
   - Start here, comprehensive overview
   - Process, rules, context

2. **[docs/PEAC_NORMATIVE_DECISIONS_LOG.md](docs/PEAC_NORMATIVE_DECISIONS_LOG.md)**
   - ALL architectural decisions
   - ⚠️ **CHECK BEFORE making new architectural decisions**
   - Rationale and consequences documented

3. **[COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md)**
   - Full version roadmap (v0.9.15 → v0.9.21)
   - Each version's scope and estimates
   - Current status tracking

### Architecture & Standards

4. **[docs/ARCHITECTURE_VENDOR_NEUTRALITY.md](docs/ARCHITECTURE_VENDOR_NEUTRALITY.md)**
   - Vendor neutrality principles
   - Core vs adapter separation
   - Verification procedures

5. **[docs/CODING_STANDARDS_PROTOCOL.md](docs/CODING_STANDARDS_PROTOCOL.md)**
   - Coding standards
   - Naming conventions
   - Best practices

### Current Version Docs

6. **[docs/PEAC_v0.9.15_ACTUAL_SCOPE.md](docs/PEAC_v0.9.15_ACTUAL_SCOPE.md)**
   - v0.9.15 scope (what was done)
   - Scope change rationale
   - Statistics

7. **[docs/notes/v0.9.15_NAMING_AND_NEUTRALITY_SUMMARY.md](docs/notes/v0.9.15_NAMING_AND_NEUTRALITY_SUMMARY.md)**
   - v0.9.15 migration guide
   - Breaking changes
   - Code examples

8. **[docs/NEXT_STEPS_v0.9.15_TO_v1.0.md](docs/NEXT_STEPS_v0.9.15_TO_v1.0.md)**
   - Detailed next steps for v0.9.16+
   - Common tasks
   - Troubleshooting

### Specifications

9. **[docs/specs/registries.json](docs/specs/registries.json)**
   - Payment rails registry
   - Agent protocols registry
   - Informational, not normative

10. **[docs/specs/PROTOCOL-BEHAVIOR.md](docs/specs/PROTOCOL-BEHAVIOR.md)**
    - Protocol behavior spec
    - HTTP interactions
    - Error handling

11. **[docs/specs/IMPLEMENTATION_GUIDE.md](docs/specs/IMPLEMENTATION_GUIDE.md)**
    - Implementation guidance
    - Best practices
    - Security considerations

### Master Plans

12. **[materplan/PEAC_v1.2_UNIVERSAL_OMNI_PROTOCOL_MASTER_PLAN.md](materplan/PEAC_v1.2_UNIVERSAL_OMNI_PROTOCOL_MASTER_PLAN.md)**
    - Long-term vision
    - Universal protocol goals

13. **[materplan/EXECUTION_ROADMAP_12_WEEKS.md](materplan/EXECUTION_ROADMAP_12_WEEKS.md)**
    - 12-week execution plan
    - Week-by-week breakdown

---

## 🔧 COMMON TASKS

### Adding a New Payment Rail

1. Create adapter package: `packages/rails-{name}/`
2. Implement adapter interface from `@peac/control`
3. Add to `docs/specs/registries.json` (informational)
4. Add tests and examples
5. **DO NOT** add to core type unions

### Adding a New Control Engine

1. Create adapter package: `packages/engines-{name}/`
2. Implement `ControlEngineAdapter` from `@peac/control`
3. Add to documentation
4. Add tests and examples
5. **DO NOT** add to core type unions

### Making an Architectural Decision

1. Check [PEAC_NORMATIVE_DECISIONS_LOG.md](docs/PEAC_NORMATIVE_DECISIONS_LOG.md) first
2. Research context and alternatives
3. Document using decision template:
   ```markdown
   ### DEC-YYYYMMDD-NNN: Decision Title
   **Date**: YYYY-MM-DD
   **Status**: ACCEPTED
   **Context**: Why needed?
   **Decision**: What decided?
   **Rationale**: Why this choice?
   **Consequences**: Impact?
   **Alternatives Considered**: Other options?
   **Related**: Links
   ```
4. Add to decision log
5. Reference in code/docs

### Introducing a Breaking Change

1. Document in [PEAC_NORMATIVE_DECISIONS_LOG.md](docs/PEAC_NORMATIVE_DECISIONS_LOG.md)
2. Add deprecated alias if possible
3. Create migration guide in `docs/notes/`
4. Update [COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md)
5. Plan 2-release migration window
6. Use `BREAKING CHANGE:` in commit message

---

## 🐛 TROUBLESHOOTING

### Build Errors

**TypeScript cache issues**:
```bash
cd packages/{package} && rm -f *.tsbuildinfo && pnpm build
```

**Cyclic dependency warnings**:
- Check imports between schema and control
- Schema should not import from control for types
- Control can import from schema for core types

**Missing declarations**:
```bash
# Rebuild dependencies first
pnpm --filter @peac/schema clean
pnpm --filter @peac/schema build
pnpm --filter @peac/control build
```

### "Should I add vendor X to core types?"
**No.** Use opaque strings in core. Add vendor-specific code to adapters.

### "Can I break the API?"
**During v0.9.x**: Yes, with migration guide and deprecated aliases
**After v1.0**: No, only with major version bump

### "Where do I add protocol mapping for X?"
In `packages/mappings-{protocol}/` (e.g., mappings-mcp, mappings-acp)

### "Can I change the wire format?"
**No** during v0.9.x. Only at v1.0 GA. Use `ext` field for additive changes.

---

## 📊 USEFUL COMMANDS

### Verification

```bash
# Build all packages
pnpm --filter @peac/schema build && \
pnpm --filter @peac/control build && \
pnpm --filter @peac/protocol build && \
pnpm --filter @peac/crypto build

# Vendor neutrality check
grep -r "stripe\|razorpay\|locus" packages/{schema,protocol,control,crypto}/src

# Package name check
grep -r "@peac/control-core" packages/*/package.json

# Run tests
pnpm test

# Check TypeScript without emit
npx tsc --noEmit
```

### Clean Rebuild

```bash
# Clean all build artifacts
pnpm clean

# Or per package
cd packages/schema && rm -rf dist *.tsbuildinfo && pnpm build
cd packages/control && rm -rf dist *.tsbuildinfo && pnpm build
cd packages/protocol && rm -rf dist *.tsbuildinfo && pnpm build
cd packages/crypto && rm -rf dist *.tsbuildinfo && pnpm build
```

### Git Operations

```bash
# Check current state
git status
git log --oneline -10

# Create feature branch
git checkout -b feat/{feature-name}

# Stage changes
git add -A

# Commit (see commit rules above)
git commit -m "type(scope): subject"

# Tag release
git tag -a v0.9.X -m "Description"

# DO NOT PUSH (local only per current directive)
```

---

## 🎯 QUICK START FOR NEW DEVELOPERS

1. **Read this document** (DEVELOPER_GUIDE.md) completely
2. **Clone and build**:
   ```bash
   git clone <repo>
   cd peac
   pnpm install
   pnpm --filter @peac/schema build
   pnpm --filter @peac/control build
   pnpm --filter @peac/protocol build
   pnpm --filter @peac/crypto build
   ```
3. **Check version**: Look at package.json versions, git tags
4. **Read scope**: [COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md) for your version
5. **Check decisions**: [PEAC_NORMATIVE_DECISIONS_LOG.md](docs/PEAC_NORMATIVE_DECISIONS_LOG.md)
6. **Follow standards**: [CODING_STANDARDS_PROTOCOL.md](docs/CODING_STANDARDS_PROTOCOL.md)
7. **Make changes**: Follow development workflow above
8. **Run checks**: Pre-commit checklist above
9. **Commit**: Following commit rules above

---

## 📞 GETTING HELP

### Decision-Making
1. Check [PEAC_NORMATIVE_DECISIONS_LOG.md](docs/PEAC_NORMATIVE_DECISIONS_LOG.md) first
2. Review [ARCHITECTURE_VENDOR_NEUTRALITY.md](docs/ARCHITECTURE_VENDOR_NEUTRALITY.md)
3. Document your decision with rationale

### Technical Issues
1. Check troubleshooting section above
2. Review [CODING_STANDARDS_PROTOCOL.md](docs/CODING_STANDARDS_PROTOCOL.md)
3. Check relevant spec in `docs/specs/`

### Scope Questions
1. Check [COMPLETE_ROADMAP_ANALYSIS.md](COMPLETE_ROADMAP_ANALYSIS.md)
2. Review version-specific scope docs in `docs/`
3. Check [NEXT_STEPS_v0.9.15_TO_v1.0.md](docs/NEXT_STEPS_v0.9.15_TO_v1.0.md)

---

## 🔄 PROCESS SUMMARY

```
┌─────────────────────────────────────────────────────────┐
│ 1. START HERE - Read DEVELOPER_GUIDE.md                │
├─────────────────────────────────────────────────────────┤
│ 2. Check version and scope in COMPLETE_ROADMAP         │
├─────────────────────────────────────────────────────────┤
│ 3. Review architectural decisions in DECISIONS_LOG     │
├─────────────────────────────────────────────────────────┤
│ 4. Make changes following CODING_STANDARDS             │
├─────────────────────────────────────────────────────────┤
│ 5. Run PRE-COMMIT CHECKLIST (all must pass)            │
├─────────────────────────────────────────────────────────┤
│ 6. Commit following COMMIT RULES                       │
├─────────────────────────────────────────────────────────┤
│ 7. Document decisions in DECISIONS_LOG (if needed)     │
├─────────────────────────────────────────────────────────┤
│ 8. Update roadmap if scope changed                     │
└─────────────────────────────────────────────────────────┘
```

---

**Last Updated**: 2025-11-18 IST
**Maintainer**: PEAC Protocol Team
**Status**: Living document - update with each release
**Version**: Aligned with v0.9.15
