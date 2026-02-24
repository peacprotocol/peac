import { describe, it, expect } from 'vitest';
import { fromChatCompletion, INFERENCE_KIND, INFERENCE_EXTENSION_KEY } from '../src/evidence.js';
import type { ChatMessage, ChatCompletion } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMessages(): ChatMessage[] {
  return [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' },
  ];
}

function makeCompletion(overrides?: Partial<ChatCompletion>): ChatCompletion {
  return {
    id: 'chatcmpl-abc123',
    object: 'chat.completion',
    created: 1709251200, // 2024-03-01T00:00:00Z
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'The answer is 4.' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 5,
      total_tokens: 25,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fromChatCompletion', () => {
  it('produces valid evidence structure', async () => {
    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion: makeCompletion(),
    });

    expect(evidence.interaction_id).toBe('chatcmpl-abc123');
    expect(evidence.kind).toBe(INFERENCE_KIND);
    expect(evidence.kind).toBe('inference.chat_completion');
    expect(evidence.executor.platform).toBe('openai-compatible');
    expect(evidence.executor.version).toBe('gpt-4');
    expect(evidence.started_at).toBe('2024-03-01T00:00:00.000Z');
  });

  it('uses hash-first model: no raw text in output', async () => {
    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion: makeCompletion(),
    });

    // Input is hashed
    expect(evidence.input.redaction).toBe('hash_only');
    expect(evidence.input.digest.alg).toBe('sha-256');
    expect(evidence.input.digest.value).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.input.digest.bytes).toBeGreaterThan(0);

    // Output is hashed
    expect(evidence.output.redaction).toBe('hash_only');
    expect(evidence.output.digest.alg).toBe('sha-256');
    expect(evidence.output.digest.value).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.output.digest.bytes).toBeGreaterThan(0);

    // No raw text anywhere
    const json = JSON.stringify(evidence);
    expect(json).not.toContain('What is 2+2?');
    expect(json).not.toContain('The answer is 4.');
    expect(json).not.toContain('You are a helpful assistant.');
  });

  it('includes inference extension metadata', async () => {
    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion: makeCompletion(),
    });

    const ext = evidence.extensions[INFERENCE_EXTENSION_KEY] as Record<string, unknown>;
    expect(ext).toBeDefined();
    expect(ext.model).toBe('gpt-4');
    expect(ext.finish_reason).toBe('stop');
    expect(ext.usage).toEqual({
      prompt_tokens: 20,
      completion_tokens: 5,
      total_tokens: 25,
    });
  });

  it('sets provider in platform identifier', async () => {
    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion: makeCompletion(),
      provider: 'ollama',
    });

    expect(evidence.executor.platform).toBe('openai-compatible:ollama');
  });

  it('handles completion without usage', async () => {
    const completion = makeCompletion();
    delete completion.usage;

    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion,
    });

    const ext = evidence.extensions[INFERENCE_EXTENSION_KEY] as Record<string, unknown>;
    expect(ext.usage).toBeUndefined();
  });

  it('handles empty choices array', async () => {
    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion: makeCompletion({ choices: [] }),
    });

    expect(evidence.result.status).toBe('error');
    expect(evidence.output.digest.bytes).toBe(0);
  });

  it('handles null content in choices', async () => {
    const completion = makeCompletion({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: null },
          finish_reason: 'stop',
        },
      ],
    });

    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion,
    });

    expect(evidence.output.digest.bytes).toBe(0);
    expect(evidence.result.status).toBe('ok');
  });

  it('concatenates multiple choice contents', async () => {
    const completion = makeCompletion({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'First.' },
          finish_reason: 'stop',
        },
        {
          index: 1,
          message: { role: 'assistant', content: 'Second.' },
          finish_reason: 'stop',
        },
      ],
    });

    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion,
    });

    // Bytes should cover concatenated content
    expect(evidence.output.digest.bytes).toBe(new TextEncoder().encode('First.Second.').byteLength);
  });

  it('produces deterministic output for same input', async () => {
    const params = {
      messages: makeMessages(),
      completion: makeCompletion(),
    };

    const e1 = await fromChatCompletion(params);
    const e2 = await fromChatCompletion(params);

    expect(e1.input.digest.value).toBe(e2.input.digest.value);
    expect(e1.output.digest.value).toBe(e2.output.digest.value);
  });

  it('sets error status for error finish_reason', async () => {
    const completion = makeCompletion({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '' },
          finish_reason: 'error',
        },
      ],
    });

    const evidence = await fromChatCompletion({
      messages: makeMessages(),
      completion,
    });

    expect(evidence.result.status).toBe('error');
  });
});
