# @peac/net-node

SSRF-safe network utilities for PEAC Protocol with DNS resolution pinning.

## Overview

This package provides a reference implementation of network-layer SSRF protection. String-level URL validation (as provided by `@peac/schema`) is necessary but **not sufficient** for complete SSRF protection. DNS rebinding attacks can bypass string-level checks by resolving to internal IPs after validation.

This package addresses the gap by:

1. Performing string-level URL validation
2. Resolving DNS and validating the resolved IP against private ranges
3. Following redirects with validation

## Requirements

- **Node.js 22+** (uses modern ES modules and native fetch)
- **ESM only** - This package is published as ES modules only

### CJS Consumers

This package is **ESM-only** (no CommonJS build). If your project uses CommonJS, use dynamic import:

```javascript
// In CommonJS - must be in async context
const { safeFetch } = await import('@peac/net-node');
```

**Wrapper pattern for CJS modules:**

```javascript
// lib/net.js - CJS wrapper
let _safeFetch;

async function getSafeFetch() {
  if (!_safeFetch) {
    const mod = await import('@peac/net-node');
    _safeFetch = mod.safeFetch;
  }
  return _safeFetch;
}

module.exports = { getSafeFetch };
```

### Package Quality Gates

This package passes [publint](https://publint.dev/) and [@arethetypeswrong/cli](https://github.com/arethetypeswrong/arethetypeswrong.github.io) (attw) with two documented ignore rules:

**attw ignore rules:**

- `cjs-resolves-to-esm` - Expected for ESM-only packages. CJS `require()` would resolve to ESM, which Node rejects at runtime. This is intentional; use dynamic `import()` instead.
- `no-resolution` - Known false positive for the `./testing` subpath export. The types resolve correctly in real TypeScript projects.

**Support matrix:**

- Node.js >= 22 (uses native fetch, ES modules)
- Modern bundlers (Webpack 5+, esbuild, Rollup, Vite) - ESM works out of the box
- TypeScript >= 5.0 with `moduleResolution: "bundler"` or `"node16"`/`"nodenext"`

**If these rules start failing in your project:**

- `cjs-resolves-to-esm`: Your toolchain is trying to `require()` this package. Switch to dynamic `import()` or configure your bundler for ESM.
- `no-resolution`: Check your `tsconfig.json` has a modern `moduleResolution` setting. The `./testing` export requires Node 16+ resolution.

### Common Tooling Configuration

**Jest (v29+):**

Jest supports ESM via `--experimental-vm-modules`. Add to `package.json`:

```json
{
  "scripts": {
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest"
  },
  "jest": {
    "extensionsToTreatAsEsm": [".ts"],
    "transform": {}
  }
}
```

Or use `jest.config.mjs` with `transformIgnorePatterns` to handle this package.

**ts-node / tsx:**

```bash
# tsx (recommended - zero config ESM)
npx tsx your-script.ts

# ts-node with ESM loader
node --loader ts-node/esm your-script.ts
```

**Bundlers (Webpack, esbuild, Rollup):**

Modern bundlers handle ESM natively. No special configuration needed.

```javascript
// webpack.config.js - ESM works out of the box
export default {
  target: 'node',
  // ... your config
};
```

```javascript
// esbuild
import { build } from 'esbuild';
await build({
  entryPoints: ['src/index.ts'],
  platform: 'node',
  format: 'esm',
  // ...
});
```

## Installation

```bash
pnpm add @peac/net-node
```

## Usage

### Basic Usage

```typescript
import { safeFetch } from '@peac/net';

const result = await safeFetch<{ keys: unknown[] }>(
  'https://issuer.example.com/.well-known/jwks.json'
);

if (result.ok) {
  console.log('JWKS:', result.data);
} else {
  console.error('Fetch failed:', result.error, result.code);
}
```

### JWKS-specific Helper

```typescript
import { safeFetchJWKS } from '@peac/net';

const result = await safeFetchJWKS('https://issuer.example.com/.well-known/jwks.json');

if (result.ok) {
  console.log('Keys:', result.data.keys);
}
```

### Custom SSRF Policy

```typescript
import { safeFetch, type SafeFetchOptions } from '@peac/net';
import { ALLOW_CGNAT_ACK } from '@peac/schema';

const options: SafeFetchOptions = {
  timeoutMs: 5000,
  maxRedirects: 3,
  ssrfPolicy: {
    // Allow specific internal hosts
    allowHosts: ['internal.example.com'],
    // Allow CGNAT range (with required acknowledgment)
    allowCgnat: true,
    ack_allow_cgnat: ALLOW_CGNAT_ACK,
  },
};

const result = await safeFetch(url, options);
```

## Security Model

### What This Package Protects Against

- **DNS Rebinding**: Validates resolved IP addresses, not just hostnames
- **Private IP Access**: Blocks requests to private/reserved IP ranges
- **Redirect Attacks**: Validates redirect destinations by default
- **IPv6 Zone ID Injection**: Rejects zone identifiers (`%eth0`, `%25eth0`)
- **IPv4-Mapped IPv6 Bypass**: Normalizes `::ffff:127.0.0.1` to `127.0.0.1` before validation
- **Homograph Attacks**: Normalizes IDNs to ASCII (punycode) before validation
- **Hop-by-Hop Header Smuggling**: Strips RFC 7230 hop-by-hop headers before forwarding
- **PSL Subdomain Bypass**: Treats github.io, vercel.app, etc. as public suffixes
- **Non-HTTPS Downgrade**: Requires HTTPS by default (HTTP blocked)
- **Non-Standard Ports**: Only 80/443 allowed by default (blocks admin ports like 22, 25, 6379)

### Scheme and Port Security (Defense in Depth)

By default, this package enforces strict scheme and port policies:

| Policy            | Default | Description                        |
| ----------------- | ------- | ---------------------------------- |
| `requireHttps`    | `true`  | Blocks HTTP URLs (HTTPS only)      |
| `allowedPorts`    | 80, 443 | Only standard ports allowed        |
| `blockIpLiterals` | `true`  | Blocks `http://1.2.3.4` style URLs |

**Why non-standard ports are blocked:**

Non-standard ports (8080, 8443, 3000, etc.) are commonly used for:

- Internal admin interfaces (Jenkins on 8080, Kubernetes dashboard on 8443)
- Database services (Redis 6379, MongoDB 27017, MySQL 3306)
- Service meshes and sidecars (Envoy 15000, Istio 15001)

Even if the hostname resolves to a public IP, connecting to a non-standard port on an attacker-controlled server could be used for:

- Port scanning internal networks (via DNS rebinding)
- SSRF to internal admin services

**To allow specific non-standard ports:**

```typescript
const result = await safeFetch(url, {
  ssrfPolicy: {
    allowPorts: [8443], // Add to the default 80/443
  },
});
```

**Dangerous Ports Blocklist (Defense in Depth):**

Even if you allow a port via `allowPorts`, certain ports are ALWAYS blocked by default as they commonly host sensitive services:

- **Remote access:** SSH (22), FTP (21), SMTP (25), Telnet (23)
- **Databases:** MySQL (3306), PostgreSQL (5432), Redis (6379), MongoDB (27017)
- **Container/orchestration:** Docker (2375/2376), etcd (2379/2380), Kubernetes API (6443)
- **Service mesh:** Envoy (15000), Istio (15001)

To connect to these dangerous ports, you MUST provide explicit acknowledgment:

```typescript
import { safeFetch, ALLOW_DANGEROUS_PORTS_ACK } from '@peac/net';

const result = await safeFetch('https://internal.example.com:22/api', {
  ssrfPolicy: {
    allowPorts: [22],
  },
  allowDangerousPorts: true,
  ack_allow_dangerous_ports: ALLOW_DANGEROUS_PORTS_ACK,
});
```

### Public Suffix List (PSL) Security

This package uses `tldts` with `allowPrivateDomains: true` for PSL lookups. This is a **deliberate security choice**:

- **Why:** Prevents attackers from bypassing allowlists via PSL subdomains
  - Without this, `malicious.github.io` would be treated as a subdomain of `github.io`
  - With this, `github.io` is correctly treated as a public suffix (like `.com`)
- **Affected domains:** github.io, vercel.app, netlify.app, pages.dev, and ~7,000 others
- **Trade-off:** Some legitimate private suffixes may be over-blocked

This setting is non-configurable by design. If you need to allow specific PSL domains, use the `allowHosts` option.

### What You Still Need

- **TLS Certificate Validation**: Handled by the runtime's fetch implementation
- **Response Size Limits**: Implement `maxResponseBytes` option or application-layer limits
- **Rate Limiting**: Implement in your application layer

## Evidence Contract

Every `safeFetch` call returns an `evidence` object suitable for audit trails, dispute resolution, and observability integration. Evidence is cryptographically bound via embedded digest.

### Evidence Fields

| Field                | Type   | Description                                              |
| -------------------- | ------ | -------------------------------------------------------- |
| `schema_version`     | string | Evidence format version (`peac-safe-fetch-evidence/0.1`) |
| `evidence_digest`    | string | SHA-256 of canonical evidence (0x-prefixed)              |
| `evidence_alg`       | string | Hash algorithm (`sha-256`)                               |
| `canonicalization`   | string | Canonicalization scheme (`RFC8785-JCS`)                  |
| `evidence_level`     | string | Redaction level (`public`, `tenant`, `private`)          |
| `request_timestamp`  | number | Request start time (epoch ms)                            |
| `response_timestamp` | number | Response headers received (epoch ms)                     |
| `policy_decision`    | string | `allow` or `block`                                       |
| `decision_code`      | string | Detailed reason code                                     |
| `audit_stats`        | object | Queue health stats (only present if drops occurred)      |
| `audit_truncated`    | true   | Present only if audit events were dropped (see below)    |

### Evidence Levels

```typescript
// Public: SHA-256 hash of IPs (default, rainbow-table vulnerable for IPv4)
const result = await safeFetch(url, { evidenceLevel: 'public' });

// Tenant: HMAC-SHA256 with tenant key (prevents cross-org correlation)
const result = await safeFetch(url, {
  evidenceLevel: 'tenant',
  redactionKey: tenantKey, // Uint8Array, >= 32 bytes
  redactionKeyId: 'key-2024', // Key identifier for rotation
});

// Private: Raw IPs included (internal audit only)
const result = await safeFetch(url, { evidenceLevel: 'private' });
```

### Digest Verification

Evidence includes a self-contained digest for verification:

```typescript
import { computeEvidenceDigest } from '@peac/net';

const result = await safeFetch(url);
if (result.ok) {
  const { evidence } = result;

  // Verify digest integrity (strip digest fields, recompute)
  const recomputed = computeEvidenceDigest(evidence);
  console.assert(recomputed === evidence.evidence_digest);
}
```

## OpenTelemetry Integration

Evidence can be exported to OpenTelemetry for observability.

### Span Attributes

```typescript
import { trace } from '@opentelemetry/api';
import { safeFetch } from '@peac/net';

const tracer = trace.getTracer('my-service');

async function fetchWithTracing(url: string) {
  return tracer.startActiveSpan('safe-fetch', async (span) => {
    const result = await safeFetch(url);

    if (result.ok) {
      const { evidence } = result;

      // Add evidence as span attributes
      span.setAttributes({
        'peac.evidence_digest': evidence.evidence_digest,
        'peac.policy_decision': evidence.policy_decision,
        'peac.decision_code': evidence.decision_code,
        'peac.canonical_host': evidence.canonical_host,
        'peac.elapsed_ms': evidence.elapsed_ms,
        'peac.evidence_level': evidence.evidence_level,
      });

      // Add audit health if drops occurred
      if (evidence.audit_truncated) {
        span.setAttributes({
          'peac.audit.truncated': true,
          'peac.audit.dropped': evidence.audit_stats?.dropped,
          'peac.audit.pending': evidence.audit_stats?.pending,
        });
      }
    } else {
      span.setAttributes({
        'peac.error_code': result.code,
        'peac.policy_decision': 'block',
      });
    }

    span.end();
    return result;
  });
}
```

### JSONL Export for SIEM

```typescript
import { appendFileSync } from 'fs';
import { safeFetch } from '@peac/net';

async function fetchWithAuditLog(url: string) {
  const result = await safeFetch(url);

  // Export to JSONL for SIEM ingestion (Splunk, Elastic, etc.)
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'safe_fetch_evidence',
    url,
    ok: result.ok,
    evidence: result.ok ? result.evidence : result.evidence,
  };

  appendFileSync('/var/log/peac-evidence.jsonl', JSON.stringify(logEntry) + '\n');

  return result;
}
```

### Audit Event Hook

For real-time observability, use the audit hook:

```typescript
const result = await safeFetch(url, {
  onEvent: (event) => {
    // Export to OTel, StatsD, Prometheus, etc.
    if (event.type === 'audit_overflow') {
      // Evidence quality degraded - alert
      console.warn('Audit queue overflow:', event.meta);
    }
  },
});
```

### Hook Contract

The `onEvent` hook provides real-time observability into fetch operations. To build reliable integrations, understand these guarantees:

| Property               | Guarantee           | Notes                                                               |
| ---------------------- | ------------------- | ------------------------------------------------------------------- |
| **Delivery**           | Asynchronous        | Events are queued via `queueMicrotask` (non-blocking to fetch path) |
| **Ordering**           | FIFO within request | Events arrive in fetch order for a single request                   |
| **Delivery guarantee** | At-most-once        | Events may be dropped under load (bounded queue)                    |
| **Exceptions**         | Swallowed           | Hook MUST NOT throw; exceptions are silently caught                 |
| **Side effects**       | None allowed        | Hook MUST NOT modify request/response or call `safeFetch`           |

**Special events:**

- `audit_overflow`: Emitted **synchronously** (not queued) when audit queue is full. Rate-limited to 1 per second to prevent log spam.
- `audit_hook_error`: Emitted when the hook throws an exception. Rate-limited to 1 per second. Contains:
  - `error_message`: Sanitized error message (truncated to 200 chars, secrets redacted by default)
  - `error_count`: Cumulative count of hook errors (**per-process lifetime**)
  - `hook_name`: Name of the hook that threw (`'onEvent'`)
  - `error_code`: Error code if available (e.g., `ECONNRESET`)
  - `original_event_type`: The event type that triggered the hook error
  - `suppressed_count`: Number of hook errors suppressed by rate limiting (**per-process lifetime**)

**Counter semantics:**

All counters in evidence are **request-scoped** (per-safeFetch invocation):

| Field in `audit_stats` | Scope       | Description                                   |
| ---------------------- | ----------- | --------------------------------------------- |
| `pending`              | Per-request | Events pending at evidence finalization       |
| `dropped`              | Per-request | Events dropped due to queue overflow          |
| `hook_errors`          | Per-request | Hook errors that occurred during this request |
| `hook_suppressed`      | Per-request | Hook errors suppressed by rate limiting       |

Note: All counters in `audit_stats` are specific to **this request** only. They reset for each `safeFetch` call, ensuring evidence accurately describes that specific request without noise from other concurrent requests.

**Customizing error sanitization:**

```typescript
// Use custom sanitizer
const result = await safeFetch(url, {
  onEvent: myHook,
  sanitizeHookError: (msg) => msg.replace(/sensitive/gi, '[REDACTED]'),
});

// Disable sanitization (NOT RECOMMENDED in production)
const result = await safeFetch(url, {
  onEvent: myHook,
  sanitizeHookError: 'off',
});
```

NOTE: `error_message` is NOT stable for parsing; use the structured fields instead.

**Integration pattern:**

```typescript
const result = await safeFetch(url, {
  onEvent: (event) => {
    // Safe: fire-and-forget to external system
    telemetry.emit(event).catch(() => {});

    // Safe: increment counter
    metrics.increment(`peac.${event.type}`);

    // UNSAFE: DO NOT call safeFetch from hook
    // UNSAFE: DO NOT throw exceptions
    // UNSAFE: DO NOT modify event object
  },
});
```

**Observability recommendations:**

1. **Alert on `audit_overflow`** - indicates evidence quality degradation
2. **Alert on `audit_hook_error`** - indicates hook implementation issues (check `meta.error_message`)
3. **Check `audit_truncated`** - if `true`, evidence is incomplete for compliance/audit purposes
4. **Track `audit_stats.dropped`** - monitor evidence loss over time
5. **Export `evidence_digest`** - enables cross-system correlation

**Exception handling:**

Hook exceptions are caught and an `audit_hook_error` event is emitted (rate-limited to 1 per second). This provides observability without causing recursion. Key behaviors:

- **Sanitization**: Error messages are truncated to 200 chars and have secrets redacted (Bearer tokens, passwords, keys)
- **Structured fields**: Includes `error_code`, `original_event_type` for debugging
- **Recursion guard**: If the `audit_hook_error` event handler itself throws, that exception is silently discarded to prevent infinite loops

For additional debugging, you can wrap your hook in a try/catch:

```typescript
onEvent: (event) => {
  try {
    myHandler(event);
  } catch (err) {
    // Log to dedicated error channel, NOT via safeFetch
    errorLogger.error('Hook failed', { error: err, eventType: event.type });
  }
};
```

**Execution model:**

- Hooks are **fire-and-forget** - the hook function is invoked but NOT awaited
- The fetch completes regardless of hook execution status
- Slow hooks do NOT block the fetch response
- Hook microtasks execute after the current task completes

**Non-reentrancy rule:**

Hooks MUST NOT call `safeFetch` or any function that transitively calls `safeFetch`. This would cause:

1. Infinite recursion (each fetch triggers hooks, which trigger fetches)
2. Queue exhaustion and dropped events
3. Unpredictable memory growth

The implementation does NOT detect reentrancy - it is the caller's responsibility.

**Backpressure and overflow:**

When the audit queue is full (default: 1000 pending events), the following occurs:

1. New events for that request are **dropped** (not queued)
2. An `audit_overflow` event is emitted **synchronously** to the hook
3. `audit_overflow` is rate-limited to **1 per second** (prevents log spam)
4. The `audit_stats` field in evidence will show `dropped > 0`
5. The `audit_truncated` field in evidence will be `true`

**Partial loss semantics:** When overflow occurs during a request, that specific request's events may be partially lost. The request itself completes normally - only observability is degraded.

**`audit_truncated` presence semantics (NORMATIVE):**

This field uses **presence semantics** to ensure cross-implementation digest compatibility:

- **Present and `true`**: Audit event stream is incomplete, some events were dropped
- **Absent (undefined)**: Evidence is complete, no truncation occurred

**Normative rules:**

- Producers MUST omit `audit_truncated` when no truncation occurred
- Producers MUST NOT emit `audit_truncated: false`
- Consumers SHOULD treat absent `audit_truncated` as "not truncated"

The reason for presence semantics: `{ ...core }` and `{ ...core, audit_truncated: false }` produce different canonical JSON and thus different digests. By requiring omission when false, we guarantee that two implementations producing logically identical evidence will compute the same digest.

**Interpretation:**

- `audit_truncated: true` means "audit event stream is incomplete" - some events were dropped
- This does NOT mean the evidence is invalid or the request failed
- **Recommended policy**: Treat records with `audit_truncated: true` as having **degraded observability**, not failed verification
- The fetch result, evidence digest, and policy decision are still valid and cryptographically bound
- For compliance-critical use cases, consider alerting on `audit_truncated: true` and investigating capacity issues

**Recommended integration with correlation:**

```typescript
import { randomUUID } from 'crypto';
import { safeFetch } from '@peac/net';

async function fetchWithCorrelation(url: string, correlationId?: string) {
  const requestId = correlationId ?? randomUUID();

  return safeFetch(url, {
    onEvent: (event) => {
      // Attach correlation ID for distributed tracing
      const enriched = {
        ...event,
        correlation_id: requestId,
        service: 'my-service',
        timestamp: Date.now(),
      };

      // Fire-and-forget to telemetry
      telemetry.emit(enriched).catch(() => {});

      // Alert on quality degradation
      if (event.type === 'audit_overflow') {
        alerting.warn('Evidence quality degraded', {
          correlation_id: requestId,
          dropped: event.meta?.dropped,
        });
      }
    },
  });
}
```

## Policy Layering (Defense in Depth)

This package implements defense-in-depth through layered validation. Understanding which layer blocks a request helps with debugging and policy design.

### Validation Layers

```text
Request URL
    |
    v
+-------------------+
| Layer 1: Schema   |  <-- @peac/schema (string-level)
| - URL structure   |      Blocks: invalid URLs, non-HTTPS, non-standard ports
| - allowPorts      |      Error: E_NET_SSRF_URL_REJECTED
| - allowHosts      |
+-------------------+
    |
    v
+-------------------+
| Layer 2: Net      |  <-- @peac/net (runtime)
| - Dangerous ports |      Blocks: ports in DANGEROUS_PORTS set
| - DNS resolution  |      Error: E_NET_SSRF_DANGEROUS_PORT
| - IP validation   |
| - Redirect policy |
+-------------------+
    |
    v
  Fetch
```

### Layer Responsibilities

| Layer  | Package        | Validates                                             | Error Prefix                  |
| ------ | -------------- | ----------------------------------------------------- | ----------------------------- |
| Schema | `@peac/schema` | URL structure, scheme, port allowlist, host allowlist | `E_NET_SSRF_URL_*`            |
| Net    | `@peac/net`    | Dangerous ports, DNS resolution, IP ranges, redirects | `E_NET_SSRF_*`, `E_NET_DNS_*` |

### Why Two Layers?

**Schema layer** provides fast, string-level rejection of obviously invalid requests. This is cheap and can be done before any network I/O.

**Net layer** provides runtime security that requires network operations:

- DNS resolution to detect rebinding attacks
- IP range validation against resolved addresses
- Redirect chain validation

### Example: Port 22 (SSH)

```typescript
// Scenario 1: Port 22 not in allowPorts
// Result: BLOCKED at Schema layer (E_NET_SSRF_URL_REJECTED)
await safeFetch('https://example.com:22/api');

// Scenario 2: Port 22 in allowPorts, no dangerous port ack
// Result: BLOCKED at Net layer (E_NET_SSRF_DANGEROUS_PORT)
await safeFetch('https://example.com:22/api', {
  ssrfPolicy: { allowPorts: [22] },
});

// Scenario 3: Full acknowledgment chain
// Result: ALLOWED (with warning in evidence)
await safeFetch('https://example.com:22/api', {
  ssrfPolicy: { allowPorts: [22] },
  allowDangerousPorts: true,
  ack_allow_dangerous_ports: ALLOW_DANGEROUS_PORTS_ACK,
});
```

### Redirect Hop Validation

Both layers are applied to **every hop** in a redirect chain:

```typescript
// Initial URL: https://example.com/api (port 443, passes both layers)
// Redirect to: https://internal.example.com:22/data
//
// Even though the initial request passes, the redirect target
// is validated through both layers again:
// - Schema: port 22 must be in allowPorts
// - Net: port 22 requires DANGEROUS_PORTS acknowledgment
```

## API Reference

### `safeFetch<T>(url, options?)`

SSRF-safe fetch with DNS resolution pinning.

**Parameters:**

- `url`: The URL to fetch
- `options`: Optional configuration (see `SafeFetchOptions`)

**Returns:** `Promise<SafeFetchResult<T>>`

### `safeFetchJWKS(url, options?)`

Convenience wrapper for JWKS endpoints with:

- 10 second timeout (default)
- No redirects allowed
- Type-safe `{ keys: unknown[] }` response

### `SafeFetchOptions`

| Option                    | Type         | Default               | Description                        |
| ------------------------- | ------------ | --------------------- | ---------------------------------- |
| `ssrfPolicy`              | `SSRFPolicy` | `DEFAULT_SSRF_POLICY` | SSRF protection configuration      |
| `timeoutMs`               | `number`     | `30000`               | Request timeout in milliseconds    |
| `maxRedirects`            | `number`     | `5`                   | Maximum redirects to follow        |
| `allowCrossHostRedirects` | `boolean`    | `false`               | Allow redirects to different hosts |

### Error Codes

| Code                                    | Description                             |
| --------------------------------------- | --------------------------------------- |
| `E_NET_SSRF_URL_REJECTED`               | URL failed string-level validation      |
| `E_NET_SSRF_DNS_RESOLVED_PRIVATE`       | DNS resolved to private IP              |
| `E_NET_SSRF_ALL_IPS_BLOCKED`            | All resolved IPs failed validation      |
| `E_NET_SSRF_REDIRECT_BLOCKED`           | Redirect blocked by policy              |
| `E_NET_SSRF_TOO_MANY_REDIRECTS`         | Exceeded max redirects                  |
| `E_NET_SSRF_ALLOWCIDRS_ACK_REQUIRED`    | Dangerous CIDR escape hatch missing ack |
| `E_NET_SSRF_DANGEROUS_PORT`             | Port in dangerous ports blocklist       |
| `E_NET_SSRF_DANGEROUS_PORT_ACK_MISSING` | Dangerous port requires explicit ack    |
| `E_NET_SSRF_IPV6_ZONE_ID`               | IPv6 zone identifier detected           |
| `E_NET_SSRF_INVALID_HOST`               | Hostname failed canonicalization        |
| `E_NET_TENANT_KEY_MISSING`              | Tenant mode missing redactionKey/keyId  |
| `E_NET_DNS_RESOLUTION_FAILED`           | DNS lookup failed                       |
| `E_NET_REQUEST_TIMEOUT`                 | Request timed out                       |
| `E_NET_NETWORK_ERROR`                   | General network error                   |

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
