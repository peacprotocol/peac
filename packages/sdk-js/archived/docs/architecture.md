# PEAC Protocol Architecture

## Overview

PEAC Protocol enables programmable, auditable access, consent, and payment flows using simple files (`pricing.txt`), robust agent signatures, and modular SDKs.

## Key Components

- **pricing.txt / peac.json:** Human/machine-readable access terms.
- **Signature Enforcement:** Ed25519 (Node/Python), EIP-712 for Ethereum keys.
- **HTTP 402/Payment Flows:** Modular payment handler, x402, Stripe stub.
- **Nonce/Timestamp Replay Protection:** O(1) cache, tests.
- **Privacy/Log Policy:** No PII; hashed IDs, do-not-log support.
- **Plugins:** WordPress, Shopify for easy adoption.
- **SDKs:** Node/Python, extensible to other languages.

## Flow Diagram

```plaintext
agent → GET /pricing.txt
     ← pricing terms (YAML/JSON)
agent → POST /content w/ signature, nonce, attribution
     ← 200 OK (or 402/403 with instructions)
optional: payment or negotiation
```

## Extensibility
- Add new payment modules, agent types, and plugins.

- Open for external PRs (e.g., Go, Rust SDKs).

See spec.md and ROADMAP.md for more.