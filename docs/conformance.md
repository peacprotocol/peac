# Conformance (v0.9.5)

Normative terms per RFC 2119/8174.

## Roles

- **Publisher** — server/site/API
- **Agent** — client/automation

## Levels

- **L0** — Discover/parse `peac.txt` (MUST serve `/.well-known/peac.txt`; include `version: 0.9.5`).
- **L1** — HTTP semantics (lowercase `x-peac-*`, `application/problem+json`, version negotiation).
- **L2** — Enforce purposes/quotas; surface consent/privacy/retention; attribution requirements.
- **L3** — Negotiate terms; settle via adapters (**x402 first**, then any payment provider adapter as needed); issue DPoP-bound receipts where applicable.
- **L4** — End-to-end auditability; verify-only provenance.

## Quick Run (illustrative)

```bash
pnpm run conf:test -- --level L0
# ... run for L1, L2, L3, L4 as you progress
```
