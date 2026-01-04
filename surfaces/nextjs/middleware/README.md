# @peac/middleware-nextjs

> PEAC TAP verifier and 402 access gate for Next.js Edge Runtime

## Features

- **TAP Verification**: Verify Visa Trusted Agent Protocol signatures at the edge
- **402 Access Gate**: Return payment challenges for unauthenticated requests
- **Replay Protection**: Pluggable nonce deduplication with LRU fallback
- **RFC 9457 Errors**: Structured problem+json error responses
- **Issuer Allowlist**: Restrict which TAP issuers are accepted
- **Path Bypass**: Skip verification for specific paths

## Quick Start

```typescript
// middleware.ts
import { createPeacMiddleware, LRUReplayStore } from '@peac/middleware-nextjs';

export const middleware = createPeacMiddleware({
  issuerAllowlist: ['https://trusted-agent.example.com'],
  bypassPaths: ['/api/health', '/public/**'],
  replayStore: new LRUReplayStore(), // Best-effort, per-isolate
});

export const config = {
  matcher: '/api/:path*',
};
```

## Configuration

| Option                   | Type                               | Default            | Description                    |
| ------------------------ | ---------------------------------- | ------------------ | ------------------------------ |
| `mode`                   | `"receipt_or_tap"` \| `"tap_only"` | `"receipt_or_tap"` | Verification mode              |
| `issuerAllowlist`        | `string[]`                         | **REQUIRED**       | Allowed issuer origins         |
| `bypassPaths`            | `string[]`                         | `[]`               | Paths to skip verification     |
| `replayStore`            | `ReplayStore`                      | `undefined`        | Nonce replay protection        |
| `unsafeAllowAnyIssuer`   | `boolean`                          | `false`            | UNSAFE: Skip issuer check      |
| `unsafeAllowUnknownTags` | `boolean`                          | `false`            | UNSAFE: Allow unknown TAP tags |
| `unsafeAllowNoReplay`    | `boolean`                          | `false`            | UNSAFE: Skip replay protection |

## Verification Modes

### `receipt_or_tap` (default)

- TAP headers present + valid: Forward to origin (200)
- TAP headers present + invalid: Error response (4xx)
- **No TAP headers: 402 Payment Required**

### `tap_only`

- TAP headers present + valid: Forward to origin (200)
- TAP headers present + invalid: Error response (4xx)
- **No TAP headers: 401 Signature Missing**

## Security Defaults (Fail-Closed)

| Invariant                  | Default                   | Override                      |
| -------------------------- | ------------------------- | ----------------------------- |
| Issuer allowlist required  | 500 error if empty        | `unsafeAllowAnyIssuer=true`   |
| Unknown TAP tags rejected  | 400 error                 | `unsafeAllowUnknownTags=true` |
| Replay protection required | 401 if nonce but no store | `unsafeAllowNoReplay=true`    |
| Max window                 | 400 if > 480s (8 min)     | None (per Visa spec)          |

## Error Codes

| Code                                 | Status | Meaning                              |
| ------------------------------------ | ------ | ------------------------------------ |
| `E_RECEIPT_MISSING`                  | 402    | No TAP headers (receipt_or_tap mode) |
| `E_TAP_SIGNATURE_MISSING`            | 401    | No TAP headers (tap_only mode)       |
| `E_TAP_SIGNATURE_INVALID`            | 401    | Signature verification failed        |
| `E_TAP_TIME_INVALID`                 | 401    | Timestamp validation failed          |
| `E_TAP_WINDOW_TOO_LARGE`             | 400    | Window > 8 minutes                   |
| `E_TAP_TAG_UNKNOWN`                  | 400    | Unknown TAP tag                      |
| `E_TAP_ALGORITHM_INVALID`            | 400    | Wrong algorithm (must be ed25519)    |
| `E_TAP_KEY_NOT_FOUND`                | 401    | Key not found at JWKS endpoint       |
| `E_TAP_NONCE_REPLAY`                 | 409    | Nonce replay detected                |
| `E_TAP_REPLAY_PROTECTION_REQUIRED`   | 401    | Nonce present but no replay store    |
| `E_ISSUER_NOT_ALLOWED`               | 403    | Issuer not in allowlist              |
| `E_CONFIG_ISSUER_ALLOWLIST_REQUIRED` | 500    | Empty allowlist (misconfiguration)   |

## Replay Protection

### Option 1: LRU Store (Best-Effort)

```typescript
import { createPeacMiddleware, LRUReplayStore } from '@peac/middleware-nextjs';

export const middleware = createPeacMiddleware({
  issuerAllowlist: ['https://issuer.example.com'],
  replayStore: new LRUReplayStore({ maxEntries: 1000 }),
});
```

**WARNING**: LRU store is per-isolate only. Different edge instances have separate caches.
This provides best-effort protection but is NOT globally consistent.
A warning header `PEAC-Warning: replay-best-effort` is added to responses.

### Option 2: External Store (Recommended for Production)

Implement the `ReplayStore` interface with Redis, database, or other distributed store:

```typescript
interface ReplayStore {
  seen(ctx: ReplayContext): Promise<boolean>;
}
```

### Option 3: No Replay Protection (UNSAFE)

```typescript
export const middleware = createPeacMiddleware({
  issuerAllowlist: ['https://issuer.example.com'],
  unsafeAllowNoReplay: true, // NOT recommended for production
});
```

## Parity with Cloudflare Worker

This middleware maintains exact behavioral parity with `@peac/worker-cloudflare`:

- Same error codes and status mappings
- Same fail-closed security defaults
- Same replay protection semantics
- Same TAP validation rules (8-min window, ed25519 only, tag allowlist)

## Response Headers

On successful verification:

```
PEAC-Verified: true
PEAC-Engine: tap
PEAC-TAP-Tag: agent-browser-auth
```

Warnings (if applicable):

```
PEAC-Warning: replay-best-effort     # LRU store in use
PEAC-Warning: replay-protection-disabled  # unsafeAllowNoReplay=true
```

## License

Apache-2.0
