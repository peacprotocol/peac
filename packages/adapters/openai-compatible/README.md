# @peac/adapter-openai-compatible

OpenAI-compatible chat completion adapter for PEAC interaction evidence using a hash-first model.

## Installation

```bash
pnpm add @peac/adapter-openai-compatible
```

## What It Does

`@peac/adapter-openai-compatible` maps chat completion responses from any OpenAI-compatible provider into PEAC interaction evidence. It uses a hash-first model: only SHA-256 digests of messages and output are recorded, along with model identifiers, token counts, and timing metadata. No raw prompt or completion text ever appears in the evidence structure. Works with OpenAI, Anthropic (via adapter), Ollama, vLLM, Together, and any other OpenAI-compatible provider without importing their SDKs.

## How Do I Use It?

### Create evidence from a chat completion

```typescript
import { fromChatCompletion } from '@peac/adapter-openai-compatible';

const evidence = await fromChatCompletion({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' },
  ],
  completion: {
    id: 'chatcmpl-abc123',
    object: 'chat.completion',
    created: 1709251200,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'The answer is 4.' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
  },
  provider: 'openai',
});

// evidence.input.digest  -> SHA-256 of canonicalized messages (no raw text)
// evidence.output.digest -> SHA-256 of output content (no raw text)
// evidence.extensions    -> model, usage, finish_reason
```

### Hash messages and output independently

```typescript
import { hashMessages, hashOutput } from '@peac/adapter-openai-compatible';

const inputHash = await hashMessages([{ role: 'user', content: 'Hello' }]);
// 'sha256:...'

const outputHash = await hashOutput('The answer is 4.');
// 'sha256:...'
```

## Integrates With

- `@peac/kernel` (Layer 0): Wire constants and types
- `@peac/schema` (Layer 1): Interaction evidence schemas
- `@peac/protocol` (Layer 3): Receipt issuance with mapped inference evidence

## For Agent Developers

If you are building an AI agent or service that calls OpenAI-compatible LLM APIs:

- Use `fromChatCompletion()` after each API call to produce signed evidence of the interaction
- The hash-first model ensures no prompt or completion text leaks into receipts
- The adapter is provider-agnostic; pass `provider` to tag evidence with the source platform
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise protocol overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
