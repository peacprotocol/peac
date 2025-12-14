/**
 * Policy Kit Compiler Tests
 *
 * Golden tests for compile/export APIs.
 * Tests ensure deterministic, stable output across runs.
 */

import { describe, it, expect } from 'vitest';
import {
  compilePeacTxt,
  compileRobotsSnippet,
  compileAiprefTemplates,
  renderPolicyMarkdown,
  PolicyDocument,
  POLICY_VERSION,
} from '../src';

// Test fixture: minimal policy
const minimalPolicy: PolicyDocument = {
  version: POLICY_VERSION,
  defaults: { decision: 'deny' },
  rules: [],
};

// Test fixture: comprehensive policy
const comprehensivePolicy: PolicyDocument = {
  version: POLICY_VERSION,
  name: 'Test Publisher Policy',
  defaults: {
    decision: 'deny',
    reason: 'Default deny for unmatched requests',
  },
  rules: [
    {
      name: 'allow-subscribed-crawl',
      subject: { type: 'human', labels: ['subscribed'] },
      purpose: 'crawl',
      licensing_mode: 'subscription',
      decision: 'allow',
      reason: 'Subscribed users can crawl',
    },
    {
      name: 'allow-verified-train',
      subject: { type: 'org', labels: ['verified'] },
      purpose: ['train', 'inference'],
      decision: 'allow',
      reason: 'Verified orgs can train',
    },
    {
      name: 'deny-agents-train',
      subject: { type: 'agent' },
      purpose: 'train',
      decision: 'deny',
      reason: 'Agents cannot train on this content',
    },
  ],
};

describe('compilePeacTxt', () => {
  it('should compile minimal policy', () => {
    const output = compilePeacTxt(minimalPolicy, { includeComments: false });

    expect(output).toContain(`policy-version: ${POLICY_VERSION}`);
    expect(output).toContain('default: deny');
    expect(output).toContain('rules: 0');
  });

  it('should compile comprehensive policy with all fields', () => {
    const output = compilePeacTxt(comprehensivePolicy, {
      siteUrl: 'https://example.com',
      contact: 'policy@example.com',
      includeComments: false,
    });

    expect(output).toContain(`policy-version: ${POLICY_VERSION}`);
    expect(output).toContain('site: https://example.com');
    expect(output).toContain('contact: policy@example.com');
    expect(output).toContain('default: deny');
    expect(output).toContain('rules: 3');
    // Purposes should be sorted alphabetically
    expect(output).toContain('purposes: crawl, inference, train');
  });

  it('should include comments when requested', () => {
    const output = compilePeacTxt(minimalPolicy, { includeComments: true });

    expect(output).toContain('# PEAC Policy Discovery File');
    expect(output).toContain('# See: https://peac.dev/spec/discovery');
  });

  it('should include rule summary in comments', () => {
    const output = compilePeacTxt(comprehensivePolicy, { includeComments: true });

    expect(output).toContain('# Rule summary (conditional - see source policy for details):');
    expect(output).toContain('#   allow-subscribed-crawl: allow');
    expect(output).toContain('#   deny-agents-train: deny');
  });

  it('should NOT output contradictory allow/deny lists', () => {
    const output = compilePeacTxt(comprehensivePolicy, { includeComments: false });

    // Should NOT have separate allow: and deny: lines that could contradict
    expect(output).not.toMatch(/^allow:/m);
    expect(output).not.toMatch(/^deny:/m);
  });

  it('should produce deterministic output (stable ordering)', () => {
    const output1 = compilePeacTxt(comprehensivePolicy, { includeComments: false });
    const output2 = compilePeacTxt(comprehensivePolicy, { includeComments: false });

    expect(output1).toBe(output2);
  });

  it('golden: comprehensive policy peac.txt (no comments)', () => {
    const output = compilePeacTxt(comprehensivePolicy, {
      siteUrl: 'https://example.com',
      contact: 'policy@example.com',
      includeComments: false,
    });

    // Golden output - no contradictory allow/deny, just default + rules
    const expected = [
      `policy-version: ${POLICY_VERSION}`,
      'site: https://example.com',
      'contact: policy@example.com',
      'default: deny',
      'rules: 3',
      'purposes: crawl, inference, train',
      '',
    ].join('\n');

    expect(output).toBe(expected);
  });
});

describe('compileRobotsSnippet', () => {
  it('should compile deny-by-default policy', () => {
    const output = compileRobotsSnippet(minimalPolicy, { includeComments: false });

    // Should disallow all AI crawlers for deny-default
    expect(output).toContain('User-agent: GPTBot');
    expect(output).toContain('Disallow: /');
    expect(output).toContain('User-agent: Anthropic-AI');
  });

  it('should compile allow-by-default policy', () => {
    const allowPolicy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'allow' },
      rules: [],
    };
    const output = compileRobotsSnippet(allowPolicy, { includeComments: false });

    expect(output).toContain('User-agent: GPTBot');
    expect(output).toContain('Allow: /');
  });

  it('should include comments when requested', () => {
    const output = compileRobotsSnippet(minimalPolicy, { includeComments: true });

    expect(output).toContain('# AI Crawler Directives');
    expect(output).toContain('# SNIPPET - Review before adding to your robots.txt');
    expect(output).toContain('# Requires PEAC receipt for access');
  });

  it('should produce deterministic output', () => {
    const output1 = compileRobotsSnippet(comprehensivePolicy, { includeComments: false });
    const output2 = compileRobotsSnippet(comprehensivePolicy, { includeComments: false });

    expect(output1).toBe(output2);
  });

  it('golden: deny-default robots snippet', () => {
    const output = compileRobotsSnippet(minimalPolicy, { includeComments: false });

    // Should contain all known AI crawlers with Disallow
    expect(output).toContain('User-agent: Anthropic-AI\nDisallow: /');
    expect(output).toContain('User-agent: GPTBot\nDisallow: /');
    expect(output).toContain('User-agent: Google-Extended\nDisallow: /');
    expect(output).toContain('User-agent: CCBot\nDisallow: /');
  });
});

describe('compileAiprefTemplates', () => {
  it('should compile minimal policy to AIPREF templates', () => {
    const templates = compileAiprefTemplates(minimalPolicy);

    expect(templates).toBeInstanceOf(Array);
    expect(templates.length).toBeGreaterThan(0);

    // Should always have PEAC-Policy header
    const peacPolicy = templates.find((t) => t.header === 'PEAC-Policy');
    expect(peacPolicy).toBeDefined();
    expect(peacPolicy?.value).toContain(`version=${POLICY_VERSION}`);
    expect(peacPolicy?.value).toContain('default=deny');
    expect(peacPolicy?.value).toContain('rules=0');
  });

  it('should include X-Robots-Tag for deny-default policy', () => {
    const templates = compileAiprefTemplates(minimalPolicy);

    const robotsTag = templates.find((t) => t.header === 'X-Robots-Tag');
    expect(robotsTag).toBeDefined();
    expect(robotsTag?.value).toContain('noai');
  });

  it('should NOT include X-Robots-Tag for allow-default policy', () => {
    const allowPolicy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'allow' },
      rules: [],
    };
    const templates = compileAiprefTemplates(allowPolicy);

    const robotsTag = templates.find((t) => t.header === 'X-Robots-Tag');
    expect(robotsTag).toBeUndefined();
  });

  it('should include compatibility note about conditional rules', () => {
    const templates = compileAiprefTemplates(comprehensivePolicy);

    const note = templates.find((t) => t.header === '# AIPREF Compatibility Note');
    expect(note).toBeDefined();
    expect(note?.description).toContain('avoid contradictions');
  });

  it('should produce deterministic output', () => {
    const output1 = JSON.stringify(compileAiprefTemplates(comprehensivePolicy));
    const output2 = JSON.stringify(compileAiprefTemplates(comprehensivePolicy));

    expect(output1).toBe(output2);
  });
});

describe('renderPolicyMarkdown', () => {
  it('should render minimal policy', () => {
    const output = renderPolicyMarkdown(minimalPolicy);

    expect(output).toContain('# AI Access Policy');
    expect(output).toContain('**Default Decision:** deny');
    expect(output).toContain('**Total Rules:** 0');
  });

  it('should render comprehensive policy with name', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy);

    expect(output).toContain('# Test Publisher Policy');
    expect(output).toContain('**Default Decision:** deny');
    expect(output).toContain('**Total Rules:** 3');
  });

  it('should include how-it-works section', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy);

    expect(output).toContain('## How This Policy Works');
    expect(output).toContain('first-match-wins');
  });

  it('should include rules section', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy);

    expect(output).toContain('## Rules');
    expect(output).toContain('### allow-subscribed-crawl');
    expect(output).toContain('### allow-verified-train');
    expect(output).toContain('### deny-agents-train');
  });

  it('should include contact when provided', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy, {
      contact: 'policy@example.com',
    });

    expect(output).toContain('policy@example.com');
  });

  it('should produce deterministic output (rules sorted alphabetically)', () => {
    const output1 = renderPolicyMarkdown(comprehensivePolicy);
    const output2 = renderPolicyMarkdown(comprehensivePolicy);

    expect(output1).toBe(output2);

    // Rules should be sorted alphabetically by name
    const ruleOrder = output1.match(/### (\w+-\w+-\w+)/g);
    expect(ruleOrder).toEqual([
      '### allow-subscribed-crawl',
      '### allow-verified-train',
      '### deny-agents-train',
    ]);
  });

  it('should include PEAC protocol reference', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy);

    expect(output).toContain('PEAC Protocol');
    expect(output).toContain('peac.dev');
  });
});

describe('determinism', () => {
  it('all compile functions should produce byte-identical output across multiple calls', () => {
    // Run each compile function multiple times and verify identical output
    for (let i = 0; i < 5; i++) {
      const peac1 = compilePeacTxt(comprehensivePolicy, { includeComments: false });
      const peac2 = compilePeacTxt(comprehensivePolicy, { includeComments: false });
      expect(peac1).toBe(peac2);

      const robots1 = compileRobotsSnippet(comprehensivePolicy, { includeComments: false });
      const robots2 = compileRobotsSnippet(comprehensivePolicy, { includeComments: false });
      expect(robots1).toBe(robots2);

      const aipref1 = JSON.stringify(compileAiprefTemplates(comprehensivePolicy));
      const aipref2 = JSON.stringify(compileAiprefTemplates(comprehensivePolicy));
      expect(aipref1).toBe(aipref2);

      const md1 = renderPolicyMarkdown(comprehensivePolicy);
      const md2 = renderPolicyMarkdown(comprehensivePolicy);
      expect(md1).toBe(md2);
    }
  });
});
