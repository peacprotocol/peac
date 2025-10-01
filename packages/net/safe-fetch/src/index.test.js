/**
 * @peac/safe-fetch tests
 * SSRF protection validation
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { isBlockedUrl, SSRFError } from './index.js';

test('blocks file: scheme', () => {
  const result = isBlockedUrl('file:///etc/passwd');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:scheme:file:/);
});

test('blocks data: scheme', () => {
  const result = isBlockedUrl('data:text/plain,hello');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:scheme:data:/);
});

test('blocks localhost', () => {
  const result = isBlockedUrl('http://localhost/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:hostname:localhost/);
});

test('blocks 127.0.0.1', () => {
  const result = isBlockedUrl('http://127.0.0.1/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:private-ipv4:127.0.0.1/);
});

test('blocks 10.0.0.0/8', () => {
  const result = isBlockedUrl('http://10.1.2.3/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:private-ipv4/);
});

test('blocks 172.16.0.0/12', () => {
  const result = isBlockedUrl('http://172.16.1.1/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:private-ipv4/);
});

test('blocks 192.168.0.0/16', () => {
  const result = isBlockedUrl('http://192.168.1.1/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:private-ipv4/);
});

test('blocks 169.254.0.0/16 (link-local)', () => {
  const result = isBlockedUrl('http://169.254.169.254/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:private-ipv4/);
});

test('blocks ::1 (IPv6 loopback)', () => {
  const result = isBlockedUrl('http://[::1]/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:hostname|blocked:private-ipv6/);
});

test('blocks fc00::/7 (IPv6 unique local)', () => {
  const result = isBlockedUrl('http://[fc00::1]/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:private-ipv6/);
});

test('blocks fe80::/10 (IPv6 link-local)', () => {
  const result = isBlockedUrl('http://[fe80::1]/test');
  assert.strictEqual(result.blocked, true);
  assert.match(result.reason, /blocked:private-ipv6/);
});

test('allows public https URL', () => {
  const result = isBlockedUrl('https://example.com/test');
  assert.strictEqual(result.blocked, false);
});

test('allows public http URL', () => {
  const result = isBlockedUrl('http://example.com/test');
  assert.strictEqual(result.blocked, false);
});

test('SSRFError has correct structure', () => {
  const error = new SSRFError('test message', 'test-code');
  assert.strictEqual(error.name, 'SSRFError');
  assert.strictEqual(error.message, 'test message');
  assert.strictEqual(error.code, 'test-code');
  assert.ok(error instanceof Error);
});
