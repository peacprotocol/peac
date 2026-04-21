/**
 * Tests for peac.txt parser: thin loader over peac-policy/0.1 + legacy
 * key-discovery line tolerance with structured DeprecationWarning.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parse, emit, validate, __resetLegacyWarningForTests } from '../src/parser.js';

const VALID_YAML_POLICY = [
  "version: 'peac-policy/0.1'",
  'name: Example PEAC Policy',
  'defaults:',
  '  decision: deny',
  "  reason: 'No matching rule'",
  'rules:',
  '  - name: allow-verified-agents-inference',
  '    subject:',
  '      type: agent',
  '      labels: [verified]',
  '    purpose: inference',
  '    decision: allow',
  "    reason: 'Verified agents may run inference'",
].join('\n');

const VALID_JSON_POLICY = JSON.stringify({
  version: 'peac-policy/0.1',
  defaults: { decision: 'allow' },
  rules: [{ name: 'allow-everyone', decision: 'allow' }],
});

describe('parse() — peac-policy/0.1 via @peac/policy-kit', () => {
  it('parses a valid YAML peac-policy/0.1 document', () => {
    const result = parse(VALID_YAML_POLICY);
    expect(result.valid).toBe(true);
    expect(result.data?.version).toBe('peac-policy/0.1');
    expect(result.data?.defaults.decision).toBe('deny');
    expect(result.data?.rules).toHaveLength(1);
    expect(result.data?.rules[0].name).toBe('allow-verified-agents-inference');
  });

  it('parses a valid JSON peac-policy/0.1 document', () => {
    const result = parse(VALID_JSON_POLICY);
    expect(result.valid).toBe(true);
    expect(result.data?.rules[0].decision).toBe('allow');
  });

  it('rejects an empty document', () => {
    const result = parse('');
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatch(/Empty policy document/);
  });

  it('rejects a document missing the version literal', () => {
    const result = parse('defaults:\n  decision: deny\nrules: []\n');
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatch(/validation failed|version/i);
  });

  it('rejects a document with the wrong version literal', () => {
    const result = parse("version: 'peac-policy/0.9'\ndefaults:\n  decision: deny\nrules: []\n");
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatch(/validation failed|version/i);
  });
});

describe('emit() — serializes peac-policy/0.1 via @peac/policy-kit', () => {
  it('round-trips a minimal policy document', () => {
    const original = parse(VALID_YAML_POLICY).data!;
    const emitted = emit(original);
    const reparsed = parse(emitted);
    expect(reparsed.valid).toBe(true);
    expect(reparsed.data).toEqual(original);
  });
});

describe('validate() — convenience predicate', () => {
  it('returns true for a valid document', () => {
    expect(validate(VALID_YAML_POLICY)).toBe(true);
  });

  it('returns false for invalid input', () => {
    expect(validate('not a policy')).toBe(false);
  });
});

describe('legacy key-discovery field tolerance', () => {
  let emitWarningSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetLegacyWarningForTests();
    emitWarningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => {
      /* suppress */
    });
  });

  afterEach(() => {
    emitWarningSpy.mockRestore();
  });

  it('strips legacy "verify:" line and surfaces structured warning', () => {
    const content = `verify: https://api.example.com/verify\n` + VALID_YAML_POLICY;
    const result = parse(content);
    expect(result.valid).toBe(true);
    expect(result.data?.version).toBe('peac-policy/0.1');
    expect(result.warnings?.[0]).toMatch(/legacy key-discovery field "verify" ignored/);
    expect(emitWarningSpy).toHaveBeenCalledTimes(1);
    const [message, options] = emitWarningSpy.mock.calls[0];
    expect(String(message)).toMatch(/peac\.txt legacy key-discovery field "verify"/);
    expect(options).toMatchObject({
      code: 'PEAC_LEGACY_PEAC_TXT_KEY_FIELD',
      type: 'DeprecationWarning',
    });
  });

  it('strips legacy "public_keys:" line and surfaces structured warning', () => {
    const content = `public_keys: ["key-1:EdDSA:abc"]\n` + VALID_YAML_POLICY;
    const result = parse(content);
    expect(result.valid).toBe(true);
    expect(result.warnings?.[0]).toMatch(/legacy key-discovery field "public_keys" ignored/);
    expect(emitWarningSpy).toHaveBeenCalledTimes(1);
  });

  it('strips legacy "jwks:" line and surfaces structured warning', () => {
    const content = `jwks: https://example.com/.well-known/jwks.json\n` + VALID_YAML_POLICY;
    const result = parse(content);
    expect(result.valid).toBe(true);
    expect(result.warnings?.[0]).toMatch(/legacy key-discovery field "jwks" ignored/);
    expect(emitWarningSpy).toHaveBeenCalledTimes(1);
  });

  it('fires the legacy process.emitWarning only once per process', () => {
    parse(`verify: https://example.com/\n` + VALID_YAML_POLICY);
    parse(`public_keys: ["k:EdDSA:a"]\n` + VALID_YAML_POLICY);
    parse(`jwks: https://example.com/\n` + VALID_YAML_POLICY);
    expect(emitWarningSpy).toHaveBeenCalledTimes(1);
  });
});
