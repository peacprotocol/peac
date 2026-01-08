# Migration Guide: v0.9.27 → v0.9.28

## Breaking Changes

### 1. Default Verification Mode Changed

**Before (v0.9.27):**

```typescript
handleVerification(request, config, options);
// Default mode: 'receipt_or_tap' (returned 402 when TAP missing)
```

**After (v0.9.28):**

```typescript
handleVerification(request, config, options);
// Default mode: 'tap_only' (returns 401 when TAP missing)
```

**Migration:**

- If you want 402 behavior, explicitly pass mode:
  ```typescript
  handleVerification(request, config, options, 'receipt_or_tap');
  ```

**Rationale:** `tap_only` is the correct default for TAP verification workers.
402 (Payment Required) should only be used when the remedy is payment/settlement.

### 2. Error Code Renamed

**Before (v0.9.27):**

```typescript
ErrorCodes.TAP_HEADERS_MISSING; // 'tap_headers_missing'
```

**After (v0.9.28):**

```typescript
ErrorCodes.TAP_SIGNATURE_MISSING; // 'E_TAP_SIGNATURE_MISSING'
```

**Migration:**

- Replace all references to `TAP_HEADERS_MISSING` with `TAP_SIGNATURE_MISSING`
- Legacy snake_case inputs (`tap_headers_missing`) are still mapped automatically

**Rationale:** Canonical E\_\* prefix aligns with RFC/IETF conventions.

### 3. New Canonical Contract Package

**Before (v0.9.27):**

```typescript
// Error codes defined in multiple places (drift risk)
import { ErrorCodes } from '@peac/worker-core';
```

**After (v0.9.28):**

```typescript
// Import from single source of truth
import { CANONICAL_ERROR_CODES, MODE_BEHAVIOR } from '@peac/contracts';
import { ErrorCodes } from '@peac/worker-core'; // Re-exports from contracts
```

**Migration:**

- For new code, prefer importing from `@peac/contracts` directly
- `@peac/worker-core` re-exports are maintained for compatibility

## New Features

### MODE_BEHAVIOR Table

Table-driven verification behavior (prevents drift):

```typescript
import { MODE_BEHAVIOR } from '@peac/contracts';

MODE_BEHAVIOR.tap_only;
// { status: 401, code: 'E_TAP_SIGNATURE_MISSING', action: 'error' }

MODE_BEHAVIOR.receipt_or_tap;
// { status: 402, code: 'E_RECEIPT_MISSING', action: 'challenge' }
```

### Canonical WWW-Authenticate Builder

```typescript
import { buildWwwAuthenticate } from '@peac/contracts';

buildWwwAuthenticate('E_TAP_SIGNATURE_MISSING');
// 'PEAC realm="peac", error="E_TAP_SIGNATURE_MISSING", error_uri="https://peacprotocol.org/problems/E_TAP_SIGNATURE_MISSING"'
```

### Type Guards

```typescript
import { isPeacErrorCode, type PeacHttpStatus } from '@peac/contracts';

if (isPeacErrorCode(code)) {
  // TypeScript narrows type to PeacErrorCode
  const status = getStatusForCode(code);
}

const status: PeacHttpStatus = 401; // 400|401|402|403|409|500
```

### Handler Factories

```typescript
import { createHandler } from '@peac/worker-core';

const safeHandler = createHandler(async (request) => {
  return await handleVerification(request, config, options);
});
// Automatically normalizes thrown errors to RFC 9457 Problem Details
// Does NOT leak error.message by default (production-safe)
```

## Security Improvements

### Error Message Sanitization

`createHandler()` now prevents error message leaking by default:

**Production (default):**

```json
{
  "type": "https://peacprotocol.org/problems/E_INTERNAL_ERROR",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected internal error occurred. Please contact support if the issue persists."
}
```

**Development only (UNSAFE_DEV_MODE=true):**

```json
{
  "type": "https://peacprotocol.org/problems/E_INTERNAL_ERROR",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "Internal error: Database connection failed"
}
```

Errors are logged server-side with trace IDs for debugging.

## HTTP Status Semantics

| Status | When to Use                                     | Error Code Example                   |
| ------ | ----------------------------------------------- | ------------------------------------ |
| 400    | Malformed TAP (unknown tags, invalid algorithm) | `E_TAP_TAG_UNKNOWN`                  |
| 401    | Missing/invalid TAP headers, signature invalid  | `E_TAP_SIGNATURE_MISSING`            |
| 402    | Receipt required (ONLY for payment remedy)      | `E_RECEIPT_MISSING`                  |
| 403    | Issuer not in allowlist                         | `E_ISSUER_NOT_ALLOWED`               |
| 409    | Replay detected                                 | `E_TAP_NONCE_REPLAY`                 |
| 500    | Configuration error                             | `E_CONFIG_ISSUER_ALLOWLIST_REQUIRED` |

**Critical:** 402 is ONLY used when the remedy is payment/settlement.
Missing TAP in `tap_only` mode returns 401 (not 402).

## Legacy Compatibility

All legacy snake_case error codes are automatically mapped:

```typescript
mapTapErrorCode('tap_headers_missing'); // → 'E_TAP_SIGNATURE_MISSING'
mapTapErrorCode('tap_nonce_replay'); // → 'E_TAP_NONCE_REPLAY'
mapTapErrorCode('tap_key_not_found'); // → 'E_TAP_KEY_NOT_FOUND'
```

Unknown codes default to `E_TAP_SIGNATURE_INVALID`.

## Testing

All packages now include comprehensive test suites:

- **@peac/contracts:** 28 contract self-validation tests
- **@peac/worker-core:** 112 tests (86 core + 26 parity)

Parity tests make contract drift impossible by asserting exact equality
with canonical definitions.
