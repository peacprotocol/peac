## Protocol Summary and Vision

PEAC is a programmable, open protocol for access, attribution, consent, and economic terms on the web.  
It enables publishers, platforms, AI/data agents, and regulators to specify and enforce programmable terms; consent, attribution, pricing, and negotiation via a simple, auditable file: `pricing.txt` or `.well-known/peac.json`.

PEAC serves as the economic and consent layer for the automated economy, enabling agents, platforms, and creators to negotiate, transact, and attribute value at scale.  
- Addresses unpriced externalities of AI/web crawling.
- Enables agent-driven negotiation and value exchange.
- Supports verifiable, programmable, and compliant access for all participants.

## Capabilities

- Standardized access, consent, and attribution terms via `pricing.txt` or `.well-known/peac.json`
- Support for tiered pricing, sessions, metadata, dispute mechanisms, and programmable negotiation
- EIP-712 signature support for verifiable agent identity and consent
- Compatibility with Stripe, x402, HTTP 402, and other agent payment standards
- Comprehensive open-source SDK, CLI tooling, and schema validation
- Designed for compliance with global data, provenance, and AI transparency regulations

## Examples

- [`examples/pricing.txt`](examples/pricing.txt) - minimal, canonical example
- [`examples/full-pricing.txt`](examples/full-pricing.txt) - sessions, tiers, attribution, expiry
- [`examples/minimal-pricing.txt`](examples/minimal-pricing.txt) - deny-all default

> For deployment, place `pricing.txt` at your website root (e.g., `https://yoursite.com/pricing.txt`).  
> The `examples/` directory contains sample files for development and onboarding.

## Canonical Test Agent

All official protocol and E2E tests use this public Ethereum account for EIP-712 verification:

- `agent_id`: `0xa0fb98a1d397d13fbe71f31fbc3241c8b01488da`
- `private_key`: `4f3edf983ac636a65a842ce7c78d9aa706d3b113b37d7b1b6b5ddf49f7f6ed15`

This enables reproducible, auditable, and open protocol testing.

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

## 5. **Discovery Table**

```markdown
| Priority | Location                     | Notes                |
|----------|-----------------------------|----------------------|
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

**IP Owners and Rights Holders:**  
- Use PEAC to assert consent, pricing, and attribution terms on your data or content endpoints.
- Audit access and integrate dispute workflows as appropriate for your sector.

PEAC enables seamless, interoperable enforcement for all participants; publishers, AI/data agents, web services, and individuals, without lock-in or barriers to adoption.

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

**Development/Testing Override:**  
If you need to allow HTTP (for local/dev only), add a `.peacrc` file in your project root:

```json
{
  "allowHttp": true
}
```
Do not use this flag in production.

### Discovery

| Priority | Location                     | Notes               |
| -------- | ---------------------------- | ------------------- |
| 1        | /pricing.txt                 | Human-readable YAML |
| 2        | /.well-known/peac.yaml       | Fallback            |
| 3        | /.well-known/peac.json       | Fallback            |
| 4        | Link header rel="peac-terms" | Redirect if present |

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

## Signature & Session Expiry

- Signatures: EIP-712 for verifiable identity.
- Sessions: Enforce expires_in (duration) or valid_until (ISO 8601); deny access if expired.

## CDN Integration Snippets

Example NGINX configuration for attribution enforcement:
```nginx
location / {
  if ($http_x_peac_attribution_consent != "true") {
    return 402;
  }
}
```

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

## Contributing

See CONTRIBUTING.md.

For collaborations (e.g., infra providers interested in supporting PEAC enforcement), email protocol@peacprotocol.org

## License

Apache 2.0: see LICENSE.

## Appendix: The Web's Unpriced Engine

AI crawling creates unpriced externalities, breaking the HTTP assumption of human-scale requests.

**Primitives**: Verifiable identity (EIP-712/DID/mTLS), machine-readable terms (pricing.txt), auditable accounting (logs).

**Economics**: Differential pricing, usage-based licensing, collective bargaining, quality premiums.


