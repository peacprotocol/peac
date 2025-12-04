# PEAC Protocol Archive: v0.9.0 – v0.9.14

**Status:** Historical / Legacy
**Archived:** 2025-12-04

## Purpose

This directory contains documentation and materials from PEAC Protocol versions
0.9.0 through 0.9.14. These materials are:

- **Preserved for historical reference**
- **Not current protocol** – see `docs/` for v0.9.15+ documentation
- **Not normative** – see `docs/specs/` for current specifications

## Contents

### docs/

- `REFACTOR_VALIDATION.md` - v0.9.11→v0.9.12 refactor validation report
- `adapters/status-matrix.md` - v0.9.12 payment adapter status
- `integrations/PEAC-over-Tempo.md` - v0.9.12 Tempo adapter sketch
- `migration/v0.9.14.md` - Migration guide v0.9.13→v0.9.14
- `issues/` - Historical issue tracking (v0.9.13.3-next)
- `perf/` - v0.9.12 performance benchmarks
- `interop.md` - v0.9.14 wire protocol interoperability guide
- `problems.md` - Early RFC 7807 problem-details examples
- `peips-malformed.md` - Malformed PEIP doc (heredoc artifact)

### docs/onboarding/

Early getting-started materials based on peac.txt policy files (v0.9.5 era):

- `getting-started.md` - v0.9.5 getting started guide
- `conformance.md` - v0.9.5 conformance levels
- `templates.md` - peac.txt deployment templates (Cloudflare, NGINX, GitHub Action)

### tests/

Legacy tests and fixtures from duplicate `test/` directory (excluded from CI):

- `smoke/cli-commands.test.js` - CLI command tests (lint issues)
- `smoke/detached-jws.test.js` - Detached JWS tests
- `smoke/enforce.test.js` - Enforcement tests (lint issues)
- `smoke/ssrf-protection.test.js` - SSRF protection tests
- `smoke/fixtures-legacy/` - Early policy-hash test vectors (simpler format)

## Current Documentation

For current PEAC Protocol documentation, see:

- `/docs/SPEC_INDEX.md` - Normative specifications
- `/docs/ARCHITECTURE.md` - Current architecture
- `/docs/CANONICAL_DOCS_INDEX.md` - Documentation index
