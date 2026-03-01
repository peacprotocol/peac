# Multi-Tenant Receipt Isolation Guide

**Version:** 0.1
**Since:** v0.11.3
**Design Decision:** DD-149

This guide describes three tiers of receipt isolation for multi-tenant PEAC deployments. Each tier trades simplicity for stronger isolation between tenants.

## Overview

Multi-tenant platforms that issue PEAC receipts on behalf of multiple tenants need to decide how to isolate receipt signing keys and issuer identities. The choice affects:

- **Key compromise blast radius**: How many tenants are affected if a signing key is compromised
- **Cross-tenant receipt visibility**: Whether one tenant's receipts can be correlated with another's
- **Operational complexity**: Key management overhead per tier
- **Verifier requirements**: What verifiers need to discover and validate receipts

## Tier 1: Shared (Simplest)

### Architecture

All tenants share a single JWKS, a single signing key, and a single `iss` origin.

```text
Issuer: https://platform.example
JWKS:   https://platform.example/.well-known/jwks.json
Keys:   1 active key (kid: "prod-2026-03")
```

All tenant receipts are signed with the same key and carry the same `iss`:

```json
{
  "iss": "https://platform.example",
  "sub": "agent:tenant-abc/service-v2",
  "iat": 1709000000,
  "jti": "rcpt_01HQXYZ123456789"
}
```

Tenant isolation relies on the `sub` claim or an extension:

```json
{
  "ext": [
    {
      "key": "org.peacprotocol/tenant_ref",
      "value": { "tenant_id": "tenant-abc" }
    }
  ]
}
```

### Characteristics

| Property | Value |
| -------- | ----- |
| Key management | Single key to rotate |
| Blast radius | All tenants affected by key compromise |
| Cross-tenant correlation | Trivial (same `iss` and `kid`) |
| Verifier setup | Single issuer config to discover |
| Operational cost | Minimal |

### When to Use

- Internal multi-tenant services where tenants trust the platform
- Development and staging environments
- Low-sensitivity receipt types (non-financial, non-identity)

### Security Considerations

- A compromised key affects all tenants; emergency revocation requires rotating the shared key
- Tenants can observe each other's receipt volume and timing patterns via the shared `iss`
- No cryptographic boundary between tenants; isolation is purely logical

---

## Tier 2: Scoped (Balanced)

### Architecture

All tenants share a single JWKS and a single `iss` origin, but each tenant gets a dedicated signing key with a tenant-prefixed `kid`.

```text
Issuer: https://platform.example
JWKS:   https://platform.example/.well-known/jwks.json
Keys:
  - kid: "tenant-abc/prod-2026-03" (active, for tenant-abc)
  - kid: "tenant-def/prod-2026-03" (active, for tenant-def)
  - kid: "tenant-abc/prod-2026-02" (deprecated, grace period)
```

Receipts carry the tenant-scoped `kid` in the JWS header:

```json
{
  "header": {
    "alg": "EdDSA",
    "kid": "tenant-abc/prod-2026-03"
  },
  "payload": {
    "iss": "https://platform.example",
    "sub": "agent:service-v2",
    "iat": 1709000000,
    "jti": "rcpt_01HQXYZ123456789"
  }
}
```

### Key Naming Convention

Tenant-prefixed `kid` values use the format:

```text
{tenant_id}/{environment}-{date}
```

Examples:
- `tenant-abc/prod-2026-03`
- `acme-corp/staging-2026-03`
- `org-42/prod-2026-02` (deprecated key in grace period)

### Characteristics

| Property | Value |
| -------- | ----- |
| Key management | One key per tenant (more keys, single JWKS) |
| Blast radius | Single tenant affected by key compromise |
| Cross-tenant correlation | Moderate (same `iss`, different `kid`) |
| Verifier setup | Single issuer config; verifiers select key by `kid` |
| Operational cost | Moderate (key rotation per tenant) |

### When to Use

- SaaS platforms with moderate isolation requirements
- Multi-tenant APIs where each tenant needs independent key rotation
- Environments where a single `iss` simplifies verifier configuration

### Security Considerations

- Key compromise affects only one tenant; revoke the tenant-specific key without affecting others
- Tenants share the same `iss`; verifiers cannot distinguish tenants by issuer alone (must inspect `kid`)
- `kid` collision risk: ensure tenant IDs are unique and stable; platforms MUST NOT reuse tenant IDs after deletion
- JWKS document grows linearly with tenant count; enforce `maxJwksKeys` limits (default: 20 per VERIFIER-SECURITY-MODEL.md). Platforms with more than 20 active tenants SHOULD use Tier 3

### Key Rotation

Each tenant key rotates independently per [KEY-ROTATION.md](../specs/KEY-ROTATION.md):

1. Add new key: `kid: "tenant-abc/prod-2026-04"` (PENDING)
2. Activate new key; deprecate old: `kid: "tenant-abc/prod-2026-03"` (DEPRECATED)
3. After 30-day overlap: retire old key

The platform MUST coordinate Cache-Control `max-age` on the shared JWKS with the shortest tenant overlap period.

---

## Tier 3: Isolated (Strongest)

### Architecture

Each tenant gets a dedicated JWKS, a dedicated `iss` origin, and a dedicated `peac-issuer.json` configuration.

```text
Tenant ABC:
  Issuer: https://tenant-abc.platform.example
  Config: https://tenant-abc.platform.example/.well-known/peac-issuer.json
  JWKS:   https://tenant-abc.platform.example/.well-known/jwks.json
  Keys:   kid: "prod-2026-03"

Tenant DEF:
  Issuer: https://tenant-def.platform.example
  Config: https://tenant-def.platform.example/.well-known/peac-issuer.json
  JWKS:   https://tenant-def.platform.example/.well-known/jwks.json
  Keys:   kid: "prod-2026-03"
```

Receipts carry the tenant-specific `iss`:

```json
{
  "iss": "https://tenant-abc.platform.example",
  "sub": "agent:service-v2",
  "iat": 1709000000,
  "jti": "rcpt_01HQXYZ123456789"
}
```

### Characteristics

| Property | Value |
| -------- | ----- |
| Key management | Fully independent per tenant |
| Blast radius | Single tenant only |
| Cross-tenant correlation | Difficult (different `iss` origins) |
| Verifier setup | Separate discovery per tenant |
| Operational cost | High (per-tenant DNS, TLS certificates, JWKS hosting) |

### When to Use

- Enterprise deployments with strict isolation requirements
- Regulated environments (financial services, healthcare)
- Platforms where tenants need fully independent verifier discovery
- Compliance scenarios requiring per-tenant audit boundaries

### Implementation Options

**Subdomain model** (recommended):
```text
https://{tenant}.platform.example
```
- Wildcard TLS certificate simplifies provisioning
- DNS-level isolation
- Each subdomain hosts its own `/.well-known/peac-issuer.json`

**Path-based model** (NOT recommended):
```text
https://platform.example/tenants/{tenant}
```
- Violates origin-only semantics (issuer `iss` should be an origin, not a path)
- Breaks `peac-issuer.json` discovery (which derives from origin only)
- Creates ambiguity in issuer matching

### Security Considerations

- Strongest isolation: no shared keys, no shared issuer identity
- Key compromise is fully contained to the affected tenant
- Verifiers discover keys independently per tenant; no cross-tenant JWKS leakage
- Higher operational cost: TLS cert management, DNS provisioning, per-tenant monitoring

---

## Migration Between Tiers

### Tier 1 to Tier 2

1. Generate per-tenant keys with tenant-prefixed `kid` values
2. Add new keys to the shared JWKS
3. Update receipt signing to use the tenant-specific key
4. After overlap period, remove the shared key
5. No change to `iss` or `peac-issuer.json`

### Tier 2 to Tier 3

1. Provision per-tenant subdomains and TLS certificates
2. Create per-tenant `peac-issuer.json` at each subdomain
3. Create per-tenant JWKS at each subdomain
4. Update receipt signing: change `iss` to tenant-specific origin
5. During migration: maintain old `iss` receipts in the shared JWKS for the overlap period
6. After overlap: remove tenant keys from the shared JWKS

**Breaking change warning**: Changing `iss` invalidates all in-flight receipts. Verifiers that cached the old issuer will fail verification until they discover the new issuer. Plan a migration window and communicate with verifiers.

### Tier 3 to Tier 2

Not recommended. Merging isolated issuers into a shared issuer loses isolation guarantees and may confuse verifiers that cached the per-tenant configuration.

---

## Tenant Reference Extension

Receipts MAY include the `org.peacprotocol/tenant_ref` extension to carry explicit tenant metadata:

```json
{
  "ext": [
    {
      "key": "org.peacprotocol/tenant_ref",
      "value": {
        "tenant_id": "tenant-abc",
        "environment": "production"
      }
    }
  ]
}
```

This extension is informational: it helps downstream systems route and filter receipts by tenant. It does NOT replace cryptographic isolation (Tier 2/3 key separation provides the actual isolation boundary).

---

## Decision Matrix

| Factor | Tier 1 (Shared) | Tier 2 (Scoped) | Tier 3 (Isolated) |
| ------ | ---------------- | ---------------- | ------------------ |
| Setup complexity | Low | Medium | High |
| Key compromise blast radius | All tenants | One tenant | One tenant |
| Cross-tenant correlation risk | High | Medium | Low |
| JWKS document size | Small (1 key) | Grows with tenants | Small (1 key each) |
| Verifier configuration | One issuer | One issuer, many kids | Many issuers |
| Key rotation independence | None | Per-tenant | Per-tenant |
| Regulatory suitability | Low | Medium | High |
| Max recommended tenants | Unlimited | ~20 (JWKS key limit) | Unlimited |

---

## References

- [KEY-ROTATION.md](../specs/KEY-ROTATION.md): Key Rotation Lifecycle Specification
- [PEAC-ISSUER.md](../specs/PEAC-ISSUER.md): Issuer Configuration Specification
- [VERIFIER-SECURITY-MODEL.md](../specs/VERIFIER-SECURITY-MODEL.md): Verifier Security Model
- [EVIDENCE-CARRIER-CONTRACT.md](../specs/EVIDENCE-CARRIER-CONTRACT.md): Evidence Carrier Contract
