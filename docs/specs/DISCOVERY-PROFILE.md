# Discovery Profile

**Version:** 0.1
**Status:** Normative
**Package:** `@peac/mappings-a2a`
**Depends on:** Evidence Carrier Contract (DD-124), A2A Receipt Profile

This document specifies the 3-step discovery algorithm for detecting PEAC evidence support at a given endpoint. It covers Agent Card inspection, well-known file discovery, header probing, and SSRF protection requirements.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174 (when, and only when, they appear in all capitals).

## 1. Overview

Before exchanging PEAC evidence with an endpoint, a client needs to discover whether the endpoint supports PEAC and what capabilities it offers. The discovery algorithm provides three mechanisms, tried in order of specificity.

## 2. Discovery Algorithm (DD-110)

The algorithm tries three steps in sequence, returning the first successful result:

### Step 1: Agent Card

Check if the endpoint publishes an A2A Agent Card with a PEAC extension declared.

1. Fetch `{baseUrl}/.well-known/agent-card.json` (A2A v0.3.0 canonical path)
2. If 404, try `{baseUrl}/.well-known/agent.json` (legacy fallback)
3. Parse the Agent Card JSON
4. Look for PEAC extension in `capabilities.extensions[]` with URI `https://www.peacprotocol.org/ext/traceability/v1`
5. If found, return capabilities from the extension's `params` field

**Result source:** `agent_card`

### Step 2: Well-Known PEAC File

Check if the endpoint publishes a standalone PEAC discovery file.

1. Fetch `{baseUrl}/.well-known/peac.json`
2. Parse the JSON response
3. Extract capabilities: `supported_kinds`, `carrier_formats`, `jwks_uri`

This step supports endpoints that implement PEAC but do not publish A2A Agent Cards (standalone PEAC issuers, HTTP middleware, payment gateways).

**Result source:** `well_known`

**Schema for `/.well-known/peac.json`:**

```json
{
  "supported_kinds": ["peac-receipt/0.1"],
  "carrier_formats": ["embed", "reference"],
  "jwks_uri": "https://issuer.example.com/.well-known/jwks.json"
}
```

| Field             | Type       | Required | Description                                        |
| ----------------- | ---------- | -------- | -------------------------------------------------- |
| `supported_kinds` | `string[]` | SHOULD   | Wire format versions (default: `peac-receipt/0.1`) |
| `carrier_formats` | `string[]` | SHOULD   | Supported formats: `embed`, `reference`            |
| `jwks_uri`        | `string`   | MAY      | URI for public keys                                |

### Step 3: Header Probe

Send a HEAD request and check for the presence of a `PEAC-Receipt` header.

1. Send `HEAD {baseUrl}`
2. Check response headers for `PEAC-Receipt` (case-insensitive per RFC 9110)
3. If present, the endpoint supports PEAC (minimal capabilities assumed)

This step provides a lightweight signal but offers limited capability information. Implementations SHOULD prefer Step 1 or Step 2 for richer discovery.

**Result source:** `header_probe`

## 3. Discovery Result

```typescript
interface PeacDiscoveryResult {
  /** How capabilities were discovered */
  source: 'agent_card' | 'well_known' | 'header_probe';
  /** Supported wire format kinds */
  kinds: string[];
  /** Supported carrier formats */
  carrier_formats: CarrierFormat[];
  /** URI for public keys (if available) */
  jwks_uri?: string;
}
```

If no step succeeds, `discoverPeacCapabilities()` returns `null`.

## 4. SSRF Protection Requirements

All network-facing discovery functions MUST implement the following protections:

### 4.1 Private IP and DNS Rebinding Defense

Implementations MUST reject requests to private and reserved IP ranges:

- RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- RFC 4193: `fc00::/7` (ULA)
- Loopback: `127.0.0.0/8`, `::1`
- Link-local: `169.254.0.0/16`, `fe80::/10`

Two enforcement levels are defined:

1. **Literal IP check (MUST):** Implementations MUST check the URL hostname against private ranges when it is a literal IP address.
2. **DNS resolution check (SHOULD):** When the caller provides a `resolveHostname` callback (or equivalent), implementations SHOULD resolve the hostname and check all returned IP addresses against private ranges before connecting. This defends against DNS rebinding attacks where a hostname initially resolves to a public IP, then re-resolves to a private IP.

Implementations that only perform literal IP checks MUST document the weaker posture. The `resolveHostname` option provides full DNS rebinding protection in a portable, runtime-agnostic way.

### 4.2 Scheme Allowlist

Only `https:` in production. `http:` is permitted ONLY for `localhost`/`127.0.0.1`/`::1` when an explicit `allowInsecureLocalhost: true` option is passed.

### 4.3 Response Size Cap

Maximum response body: 256 KB. Abort on exceed (check both `Content-Length` header and actual body length).

### 4.4 Content-Type Check

Reject non-JSON responses. Accept `application/json` or `application/*+json`.

### 4.5 Redirect Policy

`redirect: "error"` (no following redirects). This prevents SSRF via redirect to internal services.

### 4.6 Timeout

5 seconds maximum per request.

### 4.7 Proxy Policy

Discovery functions MUST NOT implicitly enable proxying: implementations MUST NOT parse proxy environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`) or call runtime APIs that globally enable proxying (such as Node.js `http.setGlobalProxyFromEnv()`).

If the runtime has globally enabled proxying (for example via Node.js `--use-env-proxy` flag or `NODE_USE_ENV_PROXY` environment variable), the caller MUST provide an explicit `fetch` implementation via `DiscoveryOptions.fetch` to control proxy behavior. Implementations SHOULD document this requirement.

### 4.8 Userinfo Rejection

Implementations MUST reject URLs containing userinfo (`user:pass@host`). URLs with embedded credentials create confusion in allowlists and logs, and are a potential vector for credential leakage.

## 5. Caching

Implementations MAY cache discovery results. Recommended cache behavior:

| Source         | Recommended TTL | Rationale                             |
| -------------- | --------------- | ------------------------------------- |
| `agent_card`   | 1 hour          | Agent Cards change infrequently       |
| `well_known`   | 1 hour          | Well-known files are semi-static      |
| `header_probe` | 5 minutes       | Header presence can change per-deploy |

Cache keys SHOULD be based on the normalized base URL (scheme + host + port).

## 6. Security Considerations

### 6.1 Discovery Does Not Imply Trust

Discovering PEAC support at an endpoint does NOT establish trust. Receipt verification (signature validation, issuer checking) is a separate step that MUST be performed regardless of discovery results.

### 6.2 Well-Known File Integrity

The `/.well-known/peac.json` file is served over HTTPS, providing transport integrity. However, the file itself is not signed. Implementations SHOULD verify the `jwks_uri` separately before trusting public keys discovered through it.

### 6.3 Agent Card Spoofing

An Agent Card claiming PEAC support does not guarantee the agent will actually attach valid receipts. Consumers MUST validate receipts independently.

## 7. Conformance

An implementation is conformant with this profile if it:

1. Implements the 3-step discovery algorithm in order
2. Returns `null` when no step succeeds
3. Applies all SSRF protections listed in Section 4
4. Returns a `PeacDiscoveryResult` with correct `source` field
5. Does not follow redirects during discovery
6. Rejects URLs containing userinfo (Section 4.8)
7. Performs DNS resolution checks when a `resolveHostname` resolver is provided (Section 4.1)
