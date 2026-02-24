import { describe, it, expect } from 'vitest';
import { parseTdmrep } from '../src/tdmrep.js';

describe('parseTdmrep', () => {
  it('returns empty array for empty content', () => {
    expect(parseTdmrep('')).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseTdmrep('not json')).toEqual([]);
  });

  it('returns empty array for array JSON', () => {
    expect(parseTdmrep('[]')).toEqual([]);
  });

  it('returns empty array for content exceeding size limit', () => {
    const huge = JSON.stringify({ 'tdm-reservation': 1, padding: 'x'.repeat(70000) });
    expect(parseTdmrep(huge)).toEqual([]);
  });

  it('parses tdm-reservation: 1 as deny', () => {
    const content = JSON.stringify({ 'tdm-reservation': 1 });
    const entries = parseTdmrep(content);
    expect(entries.length).toBe(2);
    expect(entries[0].purpose).toBe('tdm');
    expect(entries[0].decision).toBe('deny');
    expect(entries[1].purpose).toBe('ai-training');
    expect(entries[1].decision).toBe('deny');
  });

  it('parses tdm-reservation: 0 as allow', () => {
    const content = JSON.stringify({ 'tdm-reservation': 0 });
    const entries = parseTdmrep(content);
    expect(entries.length).toBe(2);
    expect(entries[0].decision).toBe('allow');
    expect(entries[1].decision).toBe('allow');
  });

  it('returns empty array when tdm-reservation is absent', () => {
    const content = JSON.stringify({ 'other-field': 'value' });
    expect(parseTdmrep(content)).toEqual([]);
  });

  it('returns empty array for non-numeric reservation value', () => {
    const content = JSON.stringify({ 'tdm-reservation': 'yes' });
    expect(parseTdmrep(content)).toEqual([]);
  });

  it('includes tdm-policy in raw_value when present', () => {
    const content = JSON.stringify({
      'tdm-reservation': 1,
      'tdm-policy': 'https://example.com/license',
    });
    const entries = parseTdmrep(content);
    expect(entries[0].raw_value).toContain('tdm-policy: https://example.com/license');
  });

  it('sets source to tdmrep-json', () => {
    const content = JSON.stringify({ 'tdm-reservation': 0 });
    const entries = parseTdmrep(content);
    for (const entry of entries) {
      expect(entry.source).toBe('tdmrep-json');
    }
  });
});
