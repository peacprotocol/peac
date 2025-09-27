# PEAC Protocol

[![Node.js CI](https://github.com/peacprotocol/peac/actions/workflows/ci.yml/badge.svg)](https://github.com/peacprotocol/peac/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Version](https://img.shields.io/badge/version-0.9.2-green.svg)](https://github.com/peacprotocol/peac/releases)

## A Universal Policy Layer for the Automated Economy

PEAC (Programmable Economic Access, Attribution & Consent) Protocol is an open standard that enables content creators, publishers, and automated systems to negotiate access, payments, and compliance programmatically. Building on proven web standards, PEAC establishes a machine-readable policy file (peac.txt) that works alongside existing infrastructure.

## What is PEAC Protocol?

PEAC Protocol provides a standardized framework for:

- Programmable access control and consent management
- Automated micropayments for content usage
- Verifiable attribution chains
- Regulatory compliance automation

The protocol addresses the growing need for fair value exchange between content creators and AI systems, while ensuring compliance with global regulations.

## Why PEAC Protocol?

As automated systems increasingly interact with web content, the need for programmable policies becomes critical. PEAC enables:

- **Publishers & Creators**: Enable fair monetization and attribution terms for content access
- **Automated Agents (AI, Bots & Crawlers)**: Access content legally with clear terms
- **Platforms & Infrastructure**: Automate compliance and reduce legal risk
- **End-Users**: Transparent data usage and privacy protection
- **Developers**: Build compliant integrations with SDK tools
- **Regulators & Compliance Teams**: Transparent audit trails and policy enforcement

## Quick Start

```bash
# Install PEAC CLI
pnpm add -g @peacprotocol/core

# Create your peac.txt
npx peac init

# Validate configuration
npx peac validate peac.txt

# Deploy to your domain
# Upload peac.txt to your-domain.com/peac.txt
```

## Core Features

| Feature                      | Description                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| **Simple Integration**       | Add one file to your domain root                               |
| **Flexible Policies**        | Define access rules for different use cases                    |
| **Payment Rails**            | Integrate with Stripe, PayPal, Stablecoins, Cryptocurrencies   |
| **Attribution Tracking**     | Cryptographic proof of content usage                           |
| **Programmatic Negotiation** | Enable agents to discover and comply with terms                |
| **Broad Support**            | Tools for publishers, developers, agents, and compliance needs |
| **Compliance Ready**         | Templates for GDPR, CCPA, EU AI Act                            |
| **Extensible**               | Modular design supports custom requirements                    |

## Basic peac.txt Example

```yaml
# peac.txt - Define your content usage policies
version: 0.9.2
protocol: peac

policy:
  consent:
    ai_training: conditional
    web_scraping: allowed

  economics:
    pricing_models:
      ai_training:
        per_gb: 0.01
        currency: USD

  attribution:
    required: true
    format: 'Source: {url}'

  compliance:
    jurisdictions:
      eu:
        gdpr: true
        ai_act: true
```

## Integration Examples

### For Publishers

```javascript
const { Parser } = require('@peacprotocol/core');

// Parse and enforce policies
const policy = await Parser.parse('example.com');

// Validate agent access
if (policy.requiresPayment('ai_training')) {
  // Handle payment flow
}
```

### For AI Agents

```javascript
const { PEACClient } = require('@peacprotocol/core');

const client = new PEACClient();
const access = await client.requestAccess('publisher.com', {
  purpose: 'ai_training',
  volume: '10GB',
});

if (access.granted) {
  // Proceed with compliant access
}
```

## Use Cases

| Scenario                | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| Open Research Bot       | Non-commercial bot with consent/attribution, no payment |
| Attribution Enforcement | Require visible credit for content used in AI or bots   |
| AI Data Licensing       | Licensed access with tiered terms and basic negotiation |

## Adoption Status

PEAC Protocol is in active development with early adopters testing integrations. We welcome pilot partners and contributors to help shape the standard.

## Documentation

- [Getting Started Guide](docs/getting-started.md)
- [Protocol Specification](spec.md)
- [API Reference](docs/api-reference.md)
- [Compliance Guide](docs/compliance-guide.md)
- [Security Policy](SECURITY.md)

## Contributing

PEAC Protocol is an open source project. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to participate.

## License

PEAC Protocol is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

## Support

- GitHub Issues: Bug reports and feature requests
- Email: contact@peacprotocol.org
- Community: Join discussions on GitHub
