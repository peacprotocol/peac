# PEAC over HTTP 402 Profile

**Status**: INFORMATIONAL

**Purpose**: Describes how PEAC receipts integrate with HTTP 402 Payment Required flows

---

## 1. Overview

HTTP 402 is a reserved status code that is being used for paid API calls in the agentic web. PEAC provides the receipt and control layer for 402 flows without being tied exclusively to them.

**Key principle**: HTTP 402 is one enforcement method among many (AP2, TAP, manual, etc.). PEAC is orthogonal to the transport.

---

## 2. HTTP 402 in the Envelope

### 2.1 Enforcement Field

When a call uses HTTP 402 gating:

```json
{
  "auth": {
    "enforcement": {
      "method": "http-402",
      "details": {
        "status": 402,
        "www_authenticate": "Bearer realm=\"api.example.com\""
      }
    },
    "control": {
      "chain": [ ... ],
      "decision": "allow"
    }
  }
}
```

**Invariant**: `enforcement.method == "http-402"` requires `control` block (see PROTOCOL-BEHAVIOR.md Section 3).

### 2.2 Why Separate from Payment?

- `enforcement.method`: How access control was applied (HTTP 402, AP2, TAP, etc.)
- `evidence.payment.rail`: How money actually moved (x402, L402, card-network, etc.)

Example: AP2 token flow (no HTTP 402) can still have payment evidence.

---

## 3. x402 Integration

x402 is a specific HTTP 402 pattern for paid calls, primarily using stablecoins.

### 3.1 Typical x402 Flow

1. **Client** makes request to protected endpoint
2. **Server** returns `402 Payment Required` with invoice
3. **Client** pays via x402 rail (e.g., USDC on Base)
4. **Server** verifies payment, issues PEAC receipt
5. **Client** uses receipt for subsequent requests

### 3.2 x402 in PEAC Receipt

```json
{
  "auth": {
    "enforcement": {
      "method": "http-402"
    },
    "control": {
      "chain": [
        {
          "engine": "spend-control-service",
          "result": "allow"
        }
      ],
      "decision": "allow"
    }
  },
  "evidence": {
    "payment": {
      "rail": "x402",
      "reference": "x402:base-usdc:0xabc...",
      "amount": 250,
      "currency": "USD",
      "asset": "USDC",
      "env": "live",
      "network": "base-mainnet",
      "evidence": {
        "tx_hash": "0x...",
        "block_number": 12345678,
        "chain_id": 8453
      }
    }
  }
}
```

**Key points**:
- `enforcement.method`: "http-402" (how access was gated)
- `payment.rail`: "x402" (payment protocol)
- `payment.network`: "base-mainnet" (settlement layer)
- `payment.asset`: "USDC" (actual asset transferred)

---

## 4. L402 / LSAT Integration

L402 (Lightning 402) uses Lightning Network + Macaroons for paid access.

### 4.1 L402 in PEAC Receipt

```json
{
  "auth": {
    "enforcement": {
      "method": "http-402"
    },
    "control": {
      "chain": [
        {
          "engine": "spend-control-service",
          "result": "allow"
        }
      ],
      "decision": "allow"
    }
  },
  "evidence": {
    "payment": {
      "rail": "l402",
      "reference": "lnbc300u1p3...",
      "amount": 300,
      "currency": "USD",
      "asset": "BTC",
      "env": "live",
      "network": "lightning",
      "evidence": {
        "invoice": "lnbc300u1p3...",
        "preimage": "a1b2c3...",
        "macaroon": "AgEDbG5kA..."
      }
    }
  }
}
```

**Key points**:
- `payment.rail`: "l402" (distinct from x402)
- `payment.network`: "lightning"
- `payment.asset`: "BTC"
- L402-specific details in `payment.evidence`

---

## 5. HTTP 402 Response Headers

### 5.1 WWW-Authenticate Header

Standard HTTP 402 response:

```
HTTP/1.1 402 Payment Required
WWW-Authenticate: Bearer realm="api.example.com", scope="read write"
X-Payment-Invoice: x402:base-usdc:0x...
```

Maps to PEAC:
```json
{
  "auth": {
    "enforcement": {
      "method": "http-402",
      "details": {
        "status": 402,
        "www_authenticate": "Bearer realm=\"api.example.com\", scope=\"read write\"",
        "payment_invoice": "x402:base-usdc:0x..."
      }
    }
  }
}
```

---

## 6. DPoP with HTTP 402

When using DPoP for transport binding with 402:

```json
{
  "auth": {
    "enforcement": {
      "method": "http-402"
    },
    "binding": {
      "transport": "http",
      "method": "dpop",
      "evidence": {
        "jkt": "0ZcOC...",
        "nonce": "dpop-nonce-123"
      }
    }
  }
}
```

See PROTOCOL-BEHAVIOR.md Section 7 for full DPoP verification.

---

## 7. Non-402 PEAC Usage

PEAC is NOT limited to HTTP 402. Other enforcement methods:

### 7.1 AP2 (Agentic Protocol 2)
```json
{
  "auth": {
    "enforcement": {
      "method": "ap2",
      "details": {
        "token": "...",
        "policy": "..."
      }
    }
  }
}
```

### 7.2 TAP (Token Authentication Protocol)
```json
{
  "auth": {
    "enforcement": {
      "method": "tap",
      "details": {
        "card_token": "...",
        "approval_code": "..."
      }
    }
  }
}
```

---

## 8. Examples

See test vectors:
- `receipt-http402-x402-single-control.json` - HTTP 402 + x402 + Base USDC
- `receipt-payment-single-control.json` - Payment without HTTP 402 enforcement
- `receipt-minimal-no-payment.json` - No payment, no 402 (free tier)

---

## 9. References

- x402 Protocol: https://www.x402.org/
- L402 / LSAT: https://docs.lightning.engineering/the-lightning-network/l402
- HTTP 402 Status: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402
