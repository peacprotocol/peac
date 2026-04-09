import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

// Load kernel error codes (source of truth)
const errorsJson = JSON.parse(readFileSync(join(ROOT, 'specs/kernel/errors.json'), 'utf-8'));
const kernelCodes = new Set(errorsJson.errors.map((e) => e.code));

// Load hosted error catalog (from built dist, matching other test patterns)
const { HOSTED_ERROR_CODES, toProblemDetails, getCatalogEntry } = await import('../dist/index.js');

describe('error-catalog completeness', () => {
  test('every hosted error code exists in specs/kernel/errors.json', () => {
    const missing = [];
    for (const code of HOSTED_ERROR_CODES) {
      if (!kernelCodes.has(code)) {
        missing.push(code);
      }
    }
    assert.deepStrictEqual(
      missing,
      [],
      `Hosted error codes not in kernel: ${missing.join(', ')}. Add them to specs/kernel/errors.json or use an existing kernel code.`
    );
  });

  test('every catalog entry produces valid RFC 9457 Problem Details', () => {
    for (const code of HOSTED_ERROR_CODES) {
      const pd = toProblemDetails(code);
      assert.ok(pd.type.startsWith('https://'), `${code}: type must be HTTPS URI`);
      assert.ok(pd.title, `${code}: title must be non-empty`);
      assert.ok(pd.status >= 400 && pd.status < 600, `${code}: status must be 4xx or 5xx`);
      assert.ok(pd.detail, `${code}: detail must be non-empty`);
      assert.strictEqual(pd.peac_error_code, code, `${code}: peac_error_code must match`);
    }
  });

  test('unknown error code falls back to 500 processing error', () => {
    const pd = toProblemDetails('E_NONEXISTENT_CODE');
    assert.strictEqual(pd.status, 500);
    assert.ok(pd.type.includes('processing-error'));
  });

  test('template interpolation replaces all placeholders', () => {
    const pd = toProblemDetails('E_JWKS_FETCH_FAILED', {
      issuer: 'https://test.example.com',
      reason: 'connection timeout',
    });
    assert.strictEqual(
      pd.detail,
      'Could not resolve JWKS for issuer `https://test.example.com`. connection timeout'
    );
    assert.ok(!pd.detail.includes('{issuer}'), 'unreplaced placeholder');
    assert.ok(!pd.detail.includes('{reason}'), 'unreplaced placeholder');
  });

  test('no hosted error detail contains internal file paths or stack traces', () => {
    for (const code of HOSTED_ERROR_CODES) {
      const pd = toProblemDetails(code);
      assert.ok(!pd.detail.includes('/Users/'), `${code}: detail leaks file path`);
      assert.ok(!pd.detail.includes('node_modules'), `${code}: detail leaks node_modules`);
      assert.ok(!/^\s+at\s/.test(pd.detail), `${code}: detail leaks stack trace`);
    }
  });

  test('every catalog entry has a getCatalogEntry match', () => {
    for (const code of HOSTED_ERROR_CODES) {
      const entry = getCatalogEntry(code);
      assert.ok(entry, `getCatalogEntry('${code}') returned undefined`);
      assert.strictEqual(entry.code, code);
    }
  });
});
