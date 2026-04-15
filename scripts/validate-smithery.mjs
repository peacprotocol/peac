#!/usr/bin/env node
/**
 * Smithery packaging validation script.
 *
 * Parses smithery.yaml with a real YAML parser and validates structure,
 * required fields, and commandFunction output in a sandboxed VM context.
 *
 * Validates stdio packaging only. Does not prove Streamable HTTP or
 * registry install-time behavior.
 *
 * Usage: node scripts/validate-smithery.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { createContext, runInContext } from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SMITHERY_PATH = join(ROOT, 'packages/mcp-server/smithery.yaml');

let exitCode = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ${name}: OK`);
  } catch (err) {
    console.log(`  ${name}: FAIL - ${err.message}`);
    exitCode = 1;
  }
}

console.log('Smithery Validation');
console.log('===================\n');

// 1. Parse YAML structurally
const raw = readFileSync(SMITHERY_PATH, 'utf-8');
let spec;

check('smithery.yaml parses as valid YAML', () => {
  spec = parseYaml(raw);
  if (!spec || typeof spec !== 'object') throw new Error('Parsed result is not an object');
});

if (!spec) {
  console.log('\nCannot continue: YAML parse failed.');
  process.exit(1);
}

// 2. Validate required structure from parsed object
check('startCommand exists and is an object', () => {
  if (!spec.startCommand || typeof spec.startCommand !== 'object')
    throw new Error('Missing or invalid startCommand');
});

check('startCommand.type is stdio', () => {
  if (spec.startCommand?.type !== 'stdio')
    throw new Error(`Expected type: stdio, got: ${spec.startCommand?.type}`);
});

check('configSchema exists and has properties', () => {
  const cs = spec.startCommand?.configSchema;
  if (!cs || !cs.properties) throw new Error('Missing configSchema.properties');
});

check('configSchema.properties includes issuerKey', () => {
  if (!spec.startCommand?.configSchema?.properties?.issuerKey)
    throw new Error('Missing issuerKey property');
});

check('configSchema.properties includes issuerId', () => {
  if (!spec.startCommand?.configSchema?.properties?.issuerId)
    throw new Error('Missing issuerId property');
});

check('commandFunction exists as string', () => {
  if (typeof spec.startCommand?.commandFunction !== 'string')
    throw new Error('commandFunction must be a string');
});

// 3. Evaluate commandFunction in a sandboxed VM context with timeout
const fnSource = spec.startCommand?.commandFunction;

if (typeof fnSource === 'string') {
  check('commandFunction evaluates with empty config (sandboxed)', () => {
    const ctx = createContext({});
    const fn = runInContext(`(${fnSource})`, ctx, { timeout: 1000 });
    const result = fn({});
    if (!result || result.command !== 'npx')
      throw new Error(`Expected command=npx, got ${result?.command}`);
    if (!result.args?.some((a) => a === '@peac/mcp-server' || a.startsWith('@peac/mcp-server@')))
      throw new Error('args must include @peac/mcp-server (pinned or unpinned)');
  });

  check('commandFunction evaluates with full config (sandboxed)', () => {
    const ctx = createContext({});
    const fn = runInContext(`(${fnSource})`, ctx, { timeout: 1000 });
    const result = fn({
      issuerKey: 'env:PEAC_KEY',
      issuerId: 'https://example.com',
      bundleDir: '/tmp/bundles',
      jwksFile: '/tmp/jwks.json',
    });
    if (!result.args?.includes('--issuer-key'))
      throw new Error('Full config should produce --issuer-key flag');
    if (!result.args?.includes('--issuer-id'))
      throw new Error('Full config should produce --issuer-id flag');
  });
}

// 4. Validate exampleConfig
check('exampleConfig exists and has issuerKey', () => {
  if (!spec.startCommand?.exampleConfig?.issuerKey)
    throw new Error('Missing exampleConfig.issuerKey');
});

console.log(
  `\n${exitCode === 0 ? 'All checks passed.' : 'Some checks failed.'}`
);
console.log(
  '\nNote: validates stdio packaging only. Does not prove Streamable HTTP or registry install-time behavior.'
);
process.exit(exitCode);
