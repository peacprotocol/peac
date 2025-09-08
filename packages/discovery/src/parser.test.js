/**
 * @peac/disc/parser - Test peac.txt parsing with ≤20 lines enforcement
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { parse, emit, validate } from '../dist/parser.js';

test('parse - minimal valid peac.txt', () => {
  const content = `verify: https://example.com/peac/verify`;

  const result = parse(content);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.data.verify, 'https://example.com/peac/verify');
  assert.strictEqual(result.lineCount, 1);
});

test('parse - full peac.txt within line limit', () => {
  const content = `
preferences: https://example.com/.well-known/aipref.json
access_control: http-402
payments: ["l402", "x402", "stripe"]
provenance: c2pa
receipts: required
verify: https://example.com/peac/verify
public_keys: ["test-key-001:EdDSA:11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"]
  `.trim();

  const result = parse(content);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.data.preferences, 'https://example.com/.well-known/aipref.json');
  assert.strictEqual(result.data.access_control, 'http-402');
  assert.deepStrictEqual(result.data.payments, ['l402', 'x402', 'stripe']);
  assert.strictEqual(result.data.provenance, 'c2pa');
  assert.strictEqual(result.data.receipts, 'required');
  assert.strictEqual(result.lineCount, 7);
});

test('parse - line limit enforcement', () => {
  const lines = Array(25).fill('verify: https://example.com/peac/verify');
  const content = lines.join('\n');

  const result = parse(content);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.lineCount, 25);
  assert(result.errors[0].includes('Line limit exceeded'));
});

test('parse - missing required verify field', () => {
  const content = `preferences: https://example.com/.well-known/aipref.json`;

  const result = parse(content);
  assert.strictEqual(result.valid, false);
  assert(result.errors.some((e) => e.includes('Missing required field: verify')));
});

test('parse - invalid line format', () => {
  const content = `
verify: https://example.com/peac/verify
invalid-line-without-colon
  `.trim();

  const result = parse(content);
  assert.strictEqual(result.valid, false);
  assert(result.errors.some((e) => e.includes('Invalid format')));
});

test('emit - generates valid peac.txt', () => {
  const data = {
    verify: 'https://example.com/peac/verify',
    payments: ['x402', 'stripe'],
    receipts: 'required',
  };

  const content = emit(data);
  assert(content.includes('verify: https://example.com/peac/verify'));
  assert(content.includes('payments: ["x402", "stripe"]'));
  assert(content.includes('receipts: required'));

  // Roundtrip test
  const result = parse(content);
  assert.strictEqual(result.valid, true);
});

test('validate - convenience function', () => {
  const validContent = `verify: https://example.com/peac/verify`;
  const invalidContent = `invalid-format`;

  assert.strictEqual(validate(validContent), true);
  assert.strictEqual(validate(invalidContent), false);
});
