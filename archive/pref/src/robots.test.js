/**
 * @peac/pref/robots - Legacy node:test smoke tests.
 *
 * v0.12.14+ facade defers parsing to @peac/mappings-content-signals. Full
 * coverage lives in __tests__/facade.test.ts (vitest). These smoke tests
 * keep the pre-existing `parseRobots` / `robotsToAIPref` surface exercised
 * against the compiled dist/ output.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { parseRobots, robotsToAIPref } from '../dist/robots.js';

test('parseRobots - basic user agent and directives', () => {
  const content = `
User-agent: *
Disallow: /private/

User-agent: GPTBot
Disallow: /
  `.trim();

  const rules = parseRobots(content);
  assert.strictEqual(rules.length, 2);
  assert.strictEqual(rules[0].userAgent, '*');
  assert.strictEqual(rules[0].directives[0].field, 'disallow');
  assert.strictEqual(rules[0].directives[0].value, '/private/');
  assert.strictEqual(rules[1].userAgent, 'GPTBot');
  assert.strictEqual(rules[1].directives[0].value, '/');
});

test('robotsToAIPref - GPTBot Disallow: / disables AI training', () => {
  // GPTBot maps to the ai-training / ai-inference purposes in the canonical
  // @peac/mappings-content-signals parser; the facade surfaces that as
  // `train-ai: false` on the legacy AIPrefSnapshot. `crawl` is only set for
  // search / tdm purposes, so it is not populated for GPTBot alone.
  const rules = [
    {
      userAgent: 'GPTBot',
      directives: [{ field: 'disallow', value: '/' }],
    },
  ];

  const snapshot = robotsToAIPref(rules);
  assert.strictEqual(snapshot['train-ai'], false);
});

test('robotsToAIPref - no AI agents returns null', () => {
  const rules = [
    {
      userAgent: 'Googlebot',
      directives: [{ field: 'disallow', value: '/admin/' }],
    },
  ];

  const snapshot = robotsToAIPref(rules);
  assert.strictEqual(snapshot, null);
});
