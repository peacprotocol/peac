import { describe, it, expect } from 'vitest';
import { hashMessages, hashOutput, messagesBytes, outputBytes } from '../src/hash.js';
import type { ChatMessage } from '../src/types.js';

describe('hashMessages', () => {
  it('returns sha256: prefixed hex string', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
    const hash = await hashMessages(messages);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is deterministic for same input', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ];
    const hash1 = await hashMessages(messages);
    const hash2 = await hashMessages(messages);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', async () => {
    const m1: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
    const m2: ChatMessage[] = [{ role: 'user', content: 'World' }];
    const h1 = await hashMessages(m1);
    const h2 = await hashMessages(m2);
    expect(h1).not.toBe(h2);
  });

  it('handles null content in messages', async () => {
    const messages: ChatMessage[] = [{ role: 'assistant', content: null }];
    const hash = await hashMessages(messages);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('handles empty messages array', async () => {
    const hash = await hashMessages([]);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('includes all message fields in hash', async () => {
    const withName: ChatMessage[] = [{ role: 'user', content: 'Hi', name: 'alice' }];
    const withoutName: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const h1 = await hashMessages(withName);
    const h2 = await hashMessages(withoutName);
    expect(h1).not.toBe(h2);
  });
});

describe('hashOutput', () => {
  it('returns sha256: prefixed hex string', async () => {
    const hash = await hashOutput('Hello, world!');
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is deterministic', async () => {
    const h1 = await hashOutput('test output');
    const h2 = await hashOutput('test output');
    expect(h1).toBe(h2);
  });

  it('handles empty string', async () => {
    const hash = await hashOutput('');
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe('messagesBytes', () => {
  it('returns byte size of canonical JSON', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const bytes = messagesBytes(messages);
    expect(bytes).toBeGreaterThan(0);
    expect(typeof bytes).toBe('number');
  });
});

describe('outputBytes', () => {
  it('returns byte size of output content', () => {
    expect(outputBytes('Hello')).toBe(5);
    expect(outputBytes('')).toBe(0);
  });

  it('handles multi-byte characters', () => {
    // Unicode snowman is 3 bytes in UTF-8
    expect(outputBytes('\u2603')).toBe(3);
  });
});

describe('canonicalization input constraints', () => {
  it('rejects Date objects in messages', () => {
    const messages = [
      { role: 'user', content: 'hi', timestamp: new Date() },
    ] as unknown as ChatMessage[];
    expect(() => messagesBytes(messages)).toThrow(TypeError);
    expect(() => messagesBytes(messages)).toThrow('Date');
  });

  it('rejects undefined values in messages', () => {
    const messages = [{ role: 'user', content: undefined }] as unknown as ChatMessage[];
    expect(() => messagesBytes(messages)).toThrow(TypeError);
    expect(() => messagesBytes(messages)).toThrow('undefined');
  });

  it('rejects BigInt values', () => {
    const messages = [
      { role: 'user', content: 'hi', count: BigInt(42) },
    ] as unknown as ChatMessage[];
    expect(() => messagesBytes(messages)).toThrow(TypeError);
    expect(() => messagesBytes(messages)).toThrow('BigInt');
  });

  it('rejects Function values', () => {
    const messages = [{ role: 'user', content: 'hi', fn: () => {} }] as unknown as ChatMessage[];
    expect(() => messagesBytes(messages)).toThrow(TypeError);
    expect(() => messagesBytes(messages)).toThrow('Function');
  });

  it('rejects Map values', () => {
    const messages = [{ role: 'user', content: 'hi', data: new Map() }] as unknown as ChatMessage[];
    expect(() => messagesBytes(messages)).toThrow(TypeError);
    expect(() => messagesBytes(messages)).toThrow('Map/Set');
  });

  it('rejects RegExp values', () => {
    const messages = [{ role: 'user', content: 'hi', pattern: /test/ }] as unknown as ChatMessage[];
    expect(() => messagesBytes(messages)).toThrow(TypeError);
    expect(() => messagesBytes(messages)).toThrow('RegExp');
  });

  it('accepts JSON-safe types (string, number, boolean, null)', () => {
    const messages = [{ role: 'user', content: 'hi' }] as ChatMessage[];
    expect(() => messagesBytes(messages)).not.toThrow();
  });
});
