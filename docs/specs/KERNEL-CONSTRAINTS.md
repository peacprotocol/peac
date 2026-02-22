# Kernel Constraints

> Normative structural limits for PEAC receipt claims.
>
> Design decisions: DD-60 (formalization), DD-121 (pipeline enforcement).

## Overview

Kernel constraints define hard structural limits that all PEAC receipts MUST respect. They prevent denial-of-service via bloated JSON, bound memory allocation during verification, and ensure interoperability across implementations.

These constraints are enforced fail-closed: any violation causes issuance to reject (before signing) and verification to reject (after decode, before schema validation).

## Constraints

| Constraint           | Value   | Unit                 | Provenance                       |
| -------------------- | ------- | -------------------- | -------------------------------- |
| `MAX_NESTED_DEPTH`   | 32      | levels               | `JSON_EVIDENCE_LIMITS` (json.ts) |
| `MAX_ARRAY_LENGTH`   | 10,000  | elements             | `JSON_EVIDENCE_LIMITS` (json.ts) |
| `MAX_OBJECT_KEYS`    | 1,000   | keys per object      | `JSON_EVIDENCE_LIMITS` (json.ts) |
| `MAX_STRING_LENGTH`  | 65,536  | code units (.length) | `JSON_EVIDENCE_LIMITS` (json.ts) |
| `MAX_TOTAL_NODES`    | 100,000 | nodes                | `JSON_EVIDENCE_LIMITS` (json.ts) |
| `CLOCK_SKEW_SECONDS` | 60      | seconds              | DD-8 temporal validity           |

### String length measurement

String length is measured in JavaScript code units (`.length`), matching the semantics of `assertJsonSafeIterative()`. UTF-8 byte-length caps may be introduced as an explicit tightening in a future version.

### Scope

Structural constraints (`MAX_NESTED_DEPTH` through `MAX_TOTAL_NODES`) are enforced by the `validateKernelConstraints()` function. The semantic constraint `CLOCK_SKEW_SECONDS` is enforced by receipt verification (iat/exp checks), not the structural validator.

Payment/rail-specific limits (DD-16 x402 DoS guards) are intentionally excluded: they belong in the rail/adapter layer, not the kernel.

## Enforcement Points

### Ordering Precedence (normative)

Constraint validation MUST run before expensive operations (JWKS fetch, signature verification, schema parsing) to provide DoS resistance: malformed or bloated payloads are rejected cheaply before triggering network I/O or crypto operations.

The verification pipeline ordering is: **decode -> constraint check -> schema parse -> expiry check -> JWKS fetch -> signature verify**. This ordering ensures that constraint violations are caught before any outbound network request or CPU-intensive cryptographic operation.

Constraint validation MUST NOT mask signature failures: if a payload is structurally valid (passes constraints) but has an invalid signature, the signature failure MUST be reported as the primary reason. Constraints gate entry to the expensive pipeline, but do not suppress downstream failures.

### Issuance (`issue()`)

Constraint validation runs **after** the claims object is built and **before** Zod schema validation and Ed25519 signing.

On violation: `IssueError` is thrown with a `PEACError` containing:

- `code`: `E_CONSTRAINT_VIOLATION`
- `category`: `validation`
- `severity`: `error`
- `retryable`: `false`
- `http_status`: `400`
- `details.violations`: array of `ConstraintViolation` objects

### Verification (`verifyLocal()`)

Constraint validation runs **after** JWS signature verification succeeds and **before** `parseReceiptClaims()` schema validation.

On violation: returns `VerifyLocalFailure` with:

- `code`: `E_CONSTRAINT_VIOLATION`
- `message`: describes which constraint was violated and the actual vs. limit values

### Verification (`verifyReceipt()`)

Constraint validation runs **after** JWS decode and **before** `ReceiptClaims.parse()` schema validation.

On violation: returns `VerifyFailure` with:

- `reason`: `constraint_violation`
- `details`: describes which constraint was violated

## Validation Function

```typescript
import { validateKernelConstraints } from '@peac/schema';

const result = validateKernelConstraints(claims);
if (!result.valid) {
  // result.violations: ConstraintViolation[]
  // Each violation: { constraint, actual, limit, path? }
}
```

### Properties

- Never throws: always returns a result object
- Stack-safe: uses iterative traversal (no recursion limit)
- Cycle-safe: terminates at `MAX_TOTAL_NODES` if cyclic input
- Aligned with `assertJsonSafeIterative()` traversal semantics
- Every value (primitives, arrays, objects) is counted toward total nodes

## Types

```typescript
interface ConstraintViolation {
  constraint: KernelConstraintKey;
  actual: number;
  limit: number;
  path?: string;
}

interface ConstraintValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
}

type KernelConstraintKey =
  | 'MAX_NESTED_DEPTH'
  | 'MAX_ARRAY_LENGTH'
  | 'MAX_OBJECT_KEYS'
  | 'MAX_STRING_LENGTH'
  | 'MAX_TOTAL_NODES'
  | 'CLOCK_SKEW_SECONDS';
```

## Error Codes

| Code                     | HTTP | Context                | Description                           |
| ------------------------ | ---- | ---------------------- | ------------------------------------- |
| `E_CONSTRAINT_VIOLATION` | 400  | Issuance, verification | Structural kernel constraint violated |

## Cross-References

- `packages/schema/src/constraints.ts`: constraint constants and validation function
- `packages/protocol/src/issue.ts`: issuance enforcement point
- `packages/protocol/src/verify-local.ts`: local verification enforcement point
- `packages/protocol/src/verify.ts`: JWKS verification enforcement point
- `docs/specs/PROTOCOL-BEHAVIOR.md`: protocol behavior specification
- `docs/specs/ERRORS.md`: error code registry
