# PEAC Coding Standards (Protocol & Core)

This document defines coding standards for PEAC Protocol core packages and specifications.

## 1. General Principles

### 1.1 Vendor Neutrality

**CRITICAL INVARIANT**: Core packages MUST NOT hardcode vendor-specific names.

- **Core packages** (`@peac/schema`, `@peac/protocol`, `@peac/control`): 100% vendor-neutral
- **Adapter packages** (`@peac/rails-*`, `@peac/mappings-*`): May contain vendor names
- **Examples** (`examples/`, `apps/`): May use vendor-specific implementations

**Violations**:
- ❌ `type PaymentScheme = "stripe" | "razorpay" | "x402"`
- ❌ `interface LocusMandate { ... }`
- ❌ Hardcoded references to Stripe, Razorpay, Locus, Google, Visa, etc. in core

**Correct**:
- ✅ `type PaymentScheme = string` (opaque, extensible)
- ✅ `interface BudgetConstraint { ... }` (generic primitive)
- ✅ Non-normative registry in `docs/specs/registries.json`

### 1.2 Type Safety vs Extensibility

Balance compile-time safety with runtime extensibility:

- **Protocol-visible types**: Use `string` for identifiers (scheme, engine, etc.)
- **Internal types**: Use unions/enums for safety where appropriate
- **Adapters**: Provide type-safe wrappers around opaque core types
- **Registries**: Offer non-normative guidance for tooling

### 1.3 Cross-Language Compatibility

All protocol-visible types MUST have clear JSON Schema mappings:

- TypeScript types are **reference implementations**, not source of truth
- JSON Schema (`docs/specs/PEAC-RECEIPT-SCHEMA-v0.9.json`) is normative
- Test vectors define expected behavior across all languages
- Avoid TypeScript-specific features in protocol types

---

## 2. Naming Conventions

### 2.1 JWT Standard Claims

Use standard JWT claim names (RFC 7519):

- `iss` (issuer)
- `aud` (audience)
- `sub` (subject)
- `iat` (issued at)
- `exp` (expiration)
- `jti` (JWT ID) - **NOTE**: PEAC uses `rid` (receipt ID) instead

### 2.2 PEAC-Specific Fields

Use `snake_case` for JSON-visible fields:

**Top-level**:
- `auth`, `evidence`, `meta`

**Auth context**:
- `policy_hash`, `policy_uri`, `parent_rid`, `supersedes_rid`, `delegation_chain`

**Control**:
- `chain`, `decision`, `combinator`, `limits_snapshot`, `policy_id`, `evidence_ref`

**Evidence**:
- `payment`, `payments`, `attestation`, `facilitator_ref`

**Meta**:
- `privacy_budget`, `k_anonymity`

**Rationale**: Web standards prefer snake_case for JSON. TypeScript/Go/Rust use camelCase/snake_case internally but serialize to snake_case.

### 2.3 TypeScript Internal

Use `camelCase` for TypeScript variables and functions:

```typescript
// Good
function validateControlChain(chain: ControlStep[]): ControlValidationResult {
  const decision = computeDecision(chain);
  return { valid: true, decision };
}

// Bad
function validate_control_chain(chain: ControlStep[]): ControlValidationResult { ... }
```

---

## 3. Package Boundaries

### 3.1 Core Packages

**`@peac/schema`**:
- Types + JSON Schema only
- Zero dependencies (except dev dependencies)
- Exports: envelope, control, evidence, errors, validators
- **NO** vendor-specific names

**`@peac/protocol`**:
- Logic: issue, verify, validate
- Depends on: `@peac/schema`, `@peac/crypto`
- Exports: issuer, verifier, validator functions
- **NO** vendor-specific logic

**`@peac/control`**:
- Generic control interfaces
- Re-exports core types from `@peac/schema`
- Provides generic primitives (temporal, usage, budget constraints)
- **NO** vendor-specific engines

**`@peac/crypto`**:
- JWS signing/verification (EdDSA, RFC 8032)
- JCS canonicalization (RFC 8785)
- Key management (Ed25519, JWKS)
- **NO** vendor-specific crypto

### 3.2 Adapter Packages

**`@peac/rails-core`** (when introduced):
- Generic `PaymentRailAdapter` interface
- Common rail logic (amount validation, currency conversion)
- **NO** vendor-specific implementations

**`@peac/rails-x402`**:
- x402 protocol adapter
- Depends on: `@peac/rails-core`, `@peac/schema`
- May reference x402-specific fields

**`@peac/rails-stripe`**:
- Stripe payment adapter
- Depends on: `@peac/rails-core`, `@peac/schema`, `stripe` SDK
- May reference Stripe-specific APIs

**`@peac/mappings-mcp`**, **`@peac/mappings-acp`**, etc.:
- Protocol mapping adapters (MCP, ACP, TAP, AP2)
- Depends on: `@peac/schema`, `@peac/control`
- May reference protocol-specific fields

### 3.3 Examples and Apps

**`examples/control-engines/`**:
- Reference implementations of control engines
- May use vendor names in subdirectories (`examples/control-engines/locus/`)
- Not published to npm

**`apps/`**:
- Demo applications
- May use any vendor-specific code
- Not published to npm

---

## 4. Error Handling

### 4.1 Protocol Errors

All protocol-surface errors MUST use `PEACError`:

```typescript
import { createPEACError, ERROR_CODES } from '@peac/schema';

// Good
throw createPEACError(
  ERROR_CODES.E_CONTROL_REQUIRED,
  'validation',
  'error',
  false,
  {
    http_status: 400,
    pointer: '/auth/control',
    remediation: 'Add control{} block when payment{} is present',
  }
);

// Bad
throw new Error('Control required');
```

### 4.2 Error Registry

Each new error code MUST:
1. Be added to `packages/schema/src/errors.ts` ERROR_CODES constant
2. Be documented in `docs/specs/ERRORS.md` registry table
3. Have at least one negative test vector demonstrating it

### 4.3 Error Details

Use `details` field for implementation-specific context:

```typescript
{
  code: "E_INVALID_PAYMENT",
  category: "validation",
  severity: "error",
  retryable: false,
  pointer: "/evidence/payment/amount",
  remediation: "Ensure payment amount is positive",
  details: {
    provided_amount: -100,
    minimum_amount: 1,
    currency: "USD"
  }
}
```

---

## 5. Testing

### 5.1 Test Vectors

All new protocol features MUST:
1. Add at least **one golden vector** (valid case)
2. Add at least **one negative vector** per new validation rule
3. Update `docs/specs/TEST_VECTORS.md` with descriptions
4. Wire vectors into CI (`pnpm test:vectors`)

### 5.2 Unit Tests

- **Core packages**: 100% coverage of public API
- **Adapters**: 80%+ coverage, focus on edge cases
- **Examples**: Not required, but encouraged

### 5.3 Integration Tests

- **Protocol flows**: Issue → verify → validate
- **Adapters**: Test against live sandbox APIs (in CI)
- **Cross-package**: Test @peac/protocol with all adapters

### 5.4 Performance Tests

Performance-critical paths MUST have benchmarks:

- Signature verification: p95 ≤ 10ms
- Envelope validation: p95 ≤ 5ms
- Policy hash computation: p95 ≤ 2ms

CI MUST fail if performance regresses by >20%.

---

## 6. Refactoring

### 6.1 When to Refactor

Structural refactors are **encouraged now** (pre-adoption) over v2.0 later.

**Refactor immediately if**:
- Vendor names leak into core packages
- Protocol semantics are ambiguous
- Cross-language compatibility is broken
- Performance is unacceptable

**Defer if**:
- Changes are purely cosmetic
- No clear correctness/performance win
- High risk of introducing bugs

### 6.2 Refactor Process

1. **Audit**: Document current state in architecture doc
2. **Design**: Propose changes, get human approval
3. **Implement**: Make changes with tests
4. **Validate**: Run all test vectors, benchmarks
5. **Document**: Update specs, migration guides

**CRITICAL**: Do NOT refactor without explicit approval for breaking changes.

---

## 7. Documentation

### 7.1 Code Comments

- **Interfaces**: JSDoc for all public types
- **Functions**: JSDoc for all public functions
- **Complex logic**: Inline comments explaining "why", not "what"

Example:

```typescript
/**
 * Validates a control chain against any_can_veto semantics.
 *
 * With any_can_veto, if any step has result="deny", the final
 * decision MUST be "deny". Otherwise, decision MUST be "allow".
 *
 * @param chain - Array of control steps (must have length >= 1)
 * @returns Validation result with computed decision
 * @throws {PEACError} E_INVALID_CONTROL_CHAIN if chain is empty
 */
export function validateControlChain(chain: ControlStep[]): ControlValidationResult {
  // Chain must be non-empty (protocol invariant)
  if (chain.length === 0) {
    throw createPEACError(ERROR_CODES.E_INVALID_CONTROL_CHAIN, ...);
  }

  // any_can_veto: if any step denies, final decision is deny
  const hasVeto = chain.some(step => step.result === 'deny');
  const decision = hasVeto ? 'deny' : 'allow';

  return { valid: true, decision };
}
```

### 7.2 Specification Documents

All protocol features MUST be documented in:

- `docs/specs/PROTOCOL-BEHAVIOR.md`: Normative semantics
- `docs/specs/TEST_VECTORS.md`: Normative examples
- `docs/specs/PEAC-RECEIPT-SCHEMA-v0.9.json`: Normative schema

### 7.3 Migration Guides

Breaking changes MUST include:

- Before/after examples
- Migration steps for issuers and verifiers
- Timeline for deprecation (if applicable)

---

## 8. Version Control

### 8.1 Git Commits

- **Format**: `<type>(<scope>): <subject>`
- **Types**: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `ci`, `chore`
- **Scope**: Package name (e.g., `schema`, `protocol`, `control-core`)
- **Subject**: Imperative mood, no period, max 72 chars

Examples:
```
feat(schema): add composable control chain with any_can_veto
fix(protocol): validate policy_hash against fetched policy
docs(specs): add TEST_VECTORS.md with golden and negative cases
test(vectors): add negative vector for missing control
refactor(control-core): make mandate types vendor-neutral
perf(crypto): optimize JCS canonicalization (p95 10ms → 2ms)
```

### 8.2 Pull Requests

- **Title**: Same format as commits
- **Description**: Include:
  - **Summary**: What changed and why
  - **Test plan**: How you tested it
  - **Breaking changes**: If any, with migration notes
  - **Performance impact**: If applicable

### 8.3 Branching

- `main`: Protected, always deployable
- `feat/*`: Feature branches
- `fix/*`: Bug fix branches
- `docs/*`: Documentation-only changes

---

## 9. Performance

### 9.1 Critical Paths

These operations MUST be fast:

- **Signature verification**: p95 ≤ 10ms
- **Envelope validation**: p95 ≤ 5ms
- **Policy hash computation**: p95 ≤ 2ms
- **Control chain evaluation**: p95 ≤ 1ms per step

### 9.2 Memory

- **Receipt size**: Target < 5KB for typical receipts
- **Control chain**: Support up to 10 steps without performance degradation
- **Payment evidence**: Support up to 10 payments in multi-rail (future)

### 9.3 Scalability

Design for internet-grade scale:

- **Verifiers**: 100K receipts/sec per core
- **Issuers**: 10K receipts/sec per core
- **Storage**: Receipts must be archivable (immutable, content-addressed)

---

## 10. Security

### 10.1 SSRF Protection

All URL fetches (JWKS, policy) MUST:
- Block private IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
- Block metadata IPs (169.254.0.0/16, fd00::/8)
- Block loopback (localhost, ::1)
- Enforce HTTPS (allow HTTP only for localhost in dev mode)
- Set reasonable timeouts (5s connect, 10s total)

### 10.2 DPoP Verification

DPoP proofs MUST:
- Validate `jkt` matches public key hash
- Validate `iat` is within acceptable window (±60s)
- Validate `htm` and `htu` match request method and URL
- Check nonce replay (L3: in-memory cache, L4: distributed cache)

### 10.3 Input Validation

- **Amount fields**: Validate as positive integers (smallest currency unit)
- **Timestamps**: Validate as Unix timestamps (seconds, not milliseconds)
- **ULIDs**: Validate format and monotonicity where required
- **URLs**: Validate scheme, host, path (no credentials in URL)

---

## 11. Dependencies

### 11.1 Core Package Dependencies

Minimize dependencies in core packages:

- `@peac/schema`: **ZERO** runtime dependencies
- `@peac/protocol`: Only `@peac/schema`, `@peac/crypto`
- `@peac/crypto`: Only `@noble/ed25519` or equivalent

### 11.2 Adapter Dependencies

Adapters may depend on external SDKs:

- `@peac/rails-stripe`: `stripe` SDK
- `@peac/mappings-mcp`: MCP client libraries

### 11.3 Security

- Run `pnpm audit` before every release
- Pin dependencies in `pnpm-lock.yaml`
- Use Dependabot for automated updates
- Review all dependency updates before merging

---

## 12. Open Questions

For any design questions, document them in:

- Architecture docs (`docs/ARCHITECTURE_*.md`)
- GitHub issues with `question` label
- Wait for explicit human confirmation before implementing

**Examples of questions requiring approval**:
- Should we use `jti` or `rid` for receipt ID?
- Should mandate types be generic primitives or vendor-specific?
- When should we introduce `rails-core` package?

---

## 13. Version History

- **2025-11-18**: Initial coding standards for PEAC Protocol v0.9.15
