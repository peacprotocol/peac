# @peac/contracts

**Canonical error codes and verification mode contracts for PEAC Protocol.**

This package is the **single source of truth** for error codes, HTTP status mappings, and verification mode behavior. All surface implementations (workers, middleware) MUST import from this package to prevent contract drift.

## Installation

```bash
pnpm add @peac/contracts
```

## Usage

```typescript
import {
  CANONICAL_ERROR_CODES,
  CANONICAL_STATUS_MAPPINGS,
  MODE_BEHAVIOR,
  problemTypeFor,
  ERROR_CATALOG,
  type PeacErrorCode,
  type VerificationMode,
} from '@peac/contracts';

// Get HTTP status for an error code
const status = CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID];
// 401

// Get RFC 9457 Problem Details type URI
const problemType = problemTypeFor(CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID);
// "https://peacprotocol.org/problems/E_TAP_SIGNATURE_INVALID"

// Check verification mode behavior
const modeBehavior = MODE_BEHAVIOR.tap_only;
// { noTapHeadersStatus: 401, noTapHeadersCode: 'E_TAP_SIGNATURE_MISSING' }

// Get error catalog entry
const catalogEntry = ERROR_CATALOG[CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID];
// { status: 401, title: 'Invalid Signature', defaultDetail: '...' }
```

## Exports

### Types

- `PeacErrorCode` - Union type of all canonical error codes (compile-time safety)
- `VerificationMode` - Union type: `'tap_only' | 'receipt_or_tap'`
- `ErrorCatalogEntry` - Structure for error catalog entries

### Constants

- `CANONICAL_ERROR_CODES` - All error codes with `E_*` prefix
- `CANONICAL_STATUS_MAPPINGS` - Error code → HTTP status mappings
- `CANONICAL_TITLES` - Error code → RFC 9457 title mappings
- `MODE_BEHAVIOR` - Verification mode → missing TAP behavior
- `WWW_AUTHENTICATE_STATUSES` - HTTP statuses requiring WWW-Authenticate header `[401, 402]`
- `ERROR_CATALOG` - Full error catalog with status, title, and default detail
- `PROBLEM_TYPE_BASE` - Base URI for Problem Details type field

### Functions

- `problemTypeFor(code: PeacErrorCode): string` - Get RFC 9457 type URI for error code
- `getStatusForCode(code: PeacErrorCode): number` - Get HTTP status for error code
- `requiresWwwAuthenticate(status: number): boolean` - Check if status requires WWW-Authenticate

## Error Codes

All error codes use the `E_*` prefix format:

### Receipt Errors (402 - Payment Required)

- `E_RECEIPT_MISSING` - Receipt required but not provided
- `E_RECEIPT_INVALID` - Receipt validation failed
- `E_RECEIPT_EXPIRED` - Receipt has expired

### TAP Authentication Errors (401)

- `E_TAP_SIGNATURE_MISSING` - TAP headers missing
- `E_TAP_SIGNATURE_INVALID` - Signature verification failed
- `E_TAP_TIME_INVALID` - Signature time invalid
- `E_TAP_KEY_NOT_FOUND` - Signing key not found
- `E_TAP_REPLAY_PROTECTION_REQUIRED` - Replay protection required but not configured

### TAP Malformed Request Errors (400)

- `E_TAP_WINDOW_TOO_LARGE` - Time window exceeds maximum
- `E_TAP_TAG_UNKNOWN` - Unknown signature tag
- `E_TAP_ALGORITHM_INVALID` - Invalid signature algorithm

### Authorization Errors (403 - Forbidden)

- `E_ISSUER_NOT_ALLOWED` - Issuer not in allowlist

### Replay Errors (409 - Conflict)

- `E_TAP_NONCE_REPLAY` - Nonce replay detected

### Configuration Errors (500)

- `E_CONFIG_ISSUER_ALLOWLIST_REQUIRED` - ISSUER_ALLOWLIST required but not configured
- `E_INTERNAL_ERROR` - Internal server error

## Verification Modes

### `tap_only` (Default)

Missing TAP headers → 401 + `E_TAP_SIGNATURE_MISSING`

### `receipt_or_tap`

Missing TAP headers → 402 + `E_RECEIPT_MISSING` (payment remedy)

## Contract Guarantees

This package guarantees:

1. **Single source of truth** - All error codes defined once
2. **Compile-time safety** - `PeacErrorCode` union type prevents invalid codes
3. **Consistent HTTP semantics** - Status codes match RFC semantics
4. **RFC 9457 compliance** - Problem Details type URIs follow standard format
5. **Cross-surface parity** - All surfaces use identical error codes and behavior

## License

Apache-2.0
