# PEAC Surfaces

Platform-specific integrations and deployment templates for PEAC.

## Structure

### Edge workers

- **[workers/cloudflare/](workers/cloudflare/)** - Cloudflare Workers handler
- **[workers/fastly/](workers/fastly/)** - Fastly Compute handler
- **[workers/akamai/](workers/akamai/)** - Akamai EdgeWorkers handler

### Frameworks

- **[nextjs/](nextjs/)** - Next.js middleware

### Verifier

- **[reference-verifier/](reference-verifier/)** - Self-hostable reference verifier (Docker + Cloudflare)

### Editor and agent plugins

- **[plugin-pack/](plugin-pack/)** - Editor and agent plugin templates

### Distribution

- **[distribution/](distribution/)** - Listing and distribution assets

## Status

Per-surface status is generated in [../docs/SURFACE_STATUS.md](../docs/SURFACE_STATUS.md). Do not hand-restate surface state here; that document is the source of truth.

## Purpose

Surfaces provide turnkey integration points for specific platforms:

- Pre-configured deployments
- Platform-optimized handlers
- Best-practice examples
- Reusable templates

See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the full architecture.

---

_Last reviewed: 2026-07-02._
