![Apache License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)

## Protocol Summary and Vision

> **PEAC Protocol is an open standard for programmable access, consent, attribution, and automated machine-to-machine payments; built for the agentic, AI-powered web.**

It enables publishers, platforms, AI/data agents, and regulators to specify and enforce economic, consent, and attribution terms via a simple, auditable file: 'pricing.txt' or '.well-known/peac.json'. Payments and advanced enforcement are optional for non-commercial or open access, ensuring win-win for creators and agents.

PEAC Protocol addresses unpriced externalities of AI/web crawling, enables agent-driven negotiation and value exchange, and supports verifiable, compliant, programmable access for all participants. Publishers gain fair revenue streams, AI/data agents get ethical access, and OSS developers build on open standards.

_**Motivation:** AI crawling challenges web economics, but PEAC builds on HTTP's foundations (like 402) to foster fair, long-term automated ecosystems; transparent and composable for everyone._

## Table of Contents
1. Protocol Summary & Vision
2. Capabilities
3. Who Benefits
4. Examples
5. Canonical Test Agent
6. Getting Started
7. Discovery
8. Integration Guidance
9. Express/Node Middleware Example
10. Compliance & Regulatory Alignment
11. Technical Details
12. Interoperability & Payment Flows
13. Resources
14. Repository Structure
15. Verification
16. Join the Community
17. Contributing
18. License

## Capabilities

- Payments and advanced enforcement optional for non-commercial/open access
- Standardized access, consent, and attribution terms via `pricing.txt` or `.well-known/peac.json`
- Support for tiered pricing, sessions, metadata, dispute mechanisms, and programmable negotiation
- EIP-712 signature support for verifiable agent identity and consent
- Compatibility with Stripe, x402, HTTP 402, and other agent payment standards
- Comprehensive open-source SDK, CLI tooling, and schema validation
- Designed for compliance with global data, provenance, and AI transparency regulations

**More Than Payments:** PEAC allows programmable, consent-based, and attribution-enforced access-optional economics, full compliance, and AI-ready by default. See [spec.md](spec.md) and [ROADMAP.md](ROADMAP.md) for extensions.

See [GOVERNANCE.md](GOVERNANCE.md) for community-driven evolution.

## Who Benefits

- **Publishers & Creators:** Monetize or attribute automated access.
(e.g., fair revenue from AI crawls without barriers)

- **Platforms & CDNs:** Offer compliant terms.
(e.g., enforceable attribution in data flows)

- **AI/Data Agents:** Discover and negotiate access terms ethically.
(e.g., verifiable consent to reduce legal risks)

- **OSS & Developers:** Build with trust and compliance baked in.
(e.g., extensible SDKs for new web/AI apps)

- **Regulators & Compliance Teams:** Audit easily.
(e.g., cryptographic proofs for transparency)

> PEAC Protocol is not a paywall. It is the open, programmable trust and compliance layer for the agentic web. Like robots.txt, PEAC is file-based and easy to deploy, but it’s enforceable, auditable, and supports programmable economics and compliance.

## Examples

For publishers: Start with minimal-pricing.txt to enable consent/attribution without payments.

- [`examples/pricing.txt`](examples/pricing.txt) - minimal, canonical example   //consent/attribution only (no payments)
- [`examples/full-pricing.txt`](examples/full-pricing.txt) - sessions, tiers, attribution, expiry   //advanced pricing/attribution
- [`examples/minimal-pricing.txt`](examples/minimal-pricing.txt) - deny-all default

> For deployment, place `pricing.txt` at your website root (e.g., `https://yoursite.com/pricing.txt`).  
> The `examples/` directory contains sample files for development and onboarding.

## Canonical Test Agent

All official protocol and E2E tests use this public Ethereum account for EIP-712 verification:

- `agent_id`: `0xa0fb98a1d397d13fbe71f31fbc3241c8b01488da`
- `private_key`: `4f3edf983ac636a65a842ce7c78d9aa706d3b113b37d7b1b6b5ddf49f7f6ed15`

This enables reproducible, auditable, and open protocol testing.

Note: This is a public, disposable Ethereum account with zero balance (verified Etherscan, July 2025). Use strictly for local/E2E testing; never in production or with real assets.

## Getting Started

1. **Add a `pricing.txt` file to your web root:**  
   Copy from `examples/pricing.txt` or `examples/full-pricing.txt`.

2. **Install the PEAC SDK:**  
   ```bash
   npm install @peac/protocol
   ```

3. **Validate or generate terms using the CLI:**
  ```bash
  node cli/peac-cli.js generate
  node cli/peac-cli.js validate examples/pricing.txt
  ```

4. **Integrate in your application or service:**
```js
const {
  fetchPricing,
  checkAccess,
  handlePayment,
  signRequest,
  getTermsHash
} = require('./core');

// Fetch terms from a publisher
const terms = await fetchPricing('https://example.com');

// Sign an access request using EIP-712
const privateKey = '0x...';
const request = {
  agent_id: '0xYourAddress',
  user_id: 'bot123',
  agent_type: 'research',
  deal_id: 'negotiated-abc123' // for negotiated terms (see metadata.deal_id)
};
const signature = await signRequest(request, privateKey);

// Verify access
const headers = {
  'X-PEAC-Agent-ID': request.agent_id,
  'X-PEAC-User-ID': request.user_id,
  'X-PEAC-Agent-Type': request.agent_type,
  'X-PEAC-Deal-ID': request.deal_id, // for negotiated terms
  'X-PEAC-Signature': signature,
  'X-PEAC-Attribution-Consent': true
};
const access = checkAccess(terms, headers, { path: '/blog/article' });
```

## Discovery

```markdown
| Priority | Location                     | Notes                |
|----------|------------------------------|----------------------|
| 1        | /pricing.txt                 | Human-readable YAML  |
| 2        | /.well-known/peac.yaml       | Fallback             |
| 3        | /.well-known/peac.json       | Fallback             |
| 4        | Link header rel="peac-terms" | Redirect if present  |
```

## Integration Guidance

**Publishers, Platforms, and API Providers:**  
- Deploy a `pricing.txt` or `.well-known/peac.json` file at your domain root.
- Integrate PEAC enforcement into your server, CDN (e.g., NGINX, Fastly, Vercel), or middleware.
- Configure attribution and consent header checks as needed (see examples in this README).

**Agents, Crawlers, and AI Companies:**  
- Integrate the PEAC SDK or use standard HTTP clients with EIP-712 signatures for requests.
- Parse and respect publisher `pricing.txt` terms, attribution, and payment rules.
- Implement attribution, consent, and payment headers in all automated access flows.

**Individual Creators, Blogs, and Small Sites:**  
- Simply add a `pricing.txt` file to your web root.
- No extra infrastructure is required for basic enforcement and attribution.  
- PEAC is designed for easy self-hosting and plug-and-play adoption.
- Compatible with static hosts (GitHub Pages, Netlify) - no backend required for basic compliance.

**IP Owners and Rights Holders:**  
- Use PEAC Protocol to assert consent, pricing, and attribution terms on your data or content endpoints.
- Audit access and integrate dispute workflows as appropriate for your sector.

PEAC Protocol enables seamless, interoperable enforcement for all participants: publishers, AI/data agents, web services, and individuals, without lock-in or barriers to adoption.


> For Python/Go/other SDKs, see [docs/AGENTS.md] (or propose an implementation!)


### Express/Node Middleware Example

For plug-and-play server integration, use the PEAC middleware in Express/Vercel or any Node server.

```js
const peacMiddleware = require('./core/middleware');
const yaml = require('js-yaml');
const fs = require('fs');
const pricing = yaml.load(fs.readFileSync('examples/pricing.txt', 'utf8'));

app.use(peacMiddleware(pricing));
```
// ...your routes below

```js
// core/middleware.js
const { checkAccess } = require('./checkAccess');

module.exports = function peacMiddleware(pricing) {
  return function (req, res, next) {
    const result = checkAccess(pricing, req.headers, req);
    if (!result.access) {
      return res.status(402).send(`Payment Required via PEAC: ${result.reason}`);
    }
    next();
  };
};
```

## Compliance & Regulatory Alignment

PEAC Protocol is designed to support transparency, provenance, and auditability for automated access and consent.

- Audit trails, attribution, and cryptographic proof enable trusted automated data exchange.
- Interoperable with global regulatory goals (EU AI Act, GDPR, DMCA, and others).
- Policy makers, compliance teams, and standards bodies are invited to review and extend PEAC for specific regulatory requirements.

See [COMPLIANCE.md](COMPLIANCE.md) for detailed mapping guidance and examples.

## Technical Details

- **Development/Testing Override:** Add `.peacrc` (JSON) for local overrides (e.g., "allowHttp": true) - dev only, not production.  
- **Signatures & Sessions:** EIP-712 for identity; enforce expires_in (duration) or valid_until (ISO 8601).  
- **Security Note:** Always use secure keys in prod; test agents are for reproducibility only.

## Interoperability and Payment Flows

- [HTTP 402](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/402): HTTP Status Code 402, also known as "Payment Required"
- [x402 Payments](https://github.com/agentic-x402/x402-protocol): Enables instant stablecoin payments directly over HTTP
- [Stripe Agent Pay](https://docs.stripe.com/agents/quickstart) & [Agent Toolkit](https://github.com/stripe/agent-toolkit): Agent payment flows for APIs/bots (future support in v1.0)
- [Stripe Payment Links](https://stripe.com/docs/payment-links): Low-friction way for publishers to monetize content access. Publisher-side payment UX (reference implementation)
- [ajv-cli](https://github.com/ajv-validator/ajv-cli): Schema validation for JSON/YAML pricing terms

> The protocol will track IETF/ISO/industry developments for HTTP 402, agent payments, and data consent to maximize adoption and minimize lock-in.

## Resources

- Website: https://peacprotocol.org
- Quickstart: examples/pricing.txt

All code, CLI, and examples are copy-paste ready and thoroughly tested, if you spot an issue, file a GitHub issue or pull request!

## Repository Structure

```bash
PEAC---v0000000.9/
├── .github/
│   └── workflows/
├── .prettierrc
├── .prettierignore
├── .gitignore
├── cli/
│   └── peac-cli.js
├── core/
│   ├── attribution.js
│   ├── checkAccess.js
│   ├── fetchPricing.js
│   ├── hash.js
│   ├── index.js
│   ├── middleware.js
│   ├── parseDuration.js
│   ├── paymentHandlers.js
│   ├── signer.js
│   ├── tiers.js
│   ├── tests/
│   │   └── index.test.js
├── docs/
│   ├── AGENTS.md
│   ├── flowchart.md
│   └── units.md
├── examples/
│   ├── full-pricing.txt
│   ├── minimal-pricing.txt
│   ├── pricing.txt
│   └── README.md
├── schema/
│   └── pricing.schema.json
├── e2e-peac-test.js
├── README.md
├── ROADMAP.md
├── SUPPORT.md
├── GOVERNANCE.md
├── COMPLIANCE.md
├── spec.md
├── USECASES.md
├── package.json
├── package-lock.json
├── LICENSE.md
```

## Verification

```bash
node -e "require('./core')"
npm test --prefix core
````

### Validating Example pricing.txt Files

PEAC recommends using the built-in CLI to validate YAML-based pricing files:

```bash
node cli/peac-cli.js validate examples/pricing.txt
node cli/peac-cli.js validate examples/full-pricing.txt
```

To validate against the JSON schema using ajv, first convert YAML to JSON:

```bash
npx js-yaml examples/pricing.txt > examples/pricing.json
npx ajv-cli validate -s schema/pricing.schema.json -d examples/pricing.json
```

> **Note:** If you see unknown format "date-time" when using ajv-cli, this is a warning.
The PEAC Protocol CLI is the authoritative validator for all YAML-based pricing files.

## Join the Community

PEAC is an open protocol, your input shapes its future.

We invite developers, publishers, AI builders, regulators, and all participants to review, test, and contribute. Share feedback on GitHub issues, propose extensions via pull requests, or collaborate on integrations (e.g., new language SDKs or compliance mappings).

For questions or partnerships, join discussions on X (@peacprotocol) or email protocol@peacprotocol.org. Let's build the fair automated web together!

Welcome forks, extensions, and diverse contributions to evolve PEAC Protocol collaboratively.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

For collaborations (e.g., infra providers interested in supporting PEAC protocol enforcement), email protocol@peacprotocol.org

## License

Apache 2.0: see LICENSE.
