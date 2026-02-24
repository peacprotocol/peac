# @peac/adapter-openai-compatible

OpenAI-compatible chat completion adapter for PEAC interaction evidence.

Maps OpenAI-compatible chat completion responses into PEAC `InteractionEvidenceV01` using a **hash-first model** (DD-138): no raw prompt or completion text is stored in receipts. Only SHA-256 digests, model identifiers, token counts, and timing metadata are recorded.

Works with any OpenAI-compatible provider (OpenAI, Anthropic Messages API via adapter, Ollama, vLLM, Together, etc.) without importing their SDKs.

## Install

```bash
pnpm add @peac/adapter-openai-compatible
```

## Usage

```typescript
import { fromChatCompletion } from '@peac/adapter-openai-compatible';

// After making an OpenAI-compatible API call:
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
  provider: 'openai', // optional
});

// evidence.input.digest  -> SHA-256 of messages (no raw text)
// evidence.output.digest -> SHA-256 of output (no raw text)
// evidence.extensions    -> model, usage, finish_reason
```

## Hash-First Model

Per DD-138, this adapter records only:

| Field           | Content                                 |
| --------------- | --------------------------------------- |
| `input.digest`  | SHA-256 of canonicalized messages array |
| `output.digest` | SHA-256 of concatenated output content  |
| `executor`      | Platform identifier and model name      |
| `extensions`    | Model ID, token counts, finish reason   |

Raw prompt and completion text never appear in the evidence structure.

## Streaming

Streaming support (`fromChatCompletionStream`) is explicitly deferred to v0.11.3.

## API

### `fromChatCompletion(params): Promise<InferenceEvidence>`

Maps a chat completion response to interaction evidence.

### `hashMessages(messages): Promise<string>`

SHA-256 hash of a messages array. Returns `sha256:<hex64>`.

### `hashOutput(content): Promise<string>`

SHA-256 hash of output text. Returns `sha256:<hex64>`.

## License

Apache-2.0
