# PEAC Protocol Roadmap

> **Policy:** No feature is removed; only shipped, deferred, or cancelled with explicit rationale.

## Current Release: v0.9.18 (Dec 19, 2025)

Shipped:

- TAP foundation packages (@peac/http-signatures, @peac/jwks-cache, @peac/mappings-tap)
- Cloudflare Worker TAP verifier
- Next.js Edge middleware
- Schema normalization (toCoreClaims)
- Canonical flow examples
- Governance docs

## Next Release: v0.9.19 (Target: Dec 28, 2025)

### Ships

| Item                      | Package                                | Description                                                                   |
| ------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Razorpay adapter          | @peac/rails-razorpay                   | India payment rail (UPI, cards, netbanking)                                   |
| MCP/ACP polish            | @peac/mappings-mcp, @peac/mappings-acp | Manifest generator, budget utilities                                          |
| 5 Flagship examples       | examples/                              | pay-per-inference, pay-per-crawl, rsl-collective, mcp-tool-call, razorpay-upi |
| CI examples harness       | CI                                     | examples:check prevents rot                                                   |
| Invoice reference support | @peac/rails-x402                       | Generic invoice_reference field for x402 interop                              |

### Invoice Reference (Minimal i402 Compatibility)

**In-tree (v0.9.19):**

- Generic `invoice_reference?: string` field in PaymentEvidence
- Invoice detection logic (header sniffing)
- Tests and documentation

**Out-of-tree (separate repo):**

- Full i402 spec and lifecycle
- Invoice state machines
- Invoice-specific types

This preserves x402 interop without lifecycle complexity in PEAC core.

## Deferred to v0.9.20

| Item                              | Why Deferred                                | Acceptance Criteria                                  |
| --------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Analytics (Metrics API + demo UI) | Privacy complexity, sampling design         | Metrics schema, k-anonymity >= 20, dashboard example |
| x402+Daydreams adapter            | Focus on Razorpay first                     | PEIP-AI/inference@1 mapping, 10+ tests               |
| x402+Fluora adapter               | Focus on Razorpay first                     | PEIP-SVC/mcp-call@1 mapping, 10+ tests               |
| x402+Faremeter adapter            | Focus on Razorpay first                     | Faremeter Node middleware, 10+ tests                 |
| x402+Pinata adapter               | Focus on Razorpay first                     | PEIP-OBJ/private@1 (store=ipfs), 10+ tests           |
| Card-Rails Bridge                 | Flowglad/Stripe/Lago integration complexity | @peac/rails-card, billing_snapshot, 15+ tests        |

## Deferred to v0.9.21

| Item               | Why Deferred                            | Acceptance Criteria                             |
| ------------------ | --------------------------------------- | ----------------------------------------------- |
| Risk Evidence Hook | Lower priority, x402-secure integration | risk_session_id, risk_provider fields, 5+ tests |

## Future (v0.9.20+)

- Edge adapter parity (Fastly, Akamai)
- TAL extensions (gRPC, WebSocket)
- Go SDK
- Publisher Playbooks
- Dispute and Audit framework

## Version History

| Version | Date         | Highlights                                                |
| ------- | ------------ | --------------------------------------------------------- |
| v0.9.18 | Dec 19, 2025 | TAP foundation, surfaces, schema normalization            |
| v0.9.17 | Dec 14, 2025 | x402 v2, RSL 1.0, Policy Kit, subject binding             |
| v0.9.16 | Dec 7, 2025  | CAL semantics, PaymentEvidence extensions, SubjectProfile |
| v0.9.15 | Nov 2025     | Kernel-first architecture, package layering               |
