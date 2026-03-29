# @peac/mappings-acp

Agentic Commerce Protocol (ACP) session lifecycle and payment observation mapping for PEAC evidence.

## Installation

```bash
pnpm add @peac/mappings-acp
```

## What It Does

`@peac/mappings-acp` maps Agentic Commerce Protocol (ACP) session events and payment observations to PEAC evidence in the Interaction Record format. It enforces a strict boundary between session lifecycle evidence (access-kind) and commerce evidence (payment-kind): an ACP session reaching "completed" does NOT prove payment settlement. Commerce evidence is only produced when an explicit payment-bearing artifact with a known observed payment state is provided by the caller.

## How Do I Use It?

### Record a session lifecycle event

```typescript
import { fromACPSessionLifecycleEvent } from '@peac/mappings-acp';
import type { ACPSessionEvent } from '@peac/mappings-acp';

const event: ACPSessionEvent = {
  session_id: 'sess_abc123',
  state: 'completed',
  resource_uri: 'https://api.example.com/v1/resource',
};

// Produces access evidence only; never commerce evidence
const receiptInput = fromACPSessionLifecycleEvent(event);
console.log(receiptInput.subject_uri); // 'https://api.example.com/v1/resource'
// receiptInput is ready to pass to issue()
```

### Record a payment observation with explicit payment artifact

```typescript
import { fromACPPaymentObservation } from '@peac/mappings-acp';
import type { ACPSessionEvent, ACPPaymentArtifact } from '@peac/mappings-acp';

const event: ACPSessionEvent = {
  session_id: 'sess_abc123',
  state: 'completed',
  resource_uri: 'https://api.example.com/v1/resource',
};

const paymentArtifact: ACPPaymentArtifact = {
  rail: 'stripe',
  reference: 'pi_xyz789',
  amount: 1500,
  currency: 'USD',
  observed_payment_state: 'captured',
};

// Commerce evidence: derived from the payment artifact, not session state
const receiptInput = fromACPPaymentObservation(event, paymentArtifact);
console.log(receiptInput.payment.rail); // 'stripe'
console.log(receiptInput.amt); // 1500
```

### Record capability negotiations and interventions

```typescript
import { fromACPCapabilitySnapshot, fromACPInterventionRequired } from '@peac/mappings-acp';
import type { ACPCapabilityNegotiation, ACPIntervention } from '@peac/mappings-acp';

const capabilities: ACPCapabilityNegotiation = {
  session_id: 'sess_abc123',
  seller_capabilities: { streaming: true },
  buyer_capabilities: { maxBudget: 5000 },
};
const capInput = fromACPCapabilitySnapshot(capabilities);

const intervention: ACPIntervention = {
  session_id: 'sess_abc123',
  resource_uri: 'https://api.example.com/v1/resource',
  type: 'human_approval',
  reason: 'Amount exceeds automatic threshold',
};
const interventionInput = fromACPInterventionRequired(intervention);
```

### Enforce agent budget limits

```typescript
import { checkBudget } from '@peac/mappings-acp';
import type { BudgetConfig } from '@peac/mappings-acp';

const config: BudgetConfig = {
  maxPerCallMinor: 50000n, // 500.00 USD max per checkout
  maxDailyMinor: 1000000n, // 10,000.00 USD max per day
  currency: 'USD',
};

const result = checkBudget(850000n, 100000n, 'USD', config);
if (result.allowed) {
  console.log(`Allowed. Remaining: ${result.remainingMinor}`);
} else {
  console.log(`Denied: ${result.reason}`);
}
```

### Carry evidence via HTTP headers

```typescript
import {
  attachCarrierToACPHeaders,
  extractCarrierFromACPHeaders,
  AcpCarrierAdapter,
} from '@peac/mappings-acp';

// Attach a signed receipt to outgoing ACP headers
const headers = attachCarrierToACPHeaders({}, receiptJws);

// Extract from incoming headers
const result = extractCarrierFromACPHeaders(incomingHeaders);
if (result) {
  console.log(result.receiptJws);
  console.log(result.receiptRef);
}

// Or use the CarrierAdapter for transport-agnostic integration
const adapter = new AcpCarrierAdapter();
```

## Integrates With

- `@peac/kernel` (Layer 0): Core types and constants
- `@peac/schema` (Layer 1): Zod validators and commerce extension schemas
- `@peac/protocol` (Layer 3): Receipt issuance using mapped evidence
- `@peac/mappings-paymentauth` (Layer 4): Complementary paymentauth header mapping

## For Agent Developers

If you are building an AI agent that participates in ACP checkout flows: use `fromACPSessionLifecycleEvent` to record session state transitions as access evidence, and `fromACPPaymentObservation` only when you have an explicit payment artifact proving a specific payment state. The `checkBudget` utility provides pure, deterministic budget enforcement for agent spending limits. Use `AcpCarrierAdapter` to carry signed evidence across HTTP boundaries between agents and ACP services.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
