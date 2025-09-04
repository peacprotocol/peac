/**
 * @peac/pref/robots - Test robots.txt parsing
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

test('robotsToAIPref - GPTBot disallow converts to no-train', () => {
  const rules = [
    {
      userAgent: 'GPTBot',
      directives: [{ field: 'disallow', value: '/' }]
    }
  ];
  
  const snapshot = robotsToAIPref(rules);
  assert.strictEqual(snapshot.crawl, false);
  assert.strictEqual(snapshot['train-ai'], false);
});

test('robotsToAIPref - wildcard allow converts to crawl-ok', () => {
  const rules = [
    {
      userAgent: '*',
      directives: [{ field: 'allow', value: '/' }]
    }
  ];
  
  const snapshot = robotsToAIPref(rules);
  assert.strictEqual(snapshot.crawl, true);
});

test('robotsToAIPref - no AI agents returns null', () => {
  const rules = [
    {
      userAgent: 'Googlebot',
      directives: [{ field: 'disallow', value: '/admin/' }]
    }
  ];
  
  const snapshot = robotsToAIPref(rules);
  assert.strictEqual(snapshot, null);
});