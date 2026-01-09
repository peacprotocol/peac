# Hot-Path Resilience Audit

Production resilience targets and design goals for PEAC Protocol verification hot-path.

**Last Updated:** 2026-01-09
**Version:** 1.0
**Status:** Informational

**NOTE:** This document describes design targets and intended behavior. Not all stated limits are currently enforced in code or verified by tests. For normative behavioral requirements, see [PROTOCOL-BEHAVIOR.md](./PROTOCOL-BEHAVIOR.md).

## Executive Summary

This document defines the resilience targets, performance goals, and fail mode design for PEAC receipt verification in production environments.

**Design Targets:**

- **O(1) parsing complexity** for bounded inputs (target)
- **Predictable failure modes** with graceful degradation (target)
- **No unbounded recursion** in critical paths (target)
- **Memory-bounded** operations with explicit limits (target)
- **Fail-closed defaults** for all security-critical decisions (implemented)

## Parsing Complexity Analysis

### JWS Parsing - O(1)

**Complexity:** O(1) for header, O(n) for payload (where n = payload size, bounded)

```typescript
// packages/protocol/src/jws.ts
function parseJWS(jws: string): ParsedJWS {
  // Split on '.' - O(1) operations (fixed 3 parts)
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }

  // Base64url decode - O(n) where n = part length (bounded by MAX_JWS_SIZE)
  const header = base64urlDecode(parts[0]);    // Bounded: max 1KB
  const payload = base64urlDecode(parts[1]);   // Bounded: max 64KB
  const signature = base64urlDecode(parts[2]); // Fixed: 64 bytes (Ed25519)

  return { header, payload, signature };
}
```

**Bounds:**
- Header: max 1KB
- Payload: max 64KB
- Signature: fixed 64 bytes (Ed25519)
- Total JWS: max 100KB (enforced at ingress)

### Claims Parsing - O(n)

**Complexity:** O(n) for JSON.parse where n = payload size (bounded to 64KB)

```typescript
// packages/schema/src/claims.ts
function parseClaims(payload: Uint8Array): PEACReceiptClaims {
  // JSON.parse - O(n) where n = payload size
  // Bounded by MAX_PAYLOAD_SIZE = 64KB
  const claims = JSON.parse(new TextDecoder().decode(payload));

  // Schema validation - O(n) where n = number of fields (bounded)
  return validateClaims(claims);
}
```

**Bounds:**
- Payload size: max 64KB
- Object depth: max 32 levels
- Array length: max 10,000 elements
- Object keys: max 1,000 per object
- String length: max 64KB per string

### Evidence Validation - O(n) Iterative

**Complexity:** O(n) where n = total nodes in evidence tree (bounded to 100k nodes)

**NO RECURSION** - Uses iterative stack-based traversal:

```typescript
// packages/schema/src/json-evidence.ts
export function assertJsonSafeIterative(value: unknown, limits: JsonEvidenceLimits): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>(); // Cycle detection
  let totalNodes = 0;

  while (stack.length > 0) {
    const { value: current, depth } = stack.pop()!;
    totalNodes++;

    // DoS protection
    if (totalNodes > limits.maxTotalNodes) {
      throw new Error(`Evidence exceeds maxTotalNodes limit (${limits.maxTotalNodes})`);
    }

    if (depth > limits.maxDepth) {
      throw new Error(`Evidence exceeds maxDepth limit (${limits.maxDepth})`);
    }

    // Validate primitive types
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new Error('Evidence contains NaN or Infinity');
      }
      continue;
    }

    if (typeof current === 'string') {
      if (current.length > limits.maxStringLength) {
        throw new Error(`String exceeds maxStringLength limit (${limits.maxStringLength})`);
      }
      continue;
    }

    if (Array.isArray(current)) {
      if (current.length > limits.maxArrayLength) {
        throw new Error(`Array exceeds maxArrayLength limit (${limits.maxArrayLength})`);
      }

      // Push array elements to stack (in reverse order for correct traversal)
      for (let i = current.length - 1; i >= 0; i--) {
        stack.push({ value: current[i], depth: depth + 1 });
      }
      continue;
    }

    if (isPlainObject(current)) {
      // Cycle detection
      if (seen.has(current)) {
        throw new Error('Evidence contains circular reference');
      }
      seen.add(current);

      const keys = Object.keys(current);
      if (keys.length > limits.maxObjectKeys) {
        throw new Error(`Object exceeds maxObjectKeys limit (${limits.maxObjectKeys})`);
      }

      // Push object values to stack
      for (const key of keys) {
        stack.push({ value: (current as any)[key], depth: depth + 1 });
      }
    }
  }
}
```

**Guarantees:**
- No recursion (stack-based)
- Bounded stack size: O(maxDepth)
- Bounded total nodes: maxTotalNodes (default 100k)
- Cycle detection via WeakSet (O(1) lookup)

**Default Limits:**

```typescript
export const JSON_EVIDENCE_LIMITS = {
  maxDepth: 32,
  maxArrayLength: 10_000,
  maxObjectKeys: 1_000,
  maxStringLength: 65_536,  // 64KB
  maxTotalNodes: 100_000,
} as const;
```

### Signature Verification - O(1)

**Complexity:** O(1) - Ed25519 signature verification is constant time

```typescript
// packages/crypto/src/sign.ts
async function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  // Ed25519 verification - O(1) constant time
  return await crypto.subtle.verify(
    { name: 'Ed25519' },
    await importKey(publicKey),
    signature,
    message
  );
}
```

**Guarantees:**
- Fixed-time execution (timing attack resistant)
- No data-dependent branches
- Input size: fixed (message hash + signature + public key)

## Memory Bounds

### Per-Request Memory Budget

| Component | Max Memory | Notes |
|-----------|------------|-------|
| JWS input | 100 KB | Enforced at ingress |
| Parsed header | 1 KB | Fixed structure |
| Parsed payload | 64 KB | Claims + extensions |
| Evidence tree | 1 MB | 100k nodes @ ~10 bytes/node |
| JWKS cache entry | 10 KB | Per issuer |
| Replay nonce entry | 100 bytes | Per nonce |
| Total per request | ~1.2 MB | Worst case |

### JWKS Cache Memory

```typescript
// packages/jwks-cache/src/cache.ts
class JWKSCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxEntries = 100;  // Max 100 issuers
  private readonly maxSizePerEntry = 10_240;  // 10KB per JWKS

  async get(url: string): Promise<JWKS> {
    // LRU eviction when full
    if (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    // Fetch and cache
    const jwks = await fetch(url);

    // Size check
    if (JSON.stringify(jwks).length > this.maxSizePerEntry) {
      throw new Error('JWKS exceeds size limit');
    }

    this.cache.set(url, { jwks, fetchedAt: Date.now() });
    return jwks;
  }
}
```

**Guarantees:**
- Bounded cache size: max 100 entries
- Bounded entry size: max 10KB per JWKS
- LRU eviction when full
- Total JWKS cache memory: max 1MB

### Replay Store Memory

```typescript
// packages/worker-core/src/replay.ts
interface ReplayStore {
  // Check if nonce exists
  has(nonce: string): Promise<boolean>;

  // Store nonce with TTL (480 seconds = 8 minutes)
  set(nonce: string, expiresAt: number): Promise<void>;
}
```

**Storage:**
- **D1 (Cloudflare):** SQL-based, atomic, no memory impact on worker
- **KV (Fastly/Akamai):** Eventually consistent, no memory impact on worker
- **Memory limit:** N/A (external storage)

**TTL:** Fixed 480 seconds (8 minutes), auto-expires old nonces

## Fail Modes and Graceful Degradation

### Fail-Closed Defaults

All security-critical decisions default to **deny**:

```typescript
// packages/worker-core/src/handle-tap.ts
export async function handleTAP(request: Request, opts: TAPOptions): Promise<Response> {
  // Empty issuer allowlist → HTTP 500
  if (!opts.issuerAllowlist || opts.issuerAllowlist.length === 0) {
    return new Response('Empty issuer allowlist', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Parse TAP headers
  const tap = parseTAPHeaders(request.headers);

  // Missing TAP in tap_only mode → HTTP 402
  if (opts.mode === 'tap_only' && !tap) {
    return new Response(JSON.stringify({
      type: 'https://peacprotocol.org/errors#E_TAP_MISSING',
      title: 'TAP Missing',
      status: 402,
    }), {
      status: 402,
      headers: {
        'WWW-Authenticate': 'PEAC realm="peac", error="tap_missing"',
        'Content-Type': 'application/problem+json',
      },
    });
  }

  // Unknown TAP tags → HTTP 400 (reject)
  if (tap && hasUnknownTags(tap)) {
    return new Response(JSON.stringify({
      type: 'https://peacprotocol.org/errors#E_TAP_TAG_UNKNOWN',
      title: 'Unknown TAP Tag',
      status: 400,
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }

  // Nonce present but no replay store → HTTP 401
  if (tap?.nonce && !opts.replayStore) {
    return new Response(JSON.stringify({
      type: 'https://peacprotocol.org/errors#E_TAP_REPLAY_PROTECTION_REQUIRED',
      title: 'Replay Protection Required',
      status: 401,
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }

  // Issuer not in allowlist → HTTP 403
  if (!opts.issuerAllowlist.includes(claims.issuer)) {
    return new Response(JSON.stringify({
      type: 'https://peacprotocol.org/errors#E_TAP_ISSUER_NOT_ALLOWED',
      title: 'Issuer Not Allowed',
      status: 403,
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }
}
```

### Error Recovery Matrix

| Failure | Response | Retryable | Degradation |
|---------|----------|-----------|-------------|
| JWS parse error | 400 | No | Fail-closed (deny) |
| Claims validation error | 400 | No | Fail-closed (deny) |
| Evidence too large | 400 | No | Fail-closed (deny) |
| Signature invalid | 401 | No | Fail-closed (deny) |
| Time validation failed | 401 | Yes (after clock sync) | Fail-closed (deny) |
| JWKS fetch failed | 503 | Yes (exponential backoff) | Fail-closed (deny) |
| Replay store unavailable | 503 | Yes | Fail-closed (deny) |
| Empty issuer allowlist | 500 | No | Fail-closed (deny) |
| Mode misconfigured | 500 | No | Fail-closed (deny) |

**Graceful Degradation:**
- JWKS fetch failure → serve cached JWKS if available (with warning)
- Replay store failure → deny all nonce-based TAPs (fail-closed)
- Evidence validation failure → deny but log for audit

### Circuit Breaker Pattern

For external dependencies (JWKS, replay store):

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  private readonly maxFailures = 5;
  private readonly timeout = 60_000;  // 60 seconds

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Open state → fail fast
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker open');
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      // Success → reset
      this.failureCount = 0;
      this.state = 'closed';
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.maxFailures) {
        this.state = 'open';
      }

      throw error;
    }
  }
}
```

**Usage:**
- JWKS fetching: open circuit after 5 consecutive failures
- Replay store: open circuit after 5 consecutive timeouts
- Half-open → allow 1 request to test recovery

## Performance Targets

### Latency Budgets

| Operation | P50 | P95 | P99 | Max |
|-----------|-----|-----|-----|-----|
| JWS parse | < 0.1ms | < 0.2ms | < 0.5ms | 1ms |
| Claims validation | < 0.1ms | < 0.2ms | < 0.5ms | 1ms |
| Evidence validation | < 1ms | < 2ms | < 5ms | 10ms |
| Signature verification | < 0.5ms | < 1ms | < 2ms | 5ms |
| JWKS fetch (cached) | < 0.1ms | < 0.2ms | < 0.5ms | 1ms |
| JWKS fetch (uncached) | < 50ms | < 100ms | < 200ms | 500ms |
| Replay check (D1) | < 1ms | < 2ms | < 5ms | 10ms |
| Replay check (KV) | < 1ms | < 3ms | < 10ms | 20ms |
| **Total verify** | **< 2ms** | **< 5ms** | **< 10ms** | **20ms** |

### Throughput Targets

- **Minimum:** 1,000 rps per worker instance
- **Target:** 10,000 rps per worker instance
- **Scale:** Linear with worker count

### Memory Targets

- **Per request:** < 1.2 MB
- **Worker baseline:** < 10 MB (caches, buffers)
- **Total per worker:** < 100 MB (at 1k rps)

## Monitoring and Observability

### Critical Metrics

```typescript
// packages/telemetry-otel/src/metrics.ts
interface VerificationMetrics {
  // Counters
  receipts_verified_total: Counter;       // By status (success/failure)
  jwks_fetches_total: Counter;            // By issuer, cached/uncached
  replay_checks_total: Counter;           // By result (allowed/denied)

  // Histograms
  verification_duration_ms: Histogram;    // P50/P95/P99
  jwks_fetch_duration_ms: Histogram;      // P50/P95/P99
  evidence_size_bytes: Histogram;         // Distribution

  // Gauges
  jwks_cache_size: Gauge;                 // Current cache entries
  jwks_cache_hit_rate: Gauge;             // Hit rate (0-1)
  circuit_breaker_state: Gauge;           // 0=closed, 1=open, 2=half-open
}
```

### Health Checks

```typescript
interface HealthCheck {
  // Service health
  status: 'healthy' | 'degraded' | 'unhealthy';

  // Component health
  components: {
    jwks_cache: 'up' | 'down';
    replay_store: 'up' | 'down';
    crypto: 'up' | 'down';
  };

  // Performance indicators
  latency_p95_ms: number;
  error_rate_5m: number;  // Last 5 minutes
}
```

### Alerts

**Critical (P0):**
- Error rate > 5% (5-minute window)
- P95 latency > 10ms (5-minute window)
- Circuit breaker open > 60 seconds
- JWKS cache hit rate < 90%

**Warning (P1):**
- Error rate > 1% (15-minute window)
- P95 latency > 5ms (15-minute window)
- Memory usage > 80% of limit

## Security Hardening

### Input Validation

All inputs validated at ingress:

```typescript
// Size limits
const MAX_JWS_SIZE = 102_400;  // 100KB
const MAX_HEADER_SIZE = 8_192;  // 8KB per header

// Format validation
function validateJWS(jws: string): void {
  if (jws.length > MAX_JWS_SIZE) {
    throw new Error('JWS exceeds size limit');
  }

  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jws)) {
    throw new Error('Invalid JWS format');
  }
}
```

### Error Message Sanitization

Production errors NEVER leak sensitive data:

```typescript
// packages/worker-core/src/errors.ts
export function sanitizeError(error: PEACError, mode: Mode): ErrorResponse {
  const response: ErrorResponse = {
    type: `https://peacprotocol.org/errors#${error.code}`,
    title: error.title,
    status: error.status,
    trace_id: generateTraceID(),
  };

  // Only include detail in UNSAFE_DEV_MODE
  if (mode === 'unsafe_dev_mode') {
    response.detail = error.message;
    response.debug = error.details;
  } else {
    // Sanitized detail (no sensitive data)
    response.detail = getSanitizedDetail(error.code);
  }

  return response;
}

function getSanitizedDetail(code: string): string {
  const SANITIZED_MESSAGES: Record<string, string> = {
    E_TAP_SIGNATURE_INVALID: 'Signature verification failed',
    E_TAP_TIME_INVALID: 'TAP outside valid time window',
    E_TAP_ISSUER_NOT_ALLOWED: 'Issuer not in allowlist',
    // ... all error codes
  };

  return SANITIZED_MESSAGES[code] || 'Verification failed';
}
```

### Rate Limiting

Per-issuer rate limiting to prevent abuse:

```typescript
// packages/worker-core/src/rate-limit.ts
class RateLimiter {
  private readonly limits = new Map<string, { count: number; resetAt: number }>();
  private readonly maxRequests = 1000;  // Per minute per issuer
  private readonly window = 60_000;     // 1 minute

  async check(issuer: string): Promise<boolean> {
    const now = Date.now();
    const limit = this.limits.get(issuer);

    if (!limit || now > limit.resetAt) {
      this.limits.set(issuer, { count: 1, resetAt: now + this.window });
      return true;
    }

    if (limit.count >= this.maxRequests) {
      return false;  // Rate limited
    }

    limit.count++;
    return true;
  }
}
```

**Limits:**
- 1,000 requests per minute per issuer
- 429 response if exceeded
- Retry-After header with reset time

## Operational Runbook

### Performance Degradation

**Symptom:** P95 latency > 10ms

**Investigation:**
1. Check JWKS cache hit rate (should be > 90%)
2. Check evidence validation time (most variable component)
3. Check replay store latency (D1 vs KV)
4. Check network latency to JWKS endpoints

**Mitigation:**
1. Increase JWKS cache TTL (if stale keys not an issue)
2. Tighten evidence limits (reduce maxTotalNodes)
3. Switch to D1 for replay (if using KV)
4. Add more worker instances (horizontal scale)

### High Error Rate

**Symptom:** Error rate > 5%

**Investigation:**
1. Check error code distribution (which errors?)
2. Check JWKS fetch failures (503 errors)
3. Check signature validation failures (401 errors)
4. Check time validation failures (401 errors)

**Mitigation:**
1. For JWKS failures: verify issuer endpoints are up
2. For signature failures: verify issuers are using correct keys
3. For time failures: verify clock synchronization

### Memory Exhaustion

**Symptom:** Worker OOM errors

**Investigation:**
1. Check evidence size distribution
2. Check JWKS cache size
3. Check request rate (high RPS can amplify memory usage)

**Mitigation:**
1. Reduce evidence limits (maxTotalNodes)
2. Reduce JWKS cache size (maxEntries)
3. Add more worker instances

## Acceptance Criteria

- [ ] All parsing operations are O(1) or O(n) with explicit bounds
- [ ] No unbounded recursion in critical paths
- [ ] Evidence validation uses iterative stack-based traversal
- [ ] Memory bounds enforced at all layers
- [ ] Fail-closed defaults for all security decisions
- [ ] Error messages sanitized in production
- [ ] Circuit breakers for external dependencies
- [ ] Performance targets met in production load tests
- [ ] Monitoring and alerting configured
- [ ] Operational runbook validated

## References

- [JSON Evidence Validation](../../packages/schema/src/json-evidence.ts)
- [Worker Core Handler](../../surfaces/workers/_shared/core/handle-tap.ts)
- [Contracts MODE_BEHAVIOR](../../packages/contracts/src/contracts/mode.ts)
- [JWKS Cache](../../packages/jwks-cache/src/cache.ts)
- [Telemetry OTel](../../packages/telemetry-otel/src/metrics.ts)
