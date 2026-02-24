import { describe, it, expect } from 'vitest';
import { parseRobotsTxt } from '../src/robots.js';

describe('parseRobotsTxt', () => {
  it('returns empty array for empty content', () => {
    expect(parseRobotsTxt('')).toEqual([]);
  });

  it('returns empty array for content exceeding size limit', () => {
    const huge = 'User-agent: *\nDisallow: /\n'.repeat(50000);
    expect(parseRobotsTxt(huge)).toEqual([]);
  });

  it('parses wildcard Disallow: / as deny for all AI purposes', () => {
    const content = 'User-agent: *\nDisallow: /\n';
    const entries = parseRobotsTxt(content);
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      expect(entry.decision).toBe('deny');
      expect(entry.source).toBe('robots-txt');
    }
  });

  it('parses wildcard with empty Disallow as allow', () => {
    const content = 'User-agent: *\nDisallow:\n';
    const entries = parseRobotsTxt(content);
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      expect(entry.decision).toBe('allow');
    }
  });

  it('parses specific AI user-agent (GPTBot)', () => {
    const content = 'User-agent: GPTBot\nDisallow: /\n';
    const entries = parseRobotsTxt(content);
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.purpose).sort()).toEqual(['ai-inference', 'ai-training']);
    for (const entry of entries) {
      expect(entry.decision).toBe('deny');
    }
  });

  it('parses case-insensitive user-agent matching', () => {
    const content = 'User-agent: gptbot\nDisallow: /\n';
    const entries = parseRobotsTxt(content);
    expect(entries.length).toBe(2);
  });

  it('combines specific agent and wildcard', () => {
    const content = ['User-agent: GPTBot', 'Disallow: /', '', 'User-agent: *', 'Disallow:'].join(
      '\n'
    );
    const entries = parseRobotsTxt(content);
    // GPTBot covers ai-training and ai-inference (deny)
    // Wildcard covers ai-search and ai-generative (allow)
    const training = entries.find((e) => e.purpose === 'ai-training');
    const search = entries.find((e) => e.purpose === 'ai-search');
    expect(training?.decision).toBe('deny');
    expect(search?.decision).toBe('allow');
  });

  it('handles comments and blank lines', () => {
    const content = [
      '# This is a comment',
      'User-agent: ClaudeBot',
      '# Block all crawling',
      'Disallow: /',
      '',
    ].join('\n');
    const entries = parseRobotsTxt(content);
    expect(entries.length).toBe(1);
    expect(entries[0].purpose).toBe('ai-training');
    expect(entries[0].decision).toBe('deny');
  });

  it('handles inline comments after directives', () => {
    const content = 'User-agent: * # all bots\nDisallow: / # block everything\n';
    const entries = parseRobotsTxt(content);
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      expect(entry.decision).toBe('deny');
    }
  });

  it('handles PerplexityBot for ai-search purpose', () => {
    const content = 'User-agent: PerplexityBot\nDisallow: /\n';
    const entries = parseRobotsTxt(content);
    expect(entries.length).toBe(1);
    expect(entries[0].purpose).toBe('ai-search');
    expect(entries[0].decision).toBe('deny');
  });

  it('handles Allow: / override of Disallow: /', () => {
    const content = 'User-agent: *\nDisallow: /\nAllow: /\n';
    const entries = parseRobotsTxt(content);
    for (const entry of entries) {
      expect(entry.decision).toBe('allow');
    }
  });

  it('treats partial Disallow as unspecified', () => {
    const content = 'User-agent: *\nDisallow: /private/\n';
    const entries = parseRobotsTxt(content);
    for (const entry of entries) {
      expect(entry.decision).toBe('unspecified');
    }
  });
});
