import { describe, it, expect } from 'vitest';
import {
  parseA2AExtensionsHeader,
  buildA2AExtensionsHeader,
  PEAC_EXTENSION_URI,
} from '../src/index';

describe('parseA2AExtensionsHeader', () => {
  it('parses single extension URI', () => {
    const result = parseA2AExtensionsHeader(PEAC_EXTENSION_URI);
    expect(result).toEqual([PEAC_EXTENSION_URI]);
  });

  it('parses comma-separated URIs', () => {
    const header = `${PEAC_EXTENSION_URI}, https://example.com/ext/other`;
    const result = parseA2AExtensionsHeader(header);
    expect(result).toEqual([PEAC_EXTENSION_URI, 'https://example.com/ext/other']);
  });

  it('trims whitespace around URIs', () => {
    const header = `  ${PEAC_EXTENSION_URI}  ,  https://example.com  `;
    const result = parseA2AExtensionsHeader(header);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(PEAC_EXTENSION_URI);
    expect(result[1]).toBe('https://example.com');
  });

  it('filters empty segments', () => {
    const header = `${PEAC_EXTENSION_URI},,, `;
    const result = parseA2AExtensionsHeader(header);
    expect(result).toEqual([PEAC_EXTENSION_URI]);
  });

  it('returns empty array for empty string', () => {
    expect(parseA2AExtensionsHeader('')).toEqual([]);
  });
});

describe('buildA2AExtensionsHeader', () => {
  it('builds single extension header', () => {
    expect(buildA2AExtensionsHeader([PEAC_EXTENSION_URI])).toBe(PEAC_EXTENSION_URI);
  });

  it('joins multiple extensions with comma-space', () => {
    const header = buildA2AExtensionsHeader([PEAC_EXTENSION_URI, 'https://example.com/ext']);
    expect(header).toBe(`${PEAC_EXTENSION_URI}, https://example.com/ext`);
  });

  it('round-trips: build then parse', () => {
    const uris = [PEAC_EXTENSION_URI, 'https://example.com/a', 'https://example.com/b'];
    const header = buildA2AExtensionsHeader(uris);
    const parsed = parseA2AExtensionsHeader(header);
    expect(parsed).toEqual(uris);
  });
});
