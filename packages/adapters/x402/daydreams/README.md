# @peac/adapter-x402-daydreams

x402+Daydreams AI inference router adapter for PEAC protocol.

Maps Daydreams AI inference events to PaymentEvidence using the PEIP-AI/inference@1 subject profile.

## Installation

```bash
pnpm add @peac/adapter-x402-daydreams
```

## Usage

```typescript
import { fromInferenceEvent, fromWebhookEvent } from '@peac/adapter-x402-daydreams';

// Process an inference event
const result = fromInferenceEvent({
  eventId: 'evt_abc123',
  modelId: 'gpt-4',
  provider: 'openai',
  amount: 500, // in minor units (cents)
  currency: 'USD',
  inputClass: 'text',
  outputType: 'text',
  tokens: { input: 100, output: 50 },
});

if (result.ok) {
  console.log(result.value); // PaymentEvidence
} else {
  console.error(result.error);
}

// Process a webhook event
const webhookResult = fromWebhookEvent({
  type: 'inference.completed',
  data: {
    eventId: 'evt_xyz789',
    modelId: 'claude-3-opus',
    provider: 'anthropic',
    amount: 1000,
    currency: 'USD',
  },
});
```

## Configuration

```typescript
import { fromInferenceEvent, type DaydreamsConfig } from '@peac/adapter-x402-daydreams';

const config: DaydreamsConfig = {
  defaultEnv: 'test',
  allowedProviders: ['openai', 'anthropic'],
  allowedModels: ['gpt-4', 'claude-3-opus'],
};

const result = fromInferenceEvent(event, config);
```

## Documentation

See [peacprotocol.org](https://www.peacprotocol.org) for full documentation.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
