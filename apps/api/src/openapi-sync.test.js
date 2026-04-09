import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * OpenAPI contract-sync test.
 *
 * Validates that openapi.yaml contains the expected DD-210 surface
 * by checking structural markers in the raw YAML text. This avoids
 * a YAML parser dependency; if a full schema-level sync is needed
 * later, add the yaml package to devDependencies.
 */
describe('openapi-sync', () => {
  const raw = readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf-8');

  test('openapi.yaml exists and declares OpenAPI 3.1.0', () => {
    assert.ok(raw.includes('openapi: 3.1.0'), 'Must declare openapi: 3.1.0');
  });

  test('POST /v1/verify path is defined', () => {
    assert.ok(raw.includes('/v1/verify:'), 'Must define /v1/verify path');
    assert.ok(raw.includes('operationId: verifyReceipt'), 'Must have operationId: verifyReceipt');
  });

  test('request schema references VerifyRequest with required receipt field', () => {
    assert.ok(raw.includes('VerifyRequest'), 'Must reference VerifyRequest schema');
    assert.ok(raw.includes('required: [receipt]'), 'receipt must be required');
  });

  test('request schema includes policy and options fields', () => {
    assert.ok(raw.includes('policy:'), 'Must include policy field');
    assert.ok(raw.includes('public_key:'), 'Must include public_key field');
    assert.ok(raw.includes('strictness:'), 'Must include strictness option');
  });

  test('success response includes all DD-210 required fields', () => {
    assert.ok(
      raw.includes(
        'required: [verified, receipt_ref, claims, warnings, policy_binding, issuer, kid, wire_version]'
      ),
      'Success response must require all DD-210 fields'
    );
  });

  test('receipt_ref has sha256 pattern', () => {
    assert.ok(raw.includes("'^sha256:[a-f0-9]{64}$'"), 'receipt_ref must have sha256 pattern');
  });

  test('policy_binding enum includes all three states', () => {
    assert.ok(
      raw.includes('enum: [unavailable, verified, failed]'),
      'Must have 3-state policy_binding enum'
    );
  });

  test('error responses define application/problem+json for 400, 413, 422, 429, 502', () => {
    for (const status of ['400', '413', '422', '429', '502']) {
      assert.ok(raw.includes(`'${status}':`), `Must define ${status} response`);
    }
    // Count problem+json occurrences (should be at least 5 for error responses)
    const problemJsonCount = (raw.match(/application\/problem\+json/g) || []).length;
    assert.ok(
      problemJsonCount >= 5,
      `Expected >= 5 problem+json references, got ${problemJsonCount}`
    );
  });

  test('ProblemDetails schema includes peac_error_code as required', () => {
    assert.ok(raw.includes('peac_error_code'), 'Must define peac_error_code field');
    assert.ok(
      raw.includes('required: [type, title, status, detail, peac_error_code]'),
      'peac_error_code must be in ProblemDetails required fields'
    );
  });

  test('RFC 9333 rate limit headers documented on success response', () => {
    assert.ok(raw.includes('RateLimit-Limit'), 'Must document RateLimit-Limit header');
    assert.ok(raw.includes('RateLimit-Remaining'), 'Must document RateLimit-Remaining header');
    assert.ok(raw.includes('RateLimit-Reset'), 'Must document RateLimit-Reset header');
  });
});
