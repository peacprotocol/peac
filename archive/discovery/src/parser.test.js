/**
 * @peac/disc/parser - Legacy node:test smoke tests (runs against dist/).
 *
 * v0.12.14+: @peac/disc is a thin loader over peac-policy/0.1 via
 * @peac/policy-kit. Full coverage lives in tests/parser.test.ts (vitest).
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { parse, emit, validate } from '../dist/index.js';

const VALID_YAML_POLICY = [
  "version: 'peac-policy/0.1'",
  'defaults:',
  '  decision: deny',
  'rules:',
  '  - name: allow-verified',
  '    subject: { type: agent, labels: [verified] }',
  '    decision: allow',
].join('\n');

const VALID_JSON_POLICY = JSON.stringify({
  version: 'peac-policy/0.1',
  defaults: { decision: 'allow' },
  rules: [{ name: 'allow-everyone', decision: 'allow' }],
});

test('parse - valid YAML peac-policy/0.1', () => {
  const result = parse(VALID_YAML_POLICY);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.data.version, 'peac-policy/0.1');
  assert.strictEqual(result.data.defaults.decision, 'deny');
  assert.strictEqual(result.data.rules.length, 1);
});

test('parse - valid JSON peac-policy/0.1', () => {
  const result = parse(VALID_JSON_POLICY);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.data.rules[0].decision, 'allow');
});

test('parse - rejects empty input', () => {
  const result = parse('');
  assert.strictEqual(result.valid, false);
  assert(result.errors[0].includes('Empty policy document'));
});

test('parse - rejects missing version', () => {
  const result = parse('defaults:\n  decision: deny\nrules: []\n');
  assert.strictEqual(result.valid, false);
});

test('parse - strips legacy verify line with structured warning', () => {
  const content = 'verify: https://api.example.com/verify\n' + VALID_YAML_POLICY;
  const result = parse(content);
  assert.strictEqual(result.valid, true);
  assert(Array.isArray(result.warnings));
  assert(result.warnings.some((w) => w.includes('legacy key-discovery field "verify" ignored')));
});

test('parse - strips legacy public_keys line with structured warning', () => {
  const content = 'public_keys: ["k:EdDSA:a"]\n' + VALID_YAML_POLICY;
  const result = parse(content);
  assert.strictEqual(result.valid, true);
  assert(
    result.warnings.some((w) => w.includes('legacy key-discovery field "public_keys" ignored'))
  );
});

test('emit - round-trip', () => {
  const original = parse(VALID_YAML_POLICY).data;
  const emitted = emit(original);
  const reparsed = parse(emitted);
  assert.strictEqual(reparsed.valid, true);
  assert.deepStrictEqual(reparsed.data, original);
});

test('validate - convenience', () => {
  assert.strictEqual(validate(VALID_YAML_POLICY), true);
  assert.strictEqual(validate('not-a-policy'), false);
});
