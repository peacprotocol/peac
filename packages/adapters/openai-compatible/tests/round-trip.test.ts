import { describe, it, expect } from 'vitest';
import { fromChatCompletion } from '../src/evidence.js';
import { validateInteraction } from '@peac/schema';
import type { ChatMessage, ChatCompletion } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMessages(): ChatMessage[] {
  return [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain quantum computing in one sentence.' },
  ];
}

function makeCompletion(): ChatCompletion {
  return {
    id: 'chatcmpl-round-trip-001',
    object: 'chat.completion',
    created: 1709251200,
    model: 'gpt-4-turbo',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content:
            'Quantum computing uses quantum bits that can exist in superposition to perform certain computations exponentially faster than classical computers.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 25,
      completion_tokens: 22,
      total_tokens: 47,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('round-trip: evidence -> schema validation', () => {
  it('evidence passes validateInteraction from @peac/schema', async () => {
    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion: makeCompletion(),
    });

    const result = validateInteraction(evidence);
    expect(result.valid).toBe(true);
    if (!result.valid) {
      // If this fires, print the errors for debugging
      console.error('Validation errors:', result.errors);
    }
  });

  it('evidence with provider passes validation', async () => {
    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion: makeCompletion(),
      provider: 'anthropic',
    });

    const result = validateInteraction(evidence);
    expect(result.valid).toBe(true);
  });

  it('evidence without usage passes validation', async () => {
    const completion = makeCompletion();
    delete completion.usage;

    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion,
    });

    const result = validateInteraction(evidence);
    expect(result.valid).toBe(true);
  });

  it('evidence preserves hash-only redaction through validation', async () => {
    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion: makeCompletion(),
    });

    // Verify the hash-first model is preserved
    expect(evidence.input.redaction).toBe('hash_only');
    expect(evidence.output.redaction).toBe('hash_only');

    // Validate the full structure
    const result = validateInteraction(evidence);
    expect(result.valid).toBe(true);
  });
});
