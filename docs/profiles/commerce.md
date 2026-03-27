# Commerce Profile

## 1. Abstract

The commerce profile documents how to use the `org.peacprotocol/commerce` extension group for recording payment evidence in PEAC interaction records. This profile constrains and documents existing schema fields; it does not add new wire format fields.

## 2. When to Use

Use this profile when recording evidence of payment-related interactions:

- API access gated by HTTP 402 payment challenges (paymentauth, x402)
- Agentic checkout sessions (ACP) with payment settlement
- Delegated payment authorization (Stripe SPT, similar systems)
- UCP order fulfillment with explicit payment confirmation
- Any interaction where payment rail, amount, and currency are available from upstream artifacts

Do NOT use this profile for:

- Order placement without payment evidence (use access profile)
- Session lifecycle without payment artifacts (use access profile)
- Delegation grants without payment confirmation (record as delegation evidence)

## 3. Required / Recommended / Prohibited Fields

| Field          | Level                  | Guidance                                                                                    |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `payment_rail` | REQUIRED               | Must identify the payment rail or protocol                                                  |
| `amount_minor` | REQUIRED               | Base-10 integer string in smallest currency unit                                            |
| `currency`     | REQUIRED               | ISO 4217 code or asset identifier, uppercase                                                |
| `reference`    | RECOMMENDED            | Payment reference from the upstream system                                                  |
| `env`          | RECOMMENDED            | `live` or `test`; defaults to `live` if omitted                                             |
| `event`        | CONDITIONAL            | Only set when the upstream artifact explicitly proves the payment state; observational only |
| `asset`        | RECOMMENDED for crypto | Token address or ticker for non-fiat assets                                                 |

## 4. Minimal Valid Receipt

A commerce-typed receipt requires at minimum:

- `type`: a registered commerce receipt type (e.g., `org.peacprotocol/commerce.payment`)
- `kind`: `evidence`
- Extension `org.peacprotocol/commerce` with: `payment_rail`, `amount_minor`, `currency`

## 5. Companion Profiles

- **Access**: for session/order lifecycle evidence alongside payment evidence
- **Identity**: when the payer or merchant identity is relevant
- **Consent**: when the payment requires user consent verification
- **Compliance**: for regulatory evidence alongside commerce records

## 6. Regulatory Context

Commerce evidence supports documentation relevant to:

- Payment dispute resolution and chargeback evidence
- Audit trail requirements for automated transactions
- Agent-mediated commerce transparency
- Financial record-keeping for machine-to-machine transactions

This profile does not by itself establish regulatory compliance.

## 7. Conformance Examples

### Valid commerce evidence (payment settled)

```json
{
  "kind": "evidence",
  "type": "org.peacprotocol/commerce.payment",
  "ext": {
    "org.peacprotocol/commerce": {
      "payment_rail": "stripe",
      "amount_minor": "1000",
      "currency": "USD",
      "reference": "pi_abc123",
      "env": "live",
      "event": "settlement"
    }
  }
}
```

### Valid commerce evidence (no event: delegation only)

```json
{
  "kind": "evidence",
  "type": "org.peacprotocol/commerce.payment",
  "ext": {
    "org.peacprotocol/commerce": {
      "payment_rail": "stripe",
      "amount_minor": "5000",
      "currency": "USD",
      "reference": "spt_tok_abc"
    }
  }
}
```

### Invalid: event set without payment proof

Setting `event: "settlement"` when the upstream artifact only proves session completion (not payment) violates the semantic boundary. The commerce extension `event` may only reflect what the source artifact actually attested.

## 8. Quick Demo

```typescript
import { issueWire02 } from '@peac/protocol';

const record = await issueWire02(
  {
    iss: 'https://api.example.com',
    sub: 'did:key:z6Mk...',
    type: 'org.peacprotocol/commerce.payment',
    kind: 'evidence',
    ext: {
      'org.peacprotocol/commerce': {
        payment_rail: 'paymentauth',
        amount_minor: '1000',
        currency: 'USD',
        reference: 'inv_12345',
        env: 'live',
      },
    },
  },
  privateKey,
  kid
);
```

## 9. Non-Goals / Not Guaranteed

This profile:

- Does not create new schema fields
- Does not by itself establish legal compliance or payment finality
- Does not imply verifier enforcement beyond what the protocol spec defines
- Does not guarantee settlement occurred (the `event` field is observational)
- Does not replace payment rails, checkout protocols, or wallets

## 10. Notes / Caveats

- The `event` field is observational metadata only. It records what the upstream system reported; it does not enforce or guarantee that state.
- Commerce evidence from different sources (paymentauth, ACP, Stripe, x402, UCP) uses the same extension group but follows source-specific extraction patterns documented in `docs/specs/COMMERCE-EVIDENCE.md`.
- `amount_minor` is a string (not a number) for arbitrary precision. Use base-10 integer representation in smallest currency units.
- In strict verification mode, registered commerce receipt types require the commerce extension group to be present.
