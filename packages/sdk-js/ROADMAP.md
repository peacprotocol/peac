# PEAC Protocol – Roadmap

PEAC (Programmable Economic Access, Attribution & Consent) is an open protocol for programmable access, consent, and attribution on the web. Our aim is to create a trusted, neutral foundation for dynamic access and automated negotiation; usable by publishers, platforms, AI agents, and individuals.

Roadmap is published for transparency and community input. Items and timelines may change as the ecosystem evolves. Building on web foundations like HTTP 402, PEAC evolves collaboratively for the automated economy.

---

## v0.9 – Initial Launch

- Core protocol specification
- Canonical `pricing.txt` and schema
- Attribution and consent enforcement
- Basic agent payment hooks (HTTP 402, Stripe stub)
- Open source SDK (Node.js)
- CLI tools and schema validation
- Validator tools for compliance

---

## v1.0 (Planned)

- Discovery fallback (`.well-known/peac.yaml`/`.json`)
- Dynamic pricing for paths and agents
- Negotiation metadata (deal_id, dispute_url, pricing_proof)
- Attribution verification API endpoints
- Session tokens for persistent access

---

## Beyond v1.0 (In Progress / Research)

- Tamper-evident audit logs (design phase)
- Extended attribution and proof formats
- Integration with additional payment and agent standards
- Optional privacy features for sensitive logs
- Reference middleware and CDN/edge patterns

## Community Milestones

- Q3 2025: Call for extensions (e.g., privacy features via PRs).
- Ongoing: Integrate feedback from OSS/big tech (reference GOVERNANCE.md).

Propose roadmap additions via GitHub issues/PRs, welcome from devs, AI firms, and foundations.

---

*This roadmap is intentionally high-level. PEAC welcomes contributions and technical feedback as we build toward a global standard.*

For collaboration or early feedback, visit [GitHub](https://github.com/peacprotocol/peac) or email protocol@peacprotocol.org.

*Last updated: July 2025*
