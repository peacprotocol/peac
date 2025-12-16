/**
 * Policy Kit Compiler Tests
 *
 * Golden tests for compile/export APIs.
 * Tests ensure deterministic, stable output across runs.
 * Rule order is preserved (first-match-wins semantics).
 */

import { describe, it, expect } from 'vitest';
import {
  compilePeacTxt,
  compileRobotsSnippet,
  compileAiprefTemplates,
  renderPolicyMarkdown,
  PolicyDocument,
  POLICY_VERSION,
  PEAC_PROTOCOL_VERSION,
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

// Test fixture: allow-by-default policy
const allowPolicy: PolicyDocument = {
  version: POLICY_VERSION,
  defaults: { decision: 'allow' },
  rules: [],
};

// Test fixture: policy with RSL purposes (v0.9.17+)
const rslPurposePolicy: PolicyDocument = {
  version: POLICY_VERSION,
  defaults: { decision: 'deny' },
  rules: [
    {
      name: 'allow-ai-index',
      purpose: 'ai_index',
      decision: 'allow',
    },
    {
      name: 'allow-ai-input',
      purpose: 'ai_input',
      decision: 'allow',
    },
    {
      name: 'deny-train',
      purpose: ['train', 'search'],
      decision: 'deny',
    },
  ],
};

describe('compilePeacTxt', () => {
  it('should compile minimal policy with canonical schema', () => {
    const output = compilePeacTxt(minimalPolicy, { includeComments: false });

    expect(output).toContain(`version: ${PEAC_PROTOCOL_VERSION}`);
    expect(output).toContain('usage: conditional');
    expect(output).toContain('receipts: required');
  });

  it('should compile allow-default policy as usage: open', () => {
    const output = compilePeacTxt(allowPolicy, { includeComments: false });

    expect(output).toContain(`version: ${PEAC_PROTOCOL_VERSION}`);
    expect(output).toContain('usage: open');
    // Open usage defaults to optional receipts (not required)
    expect(output).not.toContain('receipts: required');
    expect(output).toContain('receipts: optional');
  });

  it('should compile comprehensive policy with all fields', () => {
    const output = compilePeacTxt(comprehensivePolicy, {
      contact: 'policy@example.com',
      attribution: 'required',
      rateLimit: '100/hour',
      negotiateUrl: 'https://api.example.com/negotiate',
      includeComments: false,
    });

    expect(output).toContain(`version: ${PEAC_PROTOCOL_VERSION}`);
    expect(output).toContain('usage: conditional');
    expect(output).toContain('contact: policy@example.com');
    expect(output).toContain('attribution: required');
    expect(output).toContain('receipts: required');
    expect(output).toContain('rate_limit: 100/hour');
    expect(output).toContain('negotiate: https://api.example.com/negotiate');
    // Purposes should be sorted alphabetically (informational, safe to sort)
    expect(output).toContain('purposes: [crawl, inference, train]');
  });

  it('should include comments when requested', () => {
    const output = compilePeacTxt(minimalPolicy, { includeComments: true });

    expect(output).toContain('# PEAC Policy Discovery File');
    expect(output).toContain('# Serve at: /.well-known/peac.txt');
    expect(output).toContain('# See: https://peacprotocol.org');
  });

  it('should preserve rule order in comments (first-match-wins)', () => {
    const output = compilePeacTxt(comprehensivePolicy, { includeComments: true });

    expect(output).toContain('# Policy rules (first-match-wins, author order preserved):');
    // Rules should appear in author order, NOT alphabetical
    const ruleLines = output
      .split('\n')
      .filter((line) => line.startsWith('#   ') && line.includes(': '));

    expect(ruleLines[0]).toContain('allow-subscribed-crawl: allow');
    expect(ruleLines[1]).toContain('allow-verified-train: allow');
    expect(ruleLines[2]).toContain('deny-agents-train: deny');
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

  it('should allow overriding receipts to omit', () => {
    const output = compilePeacTxt(minimalPolicy, { includeComments: false, receipts: 'omit' });

    expect(output).not.toContain('receipts:');
  });

  it('should allow overriding receipts to optional for conditional', () => {
    const output = compilePeacTxt(minimalPolicy, { includeComments: false, receipts: 'optional' });

    expect(output).toContain('receipts: optional');
    expect(output).not.toContain('receipts: required');
  });

  it('should allow overriding receipts to required for open', () => {
    const output = compilePeacTxt(allowPolicy, { includeComments: false, receipts: 'required' });

    expect(output).toContain('receipts: required');
    expect(output).not.toContain('receipts: optional');
  });

  it('should correctly extract RSL purposes (ai_input, ai_index, search)', () => {
    const output = compilePeacTxt(rslPurposePolicy, { includeComments: false });

    // RSL purposes should be extracted and sorted alphabetically
    expect(output).toContain('purposes: [ai_index, ai_input, search, train]');
  });

  it('golden: minimal deny policy peac.txt (no comments)', () => {
    const output = compilePeacTxt(minimalPolicy, { includeComments: false });

    // Golden output - canonical schema format
    const expected = [
      `version: ${PEAC_PROTOCOL_VERSION}`,
      'usage: conditional',
      '',
      'receipts: required',
      '',
    ].join('\n');

    expect(output).toBe(expected);
  });

  it('golden: minimal allow policy peac.txt (no comments)', () => {
    const output = compilePeacTxt(allowPolicy, { includeComments: false });

    // Golden output - open usage with optional receipts (default for open)
    const expected = [
      `version: ${PEAC_PROTOCOL_VERSION}`,
      'usage: open',
      '',
      'receipts: optional',
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
    expect(peacPolicy?.value).toContain(`version=${PEAC_PROTOCOL_VERSION}`);
    expect(peacPolicy?.value).toContain('usage=conditional');
    expect(peacPolicy?.value).toContain('rules=0');
  });

  it('should use usage=open for allow-default policy', () => {
    const templates = compileAiprefTemplates(allowPolicy);

    const peacPolicy = templates.find((t) => t.header === 'PEAC-Policy');
    expect(peacPolicy?.value).toContain('usage=open');
  });

  it('should include X-Robots-Tag for deny-default policy', () => {
    const templates = compileAiprefTemplates(minimalPolicy);

    const robotsTag = templates.find((t) => t.header === 'X-Robots-Tag');
    expect(robotsTag).toBeDefined();
    expect(robotsTag?.value).toContain('noai');
  });

  it('should NOT include X-Robots-Tag for allow-default policy', () => {
    const templates = compileAiprefTemplates(allowPolicy);

    const robotsTag = templates.find((t) => t.header === 'X-Robots-Tag');
    expect(robotsTag).toBeUndefined();
  });

  it('should include compatibility note', () => {
    const templates = compileAiprefTemplates(comprehensivePolicy);

    const note = templates.find((t) => t.header === '# Compatibility Note');
    expect(note).toBeDefined();
    expect(note?.description).toContain('compatibility only');
  });

  it('should label headers as debug/compatibility, not normative', () => {
    const templates = compileAiprefTemplates(minimalPolicy);

    const peacPolicy = templates.find((t) => t.header === 'PEAC-Policy');
    expect(peacPolicy?.description).toContain('Debug/compatibility');
    expect(peacPolicy?.description).not.toContain('normative');
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

  it('should preserve rule order (first-match-wins semantics)', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy);

    // Rules should appear in author order, NOT alphabetical
    const ruleMatches = output.match(/### [\w-]+/g);
    expect(ruleMatches).toEqual([
      '### allow-subscribed-crawl',
      '### allow-verified-train',
      '### deny-agents-train',
    ]);
  });

  it('should include blockquote about rule order', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy);

    expect(output).toContain('> Rules are evaluated in order');
  });

  it('should include contact when provided', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy, {
      contact: 'policy@example.com',
    });

    expect(output).toContain('policy@example.com');
  });

  it('should produce deterministic output', () => {
    const output1 = renderPolicyMarkdown(comprehensivePolicy);
    const output2 = renderPolicyMarkdown(comprehensivePolicy);

    expect(output1).toBe(output2);
  });

  it('should include PEAC protocol reference', () => {
    const output = renderPolicyMarkdown(comprehensivePolicy);

    expect(output).toContain('PEAC Protocol');
    expect(output).toContain('peacprotocol.org');
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
