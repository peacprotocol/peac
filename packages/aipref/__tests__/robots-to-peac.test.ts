/**
 * robotsToPeacStarter Tests
 *
 * Tests for converting robots.txt to PEAC policy starter documents.
 */
import { describe, it, expect } from 'vitest';
import { robotsToPeacStarter, parseRobots } from '../src/index';

describe('robotsToPeacStarter', () => {
  describe('basic conversion', () => {
    it('should generate minimal policy for empty robots.txt', () => {
      const result = robotsToPeacStarter('');
      expect(result.policy.version).toBe('peac-policy/0.1');
      expect(result.policy.defaults.decision).toBe('review');
      expect(result.policy.rules).toEqual([]);
      expect(result.hasAiRestrictions).toBe(false);
      expect(result.notes).toContainEqual(expect.stringContaining('ADVISORY'));
    });

    it('should generate minimal policy when no AI agents mentioned', () => {
      const robotsTxt = `
User-agent: Googlebot
Disallow: /private/

User-agent: *
Allow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.policy.rules.length).toBe(0);
      expect(result.hasAiRestrictions).toBe(false);
      expect(result.notes).toContainEqual(
        expect.stringContaining('No AI-specific restrictions')
      );
    });
  });

  describe('AI agent detection', () => {
    it('should detect GPTBot restrictions', () => {
      const robotsTxt = `
User-agent: GPTBot
Disallow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.hasAiRestrictions).toBe(true);
      expect(result.policy.rules.length).toBe(1);
      expect(result.policy.rules[0].name).toContain('gptbot');
      expect(result.policy.rules[0].decision).toBe('deny');
    });

    it('should detect Claude-Web restrictions', () => {
      const robotsTxt = `
User-agent: Claude-Web
Disallow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.hasAiRestrictions).toBe(true);
      expect(result.policy.rules.length).toBe(1);
      expect(result.policy.rules[0].decision).toBe('deny');
    });

    it('should detect CCBot restrictions', () => {
      const robotsTxt = `
User-agent: CCBot
Disallow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.hasAiRestrictions).toBe(true);
      expect(result.policy.rules.length).toBe(1);
    });

    it('should detect Google-Extended restrictions', () => {
      const robotsTxt = `
User-agent: Google-Extended
Disallow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.hasAiRestrictions).toBe(true);
      expect(result.policy.rules.length).toBe(1);
    });

    it('should detect multiple AI agent restrictions', () => {
      const robotsTxt = `
User-agent: GPTBot
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: CCBot
Disallow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.hasAiRestrictions).toBe(true);
      expect(result.policy.rules.length).toBe(3);
      expect(result.processedAgents).toEqual(['GPTBot', 'Claude-Web', 'CCBot']);
    });
  });

  describe('allow rules', () => {
    it('should generate allow rules for permitted AI agents', () => {
      const robotsTxt = `
User-agent: GPTBot
Allow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.policy.rules.length).toBe(1);
      expect(result.policy.rules[0].decision).toBe('allow');
      expect(result.policy.rules[0].name).toContain('gptbot');
    });
  });

  describe('wildcard handling', () => {
    it('should detect wildcard disallow as AI restriction', () => {
      const robotsTxt = `
User-agent: *
Disallow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.hasAiRestrictions).toBe(true);
      expect(result.notes).toContainEqual(expect.stringContaining('Wildcard'));
      expect(result.policy.rules.length).toBe(1);
      expect(result.policy.rules[0].name).toBe('deny-all-crawlers-wildcard');
    });
  });

  describe('partial rules', () => {
    it('should note path-specific rules simplification', () => {
      const robotsTxt = `
User-agent: GPTBot
Disallow: /private/
Disallow: /admin/
Allow: /public/
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.notes).toContainEqual(
        expect.stringContaining('Path-specific rules')
      );
      expect(result.notes).toContainEqual(expect.stringContaining('simplified'));
    });
  });

  describe('special directives', () => {
    it('should note crawl-delay but not map it', () => {
      const robotsTxt = `
User-agent: GPTBot
Disallow: /
Crawl-delay: 10
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.notes).toContainEqual(expect.stringContaining('Crawl-delay'));
      expect(result.notes).toContainEqual(expect.stringContaining('rate limits'));
    });

    it('should note sitemap directives', () => {
      const robotsTxt = `
User-agent: GPTBot
Disallow: /
Sitemap: https://example.com/sitemap.xml
`;
      const result = robotsToPeacStarter(robotsTxt);
      expect(result.notes).toContainEqual(expect.stringContaining('Sitemap'));
    });
  });

  describe('advisory notes', () => {
    it('should always include advisory notes', () => {
      const result = robotsToPeacStarter('');
      expect(result.notes).toContainEqual(expect.stringContaining('ADVISORY'));
      expect(result.notes).toContainEqual(expect.stringContaining('migration'));
    });

    it('should include review guidance', () => {
      const result = robotsToPeacStarter('');
      expect(result.notes).toContainEqual(expect.stringContaining('Review'));
      expect(result.notes).toContainEqual(expect.stringContaining('customize'));
    });
  });

  describe('policy document structure', () => {
    it('should generate valid policy document structure', () => {
      const robotsTxt = `
User-agent: GPTBot
Disallow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      const policy = result.policy;

      expect(policy.version).toBe('peac-policy/0.1');
      expect(policy.name).toBeDefined();
      expect(policy.defaults).toBeDefined();
      expect(policy.defaults.decision).toBe('review');
      expect(policy.defaults.reason).toBeDefined();
      expect(Array.isArray(policy.rules)).toBe(true);
    });

    it('should generate rules with required fields', () => {
      const robotsTxt = `
User-agent: GPTBot
Disallow: /
`;
      const result = robotsToPeacStarter(robotsTxt);
      const rule = result.policy.rules[0];

      expect(rule.name).toBeDefined();
      expect(rule.decision).toBeDefined();
      expect(rule.reason).toBeDefined();
    });
  });

  describe('real-world examples', () => {
    it('should handle a typical news site robots.txt', () => {
      const robotsTxt = `
# Block AI crawlers
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: Google-Extended
Disallow: /

# Allow search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: *
Disallow: /private/
`;
      const result = robotsToPeacStarter(robotsTxt);

      expect(result.hasAiRestrictions).toBe(true);
      expect(result.policy.rules.length).toBe(3);
      expect(result.processedAgents).toContain('GPTBot');
      expect(result.processedAgents).toContain('ChatGPT-User');
      expect(result.processedAgents).toContain('Google-Extended');
    });

    it('should handle a permissive robots.txt', () => {
      const robotsTxt = `
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: Claude-Web
Allow: /
`;
      const result = robotsToPeacStarter(robotsTxt);

      expect(result.hasAiRestrictions).toBe(false);
      expect(result.policy.rules.length).toBe(2); // GPTBot and Claude-Web allow rules
    });
  });
});

describe('parseRobots (existing function)', () => {
  it('should parse basic robots.txt', () => {
    const content = `
User-agent: *
Disallow: /private/
Allow: /
`;
    const rules = parseRobots(content);
    expect(rules.length).toBe(1);
    expect(rules[0].userAgent).toBe('*');
    expect(rules[0].directives.length).toBe(2);
  });

  it('should handle multiple user agents', () => {
    const content = `
User-agent: Googlebot
Allow: /

User-agent: GPTBot
Disallow: /
`;
    const rules = parseRobots(content);
    expect(rules.length).toBe(2);
    expect(rules[0].userAgent).toBe('Googlebot');
    expect(rules[1].userAgent).toBe('GPTBot');
  });

  it('should handle comments', () => {
    const content = `
# This is a comment
User-agent: *
# Another comment
Disallow: /private/
`;
    const rules = parseRobots(content);
    expect(rules.length).toBe(1);
    expect(rules[0].directives.length).toBe(1);
  });
});
