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

### examples/

Legacy example implementations:

- `ex/cfw/worker.js` - Cloudflare Worker example (JS)
- `ex/node/server.js` - Node.js server example (JS)
- `edge/cloudflare-worker.ts` - Edge runtime example (TS)
- `wellknown-peac.txt` - v0.9.13 peac.txt discovery file example

### sdk-js/

Legacy v0.9.2 SDK documentation (peac.txt era):

- `README-v0.9.2.md` - Original SDK README with peac.txt approach
- `docs/api-reference.md` - v0.9.2 API reference
- `docs/compliance-guide.md` - Compliance guide
- `docs/getting-started.md` - Getting started with peac.txt
- `docs/spec.md` - Original specification

### openapi/

v0.9.12 OpenAPI specification (peac.txt discovery era):

- `openapi.yaml` - v0.9.12 API spec with peac.txt endpoints

### fixtures/

Legacy test fixtures:

- `peac/` - v0.9.12 peac.txt discovery file examples (minimal, full, production, invalid)

### packages/

Legacy package stubs (v0.9.11-v0.9.12 era):

- `adapters/langchain/` - LangChain adapter stub (tool.py)
- `adapters/openai/` - OpenAI adapter stub (functions.json)
- `sdk-python/pyproject.toml` - Python SDK stub (v0.9.11, no implementation)

**Note:** `packages/templates/` was removed (empty placeholder with no content).

### schemas/

Legacy JSON schemas (v0.9.12–v0.9.14, pre-kernel design):

- `purge.v1.0.json` - Purge receipt schema for content deletion attestations (GDPR/CCPA)
- `peip-saf/core.v1.json` - PEIP Safety core schema (disclosure cadence, crisis referral, minors gate)
- `peip-saf/us-ca-sb243.v1.json` - Safety schema targeting CA SB-243 compliance
- `receipts/safety-event.v1.json` - Safety event receipt schema

### profiles/

Legacy wire format profiles (v0.9.12–v0.9.14, pre-kernel):

- `receipt.compact.v1.1.json` - CBOR compact receipt profile with field mapping

### docs/spec/

Legacy ABNF grammars (pre-kernel protocol definitions):

- `grammar.abnf` - v0.9.6 protocol message grammar (negotiation, receipts)
- `peac.txt.abnf` - v0.9.12 peac.txt discovery format grammar

### Root configs

- `.spectral.yaml` - OpenAPI linting config (for archived openapi.yaml)

## Current Documentation

For current PEAC Protocol documentation, see:

- `/docs/SPEC_INDEX.md` - Normative specifications
- `/docs/ARCHITECTURE.md` - Current architecture
- `/docs/CANONICAL_DOCS_INDEX.md` - Documentation index
