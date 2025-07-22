[![Node.js CI](https://github.com/peacprotocol/peac/actions/workflows/ci.yml/badge.svg)](https://github.com/peacprotocol/peac/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/peacprotocol/peac/branch/main/graph/badge.svg)](https://codecov.io/gh/peacprotocol/peac)

## PEAC Protocol

> **The open protocol for programmable, ethical, and compliant access, consent, attribution, and automated payments on the AI-powered web.**

## Protocol Vision

**PEAC Protocol** is the open, extensible standard for programmable web access, consent, attribution, and machine-to-machine payment; built for the next generation of AI and agentic automation. It lets publishers, platforms, AI/data agents, and regulators express enforceable terms with a simple file: `pricing.txt` or `.well-known/peac.json`. PEAC is auditable, consent-centric, privacy-respecting, and composable by design.

PEAC Protocol addresses unpriced externalities of AI/web crawling, enables agent-driven negotiation and value exchange, and supports verifiable, compliant, programmable access for all participants. Publishers gain fair revenue streams, AI/data agents get ethical access, and OSS developers build on open standards.

_**Why:**  As AI crawlers and bots reshape the web and AI crawling challenges fair web economics (e.g., 436M scrapes bypassed blocks in Q1 2025 alone), PEAC delivers a fair, transparent, and programmable economic layer on HTTP's foundations (like 402); removing unpriced externalities and enabling win-win for creators, agents, and users.

## Table of Contents
- [PEAC Protocol](#peac-protocol)
- [Protocol Vision](#protocol-vision)
- [Table of Contents](#table-of-contents)
- [Capabilities](#capabilities)
- [Who Benefits](#who-benefits)
- [Use Cases](#use-cases)
- [Examples](#examples)
- [Canonical Test Agent](#canonical-test-agent)
- [Getting Started](#getting-started)
- [Discovery](#discovery)
- [Integration Guidance](#integration-guidance)
- [Compliance \& Regulatory Alignment](#compliance--regulatory-alignment)
- [Technical Details](#technical-details)
- [Interoperability and Payment Flows](#interoperability-and-payment-flows)
- [Resources](#resources)
- [Repository Structure](#repository-structure)
- [Verification \& Validation](#verification--validation)
- [Join the Community](#join-the-community)
- [Contributing](#contributing)
- [License](#license)
---

## Capabilities

- Payments and advanced enforcement optional for non-commercial/open access
- **File-based, programmable access:** `pricing.txt` or `.well-known/peac.json`
- **Consent & attribution enforcement** (EIP-712/Ed25519)
- **Tiered pricing, sessions, tokens, and lite mode** (no-crypto onboarding)
- **Full privacy/anon controls:** hashed agent IDs, do-not-log flags, GDPR support
- **Open SDKs:** Node.js, Python, and CLI tooling
- **Interoperable:** Stripe, HTTP 402, x402, Kaspa, and future agent pay standards
- **Evasion-Resistant:** FingerprintJS ML integration for spoof detection
- **Plug-and-play plugins:** WordPress, Shopify (proxy)
- **Regulatory-ready:** AI Act, GDPR, DMCA, and more
- **Designed for everyone:** publishers, devs, AI/data agents, regulators, individuals

---

## Who Benefits

- **Publishers & Creators:** Monetize, attribute, or just consent to AI/bot access; zero lock-in
- **Platforms & CDNs:** Serve or enforce terms for millions of sites with easy integration
- **AI/Data Agents:** Access ethically, with cryptographic proof and tiered negotiation
- **Developers:** Build on a modern, open, and composable protocol (SDKs, plugins, CLI, full test suite)
- **Regulators & Compliance Teams:** Audit easily with cryptographic proofs, anonymized logs, and GDPR/EU AI Act mapping.

> **PEAC Protocol is not a paywall** it’s an open, programmable trust, attribution, and compliance layer. Like `robots.txt`, but verifiable and future-proof.

---

## Use Cases

| Scenario | Description |
|----------|-------------|
| Open Research Bot | Non-commercial bot with consent/attribution, no payment |
| AI Data Licensing | Licensed access, tiered negotiation with cryptographic proof |
| Attribution Enforcement | Require visible credit for content used in AI or bots |
| Synthetic Data Licensing | Attribute/price AI-generated derivatives or hybrid datasets |
| Enterprise tiered Premium APIs | Programmed pricing, consent, and session controls |
| E-commerce | Shopify/WordPress plugins for web2/web3 automation |
|Enterprise Integration | Scalable APIs for AI agents (e.g., CDN enforcement). |

Propose new use cases via PRs, see [spec.md](spec.md) for extensions.

---

## Examples

For publishers: Start with minimal-pricing.txt to enable consent/attribution without payments.

- [`examples/pricing.txt`](examples/pricing.txt) – minimal, canonical (consent/attribution only)
- [`examples/full-pricing.txt`](examples/full-pricing.txt) – sessions, tiers, expiry, advanced
- [`examples/minimal-pricing.txt`](examples/minimal-pricing.txt) – deny-all (strict baseline)

> Deploy `pricing.txt` at your root (`https://yoursite.com/pricing.txt`).
> The `examples/` folder contains all files for development and onboarding.

## Canonical Test Agent

PEAC official tests use a public Ethereum key for open, auditable EIP-712 verification:

- `agent_id`: `0xa0fb98a1d397d13fbe71f31fbc3241c8b01488da`
- `private_key`: `4f3edf983ac636a65a842ce7c78d9aa706d3b113b37d7b1b6b5ddf49f7f6ed15`

_This is public and safe for dev/local/E2E; never use for production or real assets._

## Getting Started

1. **Add a `pricing.txt` file to your web root:**  
   Copy from `examples/pricing.txt` or `examples/full-pricing.txt`.

2. **Install the PEAC SDK:**  
   ```bash
   npm install @peac/protocol
   ```
   or
   ```bash
   pip install peac-protocol
   ```  

3. **Validate/generate terms using the CLI:**
  ```bash
  node cli/peac-cli.js generate
  node cli/peac-cli.js validate examples/pricing.txt
  ```

4. **Integrate in your service/app:**
```js
// Import core PEAC SDK functions (Node.js)
const {
  fetchPricing,    // Fetch terms from a publisher
  checkAccess,     // Validate an access request against terms
  handlePayment,   // Trigger HTTP 402/x402/Stripe payments (optional)
  signRequest,     // EIP-712 (ETH) or Ed25519 (fast) signatures
  getTermsHash     // Generate or check canonical terms hash
} = require('./core');

// 1. Fetch publisher's terms
const terms = await fetchPricing('https://example.com');

// 2. Prepare a signed access request (EIP-712 or Ed25519)
const privateKey = '0x...'; // EIP-712, or use Ed25519 for v0.9.1
const request = {
  agent_id: '0xYourAddress', // or Ed25519 public key (base64)
  user_id: 'bot123',
  agent_type: 'ai-crawler',
  deal_id: 'negotiated-abc123' // for negotiated deals (see metadata)
};
// For Ed25519, see core/ed25519/node/sign.js or SDK example
const signature = await signRequest(request, privateKey);

// 3. Add all required headers for compliance (EIP-712/Ed25519/Lite)
const headers = {
  'X-PEAC-Agent-ID': request.agent_id,
  'X-PEAC-User-ID': request.user_id,
  'X-PEAC-Agent-Type': request.agent_type,
  'X-PEAC-Deal-ID': request.deal_id,
  'X-PEAC-Signature': signature,
  'X-PEAC-Attribution-Consent': 'true', // Set as needed
  'X-PEAC-Lite-Token': '',               // Optional (Lite mode)
  // Add Ed25519/nonce/timestamp headers if using Ed25519:
  // 'X-PEAC-Nonce': nonce,
  // 'X-PEAC-Expiry': expiry,
  // 'X-PEAC-Public-Key': pubkey_base64
};

// 4. Check access (on the server, before responding)
const access = checkAccess(terms, headers, { path: '/blog/article' });

if (!access.access) {
  // Optionally trigger payment handler for HTTP 402, x402, Stripe, etc.
  await handlePayment(access.reason, headers, terms);
}
```

***Key Points for v0.9.1:***

- **Ed25519 signatures:** use for fast, quantum-safe, bot-friendly access (see /core/ed25519/node/).

- **Lite Mode:** Skip signatures for fast onboarding/dev (see /core/interop/lite_mode/).

- **Full Privacy:** Anonymize agent IDs/logs via privacy module.

- **Multi-language:** SDKs for Node.js and Python; see /core/sdk/.

> For Python/other languages, see docs/AGENTS.md and /core/sdk/python/peac_sdk.py for equivalent usage.

## Discovery

```markdown
| Priority | Location                     | Notes                |
|----------|------------------------------|----------------------|
| 1        | /pricing.txt                 | Human-readable, YAML  |
| 2        | /.well-known/peac.yaml       | Fallback             |
| 3        | /.well-known/peac.json       | Fallback             |
| 4        | Link header rel="peac-terms" | Redirect if present  |
```

## Integration Guidance

**Publishers/Platforms/API Providers:**  
- Deploy a `pricing.txt` or `.well-known/peac.json` file at your domain root.
- Integrate with your server, CDN, or API middleware.
- Use plugins (WordPress/Shopify) for a plug-and-play solution.
- Configure attribution and consent header checks as needed (see examples in this README).

**Agents/Crawlers/AI Companies:**  
- Use PEAC SDK or standard HTTP with EIP-712/Ed25519 headers.
- Parse and respect publisher `pricing.txt` terms, attribution, and payments.
- Implement attribution, consent, and payment headers in all automated access flows.

**Creators/Blogs/Non-technical users:**  
- Just add pricing.txt to your root.
- No backend or infra changes required for basic compliance.

**Regulators/IP Owners/Rights Holders:**  
- Assert pricing, consent, and attribution in clear files.
- Audit and resolve disputes with cryptographic proofs.

PEAC Protocol enables seamless, interoperable enforcement for all participants: publishers, AI/data agents, web services, and individuals, without lock-in or barriers to adoption.

> For Python/Go/other SDKs, see [docs/AGENTS.md] (or propose an implementation!)

***Express/Node Middleware Example***

For plug-and-play server integration, use the PEAC middleware in Express/Vercel or any Node server.

```js
const peacMiddleware = require('./core/middleware');
const yaml = require('js-yaml');
const fs = require('fs');
const pricing = yaml.load(fs.readFileSync('examples/pricing.txt', 'utf8'));

app.use(peacMiddleware(pricing));
```
// ...routes below

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

- **Audit Trails:** Cryptographically signed access and attribution.
- **Provenance:** Logs and proofs for every session or transaction.
- **GDPR/AI Act:** Privacy-first design; full anonymizer modules and do-not-log options.
- **Open Mapping:** [COMPLIANCE.md](COMPLIANCE.md) for detailed guidance.

> Interoperable with global regulatory goals (EU AI Act, GDPR, DMCA, and others).

> Policy makers, compliance teams, and standards bodies are invited to review and extend PEAC for specific regulatory requirements.

## Technical Details

- **Development/Testing Override:** .peacrc for local/dev flags. (e.g., "allowHttp": true) - dev only, not production.  
- **Signatures & Sessions:** Ed25519 (fast, quantum-resistant) or EIP-712 (Ethereum) for identity; enforce expires_in (duration) or valid_until (ISO 8601) 
- **Security Note:** All prod keys/secrets must be managed securely; test keys public for reproducibility.

## Interoperability and Payment Flows

- [HTTP 402](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/402): HTTP Status Code 402, also known as "Payment Required"
- [x402 Payments](https://github.com/agentic-x402/x402-protocol): Enables instant stablecoin payments directly over HTTP
- [Stripe Agent Pay](https://docs.stripe.com/agents/quickstart) & [Agent Toolkit](https://github.com/stripe/agent-toolkit): Agent payment flows for APIs/bots
- [Stripe Payment Links](https://stripe.com/docs/payment-links): Low-friction way for publishers to monetize content access. Publisher-side payment UX (reference implementation)
- - [Kaspa](https://kaspa.org/): Optional L2 payment stubs
- [ajv-cli](https://github.com/ajv-validator/ajv-cli): Schema validation for JSON/YAML pricing terms

> The protocol will track IETF/ISO/industry developments for HTTP 402, agent payments, and data consent to maximize adoption and minimize lock-in.

## Resources

- Website: https://peacprotocol.org
- Quickstart: examples/pricing.txt
- Blog, integrations, SDKs: see /docs and GOVERNANCE.md

All code, CLI, and examples are copy-paste ready and thoroughly tested, if you spot an issue, file a GitHub issue or pull request!

## Repository Structure

```bash
peac/
├── .github/
│   └── workflows/
│       └── test.yml
├── .gitignore
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── core/
│   └── ed25519/
│       ├── node/
│       │   ├── sign.js
│       │   ├── verify.js
│       │   ├── nonceCache.js
│       │   └── __tests__/
│       │       ├── sign.test.js
│       │       └── verify.test.js
│       └── python/
│           ├── sign.py
│           ├── verify.py
│           ├── nonce_cache.py
│           └── tests/
│               ├── test_sign.py
│               └── test_verify.py
├── interop/
│   ├── http402/
│   │   ├── handler.js
│   │   ├── handler.py
│   │   ├── __tests__/
│   │   │   ├── http402_handler.test.js
│   │   │   └── test_handler.py
│   └── lite_mode/
│       ├── token.js
│       ├── token.py
│       ├── __tests__/
│           ├── token.test.js
│           └── test_token.py
├── privacy/
│   ├── log_policy.md
│   ├── node/
│   │   ├── anonymizer.js
│   │   └── __tests__/
│   │       └── anonymizer.test.js
│   └── python/
│       ├── anonymizer.py
│       └── tests/
│           └── test_anonymizer.py
├── sdk/
│   ├── node/
│   │   ├── index.js
│   │   └── __tests__/
│   │       └── sdk.test.js
│   └── python/
│       ├── peac_sdk.py
│       └── test_peac_sdk.py
├── plugins/
│   ├── wordpress/
│   │   ├── peac-plugin.php
│   │   ├── fingerprint.js
│   │   └── readme.txt
│   └── shopify/
│       ├── peac-proxy.js
│       ├── proxy.js
│       ├── readme.txt
│       └── test_proxy.js
├── docs/
│   ├── quickstart.md
│   ├── migration.md
│   ├── architecture.md
│   ├── privacy.md
│   └── changelog.md
├── tests/
│   ├── node/
│   │   └── test_sign.js
│   ├── python/
│   │   └── test_sign.py
│   └── php/
│       └── test_plugin.php
├── .env.example
├── requirements.txt
├── package.json
```

## Verification & Validation

```bash
node -e "require('./core')"
npm test --prefix core
````

**Validating Example pricing.txt Files**

PEAC recommends using the built-in CLI to validate YAML-based pricing files:

```bash
node cli/peac-cli.js validate examples/pricing.txt
npx js-yaml examples/pricing.txt > examples/pricing.json
npx ajv-cli validate -s schema/pricing.schema.json -d examples/pricing.json
```

To validate against the JSON schema using ajv, first convert YAML to JSON:

> If you see "unknown format date-time" warnings, this is expected; CLI is authoritative.

## Join the Community

PEAC is OSS, your contributions shape the protocol.

- File issues, PRs, and feedback on GitHub

- Propose new SDKs or integrations

- Join discussions on X (@peacprotocol) or email contact@peacprotocol.org.
  
  Forks/extensions welcome!"

***Let’s build the fair, programmable web together!***

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

For partnerships, integrations, or support, contact: contact@peacprotocol.org

## License

Apache 2.0: see [LICENSE](LICENSE).
