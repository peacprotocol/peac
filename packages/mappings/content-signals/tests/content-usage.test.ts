import { describe, it, expect } from 'vitest';
import { parseContentUsage } from '../src/content-usage.js';

describe('parseContentUsage', () => {
  it('returns empty entries for empty string', () => {
    const result = parseContentUsage('');
    expect(result.entries).toEqual([]);
    expect(result.raw).toBe('');
    expect(result.parsed).toEqual([]);
    expect(result.extensions).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Structured result shape (raw / parsed / entries / extensions)
  // -------------------------------------------------------------------------

  it('preserves raw header value in result', () => {
    const header = 'train-ai=n, search=y';
    const result = parseContentUsage(header);
    expect(result.raw).toBe(header);
  });

  it('includes all parsed SF Dictionary members', () => {
    const result = parseContentUsage('train-ai=n, search=y');
    expect(result.parsed.length).toBe(2);
    expect(result.parsed[0].key).toBe('train-ai');
    expect(result.parsed[0].valueType).toBe('token');
    expect(result.parsed[0].tokenValue).toBe('n');
    expect(result.parsed[1].key).toBe('search');
    expect(result.parsed[1].valueType).toBe('token');
    expect(result.parsed[1].tokenValue).toBe('y');
  });

  it('stores unknown keys in extensions (forward-compatible pass-through)', () => {
    const result = parseContentUsage('train-ai=n, future-key=y, x-custom=n');
    expect(result.extensions.length).toBe(2);
    expect(result.extensions[0].key).toBe('future-key');
    expect(result.extensions[0].valueType).toBe('token');
    expect(result.extensions[1].key).toBe('x-custom');
  });

  it('includes unknown keys in parsed but not in entries', () => {
    const result = parseContentUsage('train-ai=n, future-key=y');
    // parsed includes both known and unknown
    expect(result.parsed.length).toBe(2);
    // entries only includes mapped known keys
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    const futures = result.entries.filter(
      (e) => (e as unknown as { purpose: string }).purpose === 'future-key'
    );
    expect(futures.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // SF value type classification (RFC 9651)
  // -------------------------------------------------------------------------

  it('classifies Token values correctly', () => {
    const result = parseContentUsage('train-ai=n');
    expect(result.parsed[0].valueType).toBe('token');
    expect(result.parsed[0].tokenValue).toBe('n');
  });

  it('classifies String values correctly', () => {
    const result = parseContentUsage('train-ai="n"');
    expect(result.parsed[0].valueType).toBe('string');
    expect(result.parsed[0].tokenValue).toBeNull();
  });

  it('classifies Boolean values correctly', () => {
    const result = parseContentUsage('train-ai=?1');
    expect(result.parsed[0].valueType).toBe('boolean');
    expect(result.parsed[0].tokenValue).toBeNull();
  });

  it('classifies bare keys as Boolean', () => {
    const result = parseContentUsage('train-ai');
    expect(result.parsed[0].valueType).toBe('boolean');
    expect(result.parsed[0].tokenValue).toBeNull();
  });

  // -------------------------------------------------------------------------
  // AIPREF vocab-03 Token values: y = allow, n = disallow
  // -------------------------------------------------------------------------

  it('parses train-ai=n as deny', () => {
    const result = parseContentUsage('train-ai=n');
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    const trainAi = result.entries.find((e) => e.purpose === 'ai-training');
    expect(trainAi).toBeDefined();
    expect(trainAi!.decision).toBe('deny');
    expect(trainAi!.source).toBe('content-usage-header');
  });

  it('parses train-ai=y as allow', () => {
    const result = parseContentUsage('train-ai=y');
    const trainAi = result.entries.find((e) => e.purpose === 'ai-training');
    expect(trainAi).toBeDefined();
    expect(trainAi!.decision).toBe('allow');
  });

  it('parses search=n as deny for ai-search', () => {
    const result = parseContentUsage('search=n');
    const search = result.entries.find((e) => e.purpose === 'ai-search');
    expect(search).toBeDefined();
    expect(search!.decision).toBe('deny');
  });

  it('parses train-genai=n as deny for ai-generative', () => {
    const result = parseContentUsage('train-genai=n');
    const genai = result.entries.find((e) => e.purpose === 'ai-generative');
    expect(genai).toBeDefined();
    expect(genai!.decision).toBe('deny');
  });

  it('parses multiple comma-separated keys', () => {
    const result = parseContentUsage('train-ai=n, search=y');
    expect(result.entries.length).toBeGreaterThanOrEqual(2);
    expect(result.entries.find((e) => e.purpose === 'ai-training')?.decision).toBe('deny');
    expect(result.entries.find((e) => e.purpose === 'ai-search')?.decision).toBe('allow');
  });

  // -------------------------------------------------------------------------
  // Hierarchy propagation (Section 5.2 of vocab-03)
  // -------------------------------------------------------------------------

  it('propagates bots=n to child purposes (train-ai, search, train-genai)', () => {
    const result = parseContentUsage('bots=n');
    // bots=n propagates to train-ai, train-genai, and search via hierarchy
    expect(result.entries.length).toBeGreaterThanOrEqual(3);
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    const search = result.entries.find((e) => e.purpose === 'ai-search');
    const genai = result.entries.find((e) => e.purpose === 'ai-generative');
    // train-ai inherits deny from bots -> maps to ai-training
    expect(training).toBeDefined();
    expect(training!.decision).toBe('deny');
    expect(search?.decision).toBe('deny');
    expect(genai?.decision).toBe('deny');
  });

  it('child overrides parent: bots=y, train-ai=n', () => {
    const result = parseContentUsage('bots=y, train-ai=n');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    const search = result.entries.find((e) => e.purpose === 'ai-search');
    expect(training?.decision).toBe('deny'); // explicit child overrides
    expect(search?.decision).toBe('allow'); // inherits from bots=y
  });

  it('propagates train-ai=y to train-genai', () => {
    const result = parseContentUsage('train-ai=y');
    const genai = result.entries.find((e) => e.purpose === 'ai-generative');
    expect(genai?.decision).toBe('allow'); // inherits from train-ai=y
  });

  // -------------------------------------------------------------------------
  // SF value type handling (RFC 9651)
  // -------------------------------------------------------------------------

  it('treats bare keys as unknown (SF Boolean true is not Token y)', () => {
    const result = parseContentUsage('train-ai');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    expect(training).toBeUndefined();
  });

  it('treats String values as unknown (not Token)', () => {
    const result = parseContentUsage('train-ai="n"');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    expect(training).toBeUndefined();
  });

  it('treats Boolean ?0/?1 as unknown (not Token y/n)', () => {
    const result = parseContentUsage('train-ai=?1');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    expect(training).toBeUndefined();
  });

  it('treats unknown Token values as unknown', () => {
    const result = parseContentUsage('train-ai=maybe');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    expect(training).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // SF parameters (ignored per vocab-03)
  // -------------------------------------------------------------------------

  it('strips SF parameters from values', () => {
    const result = parseContentUsage('train-ai=n;ext=1');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    expect(training?.decision).toBe('deny');
  });

  // -------------------------------------------------------------------------
  // Duplicate key handling (last wins per SF rules)
  // -------------------------------------------------------------------------

  it('last value wins for duplicate keys', () => {
    const result = parseContentUsage('train-ai=y, train-ai=n');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    expect(training?.decision).toBe('deny'); // last wins
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('returns empty for oversized input', () => {
    const huge = 'train-ai=n,' + 'x'.repeat(10000);
    const result = parseContentUsage(huge);
    expect(result.entries).toEqual([]);
    expect(result.parsed).toEqual([]);
  });

  it('handles whitespace around values', () => {
    const result = parseContentUsage('  train-ai = n ,  search = y  ');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    const search = result.entries.find((e) => e.purpose === 'ai-search');
    expect(training?.decision).toBe('deny');
    expect(search?.decision).toBe('allow');
  });

  it('includes raw_value for debugging', () => {
    const result = parseContentUsage('train-ai=n');
    const training = result.entries.find((e) => e.purpose === 'ai-training');
    expect(training?.raw_value).toBeDefined();
  });
});
