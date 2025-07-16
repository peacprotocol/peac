# PEAC Protocol

PEAC — Programmable Economic Access, Attribution & Consent is an open, neutral protocol for consent, compliance, and commerce on the web.

> Pronounced “peak”

## Getting Started

1. Add a pricing.txt at your domain root with:
   protocol: peac
   version: 0.9
2. Install the SDK: npm install @peac/protocol
3. Use in code: const peac = require('@peac/protocol')

## Protocol Summary

PEAC Protocol defines a standardized, programmable layer for verifiable access to web content; enabling fair terms, attribution, and pricing between publishers and agents (human, AI, bot, or M2M). It introduces a human-readable `pricing.txt` , verifiable agent identity, and HTTP-based enforcement patterns that support differential access and micropayments. Compatible with x402-style enforcement via HTTP 402 status codes.

* Open by design: Machine-readable terms, consent-based access, attribution conditions, and auditability.
* Programmable & modular: Supports sessions, units, pricing tiers, signatures, and dispute metadata.
* Neutral infrastructure: Integrates with any CDN, server, or payment system via HTTP 402 and x402 primitives.

Goal: Sustain the open web with a global standard that is enforceable, interoperable, and fair; without paywalls, scraping wars, or platform lock-in.

## Why PEAC?

* Solves Market Failure: Addresses unpriced crawling with flexible pricing/attribution, preventing paywalls or splinternet.
* Key Differentiators: Simpler than x402 (human-writable terms), more open than proprietary solutions (e.g., Pay-Per-Crawl); enables differential access (free for research, paid for commercial).
* Adoption Flywheel: Start with publishers (easy pricing.txt), integrate infra (CDNs/APIs), scale to AI firms (legal data moats).
* Stakeholder Alignment: Publishers gain revenue/attribution; AI gets quality/compliant data; regulators ensure transparency (ties to EU AI Act 2025 provenance); invites W3C/IETF standardization.
* Governance: Non-profit foundation (inspired by Let's Encrypt) with multi-stakeholder board; fund via grants/0.1% fees to prevent capture.

PEAC is infrastructure-neutral and open-source by design: any publisher, platform, or agent can implement it without reliance on any vendor or payment rail.

Join to make PEAC the default: Contribute via PRs, discuss in GitHub Discussions, or endorse (e.g., Mozilla, Creative Commons).

## Discovery Fallback Order

| Priority | Location                  | Notes                  |
|----------|---------------------------|------------------------|
| 1        | /pricing.txt              | Human-readable YAML    |
| 2        | /.well-known/peac.yaml    | Fallback               |
| 3        | /.well-known/peac.json    | Fallback               |
| 4        | Link header rel="peac-terms" | Redirect if present   |

## .peacrc Example

`.peacrc` (JSON) for overrides:

{
"method": "stripe",
"agent_id": "example-agent",
"user_id": "example-user",
"agent_type": "research",
"allowHttp": false,
"signing_method": "eip-712",
"enforce_attribution_log": false
}

## Stripe Payment Method Behavior

Stub-only for testing: Returns a redirect URL or pricing_proof URI. No real credentials or SDK used.

For real payments, extend handlePayment or use handlePaymentReal as example (with warning: integrate your own payment provider to maintain neutrality).

## Signature & Session Expiry

- Signatures: EIP-712 for verifiable identity.
- Sessions: Enforce expires_in (duration) or valid_until (ISO 8601); deny access if expired.

## CDN Integration Snippets

Example NGINX configuration for attribution enforcement:
location / {
if ($http_x_peac_attribution_consent != "true") {
return 402;
}
}


## Self-Hosted? Just Drop pricing.txt in Your Blog Root and Go

For individual bloggers or small sites, simply add pricing.txt to your root directory. No additional setup needed for basic enforcement.

## Related Standards

- x402 (HTTP-based programmable payments): https://x402.dev
- Stripe Payment Links: https://stripe.com/docs/payment-links
- YAML Schema Validator: https://ajv.js.org

## Resources

- Website: https://peacprotocol.org
- Quickstart: examples/pricing.txt
- Schema Playground: coming soon

## Repository Structure

```bash
peac/
├── README.md                 # This file
├── LICENSE                   # Apache 2.0 License
├── spec.md                   # Core Protocol Specification (v0.9)
├── GOVERNANCE.md             # Governance model and contrib policies
├── COMPLIANCE.md             # Legal mappings and disclaimers
├── SUPPORT.md                # Endorsements and outreach
├── ROADMAP.md                # Future development plans
├── pricing.schema.json       # Full JSON Schema for pricing.txt
├── CONTRIBUTING.md           # Contribution guidelines
├── NOTICE                    # OSS attribution notice
├── USECASES.md               # Use cases examples
├── examples/                 # Example pricing.txt files
│   ├── README.md             # Examples overview
│   ├── pricing.txt           # Starter template
│   ├── minimal-pricing.txt   # Deny-by-default baseline
│   └── full-pricing.txt      # Forward-compatible sample
├── peac-core/                # SDK (Node.js)
│   ├── index.js              # Client functions
│   ├── package.json          # Dependencies and scripts
│   ├── tests/                # Test suite
│   │   └── index.test.js     # Unit tests
│   ├── bundle/               # Exported bundle
│   │   └── index.js          # Main exports
│   ├── middleware.js         # Middleware for Express/Vercel
│   └── LICENSE               # Apache 2.0
├── peac-cli.js               # CLI stub
├── .peacrc                   # Config template
├── .well-known/
│   └── peac.schema.json      # Schema for .well-known access
├── docs/                     # Documentation files
│   ├── AGENTS.md             # Agent types and enforcement
│   ├── units.md              # Custom units documentation
│   └── flowchart.md          # Flow diagrams
└── .github/
└── workflows/
└── validate.yml      # CI for schema validation
```

## Verification

```bash
node -e "require('./peac-core')"
npm test --prefix peac-core

## Getting Started

0. **Review Spec**: See spec.md for identity, terms, and flows.
1. **Deploy pricing.txt**: Copy an example to your domain root (e.g., https://example.com/pricing.txt). Fallback to .well-known/peac.json supported.
2. **Integrate**:
   * Publishers: Add to server/CDN (e.g., NGINX, Fastly, Vercel, or any CDN/middleware that supports HTTP headers).
   * Agents: Use peac-core SDK or HTTP clients with sigs (EIP-712/DID/mTLS).
   * Validate: Run CI workflow or AJV locally.
3. **Test**: Simulate with curl (e.g., signed requests); expect HTTP 402 for paid.

Example curl with attribution:
curl -H "X-PEAC-Attribution-Consent: true" \
     -H "X-PEAC-Attribution-URL: https://example.com/credit" \
     https://example.com/content

## Contributing

See CONTRIBUTING.md.

For collaborations (e.g., infra providers interested in supporting PEAC enforcement), DM on X or email protocol@peacprotocol.org.

## License

Apache 2.0: see LICENSE.

## Appendix: The Web's Unpriced Engine

Problem: AI crawling creates unpriced externalities, breaking HTTP assumptions of human-scale requests.

Primitives: Verifiable identity (EIP-712/DID/mTLS), machine-readable terms (pricing.txt), auditable accounting (logs).

Economics: Differential pricing (premium content higher), usage-based licensing (align costs with value), collective bargaining (cooperatives for rates), quality premiums (fact-checked earns more).
