import { describe, it, expect } from 'vitest';
import { headersToRecord, getHeader } from '../src/helpers.js';

describe('headersToRecord', () => {
  it('passes through Record<string, string>', () => {
    const headers = { 'content-type': 'application/json' };
    const result = headersToRecord(headers);
    expect(result).toBe(headers);
  });

  it('converts Map to Record', () => {
    const headers = new Map([
      ['Content-Type', 'application/json'],
      ['Authorization', 'Bearer token'],
    ]);
    const result = headersToRecord(headers);

    expect(result['content-type']).toBe('application/json');
    expect(result['authorization']).toBe('Bearer token');
  });

  it('converts Headers-like object to Record', () => {
    // Simulate Headers API
    const headersList: [string, string][] = [
      ['Content-Type', 'application/json'],
      ['X-Custom', 'value'],
    ];
    const headersLike = {
      forEach: (callback: (value: string, key: string) => void) => {
        headersList.forEach(([key, value]) => callback(value, key));
      },
    };

    const result = headersToRecord(headersLike);
    expect(result['content-type']).toBe('application/json');
    expect(result['x-custom']).toBe('value');
  });
});

describe('getHeader', () => {
  const headers = {
    'content-type': 'application/json',
    'X-Custom-Header': 'custom-value',
  };

  it('gets header case-insensitively', () => {
    expect(getHeader(headers, 'content-type')).toBe('application/json');
    expect(getHeader(headers, 'Content-Type')).toBe('application/json');
    expect(getHeader(headers, 'CONTENT-TYPE')).toBe('application/json');
  });

  it('returns empty string for missing header', () => {
    expect(getHeader(headers, 'nonexistent')).toBe('');
  });

  it('handles mixed-case header names', () => {
    expect(getHeader(headers, 'x-custom-header')).toBe('custom-value');
    expect(getHeader(headers, 'X-CUSTOM-HEADER')).toBe('custom-value');
  });
});
