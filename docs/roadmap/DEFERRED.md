# PEAC Protocol Scope Ledger

> **Policy:** No feature disappears. Everything is either shipped, deferred with target, or cancelled with rationale.

This document tracks scope changes across versions as a permanent record.

## Scope Change Log

### v0.9.19 Scope Decisions (Dec 21, 2025)

| Item                        | Decision | Target  | Rationale                                        |
| --------------------------- | -------- | ------- | ------------------------------------------------ |
| @peac/rails-razorpay        | SHIP     | v0.9.19 | India payment rail priority                      |
| MCP/ACP polish              | SHIP     | v0.9.19 | Manifest generator, budget utilities             |
| 5 Flagship examples         | SHIP     | v0.9.19 | Minimum viable examples with CI harness          |
| Invoice reference (minimal) | SHIP     | v0.9.19 | Generic invoice_reference field for x402 interop |
| Full i402 spec              | OUT      | N/A     | Separate repo - lifecycle complexity not in core |
| Analytics                   | DEFER    | v0.9.20 | Privacy complexity, k-anonymity design           |
| x402+Daydreams              | DEFER    | v0.9.20 | Focus on Razorpay first                          |
| x402+Fluora                 | DEFER    | v0.9.20 | Focus on Razorpay first                          |
| x402+Faremeter              | DEFER    | v0.9.20 | Focus on Razorpay first                          |
| x402+Pinata                 | DEFER    | v0.9.20 | Focus on Razorpay first                          |
| Card-Rails Bridge           | DEFER    | v0.9.20 | Flowglad/Stripe/Lago complexity                  |
| Risk Evidence Hook          | DEFER    | v0.9.21 | Lower priority                                   |

### v0.9.18 Shipped (Dec 19, 2025)

| Item                       | Package                                                     | Status  |
| -------------------------- | ----------------------------------------------------------- | ------- |
| TAP foundation             | @peac/http-signatures, @peac/jwks-cache, @peac/mappings-tap | Shipped |
| Cloudflare Worker verifier | surfaces/workers/cloudflare                                 | Shipped |
| Next.js Edge middleware    | surfaces/nextjs/middleware                                  | Shipped |
| Schema normalization       | toCoreClaims()                                              | Shipped |
| Canonical flow examples    | examples/                                                   | Shipped |
| Governance docs            | GOVERNANCE.md, MAINTAINERS.md, TRADEMARKS.md                | Shipped |
| RSL 1.0 vocabulary fix     | ai-index token                                              | Shipped |

## Out-of-Scope (Permanent)

Items explicitly excluded from the PEAC Protocol core:

| Item                         | Why Out              | Alternative             |
| ---------------------------- | -------------------- | ----------------------- |
| Full i402 spec               | Lifecycle complexity | Separate i402 repo      |
| Invoice state machines       | Not protocol concern | External implementation |
| Vendor-branded schema fields | Vendor neutrality    | Generic fields only     |

## Acceptance Criteria Reference

When items move from DEFER to SHIP, they must meet these criteria:

| Item               | Acceptance Criteria                                                       |
| ------------------ | ------------------------------------------------------------------------- |
| Analytics          | Metrics schema, aggregation helpers, k-anonymity >= 20, dashboard example |
| x402+Daydreams     | PEIP-AI/inference@1 mapping, 10+ tests                                    |
| x402+Fluora        | PEIP-SVC/mcp-call@1 mapping, 10+ tests                                    |
| x402+Faremeter     | Faremeter Node middleware, 10+ tests                                      |
| x402+Pinata        | PEIP-OBJ/private@1 (store=ipfs), 10+ tests                                |
| Card-Rails Bridge  | @peac/rails-card, billing_snapshot, 15+ tests                             |
| Risk Evidence Hook | risk_session_id, risk_provider fields, 5+ tests                           |

## Version Ownership Summary

| Version | Ships                                                   | Defers                   |
| ------- | ------------------------------------------------------- | ------------------------ |
| v0.9.19 | Razorpay, MCP/ACP polish, 5 examples, invoice_reference | Analytics, x402 adapters |
| v0.9.20 | Analytics, x402 adapters, Card-Rails                    | Risk Evidence Hook       |
| v0.9.21 | Risk Evidence Hook, Edge adapters, TAL extensions       | -                        |
| v0.9.22 | Go SDK, Publisher Playbooks                             | -                        |
| v0.9.23 | Dispute and Audit                                       | -                        |

## Scope Audit

Verify all deferred items remain tracked in this file:

```bash
# Run from repo root - all keywords must appear in this file
rg -l "Analytics|Daydreams|Fluora|Faremeter|Pinata|Card-Rails|Risk.Evidence" docs/roadmap/DEFERRED.md
```

Keywords that must be tracked: Analytics, Daydreams, Fluora, Faremeter, Pinata, Card-Rails Bridge, Risk Evidence Hook, Go SDK, Publisher Playbooks, Dispute and Audit
