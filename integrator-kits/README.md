# Integrator Kits

Pre-packaged integration guides and conformance fixtures for ecosystem integrations.

## Structure

```
integrator-kits/
  template/        Base template for new kits
  mcp/             Model Context Protocol integration
  a2a/             Agent-to-Agent protocol integration
  acp/             Agentic Commerce Protocol integration
  x402/            HTTP 402 payment protocol integration
  ucp/             Universal Commerce Protocol integration
  paymentauth/     HTTP Payment Authentication (paymentauth / MPP) integration
  stripe-projects/ Stripe Projects provisioning integration
  content-signals/ Content Signals integration
```

## Creating a new kit

1. Copy `template/` to a new directory named after the ecosystem
2. Customize the README, integration guide, and security FAQ
3. Add ecosystem-specific conformance fixtures to `fixtures/`
4. Register the adapter in the conformance harness (see `scripts/conformance-harness.ts`)

## Running conformance tests

```bash
pnpm exec tsx scripts/conformance-harness.ts --adapter core
pnpm exec tsx scripts/conformance-harness.ts --adapter core --format pretty
```

See the conformance harness documentation for full options.

---

_Last reviewed: 2026-06-24._
