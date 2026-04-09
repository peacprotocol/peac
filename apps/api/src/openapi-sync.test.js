import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * OpenAPI contract-sync test.
 *
 * Parses openapi.yaml as structured YAML and validates the DD-210
 * surface contract: request/response schemas, error codes, rate limit
 * headers, and required fields. Uses real structural validation via
 * the yaml package, not text-marker checks.
 */
describe('openapi-sync', () => {
  const spec = parseYaml(readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf-8'));

  test('declares OpenAPI 3.1.0', () => {
    assert.strictEqual(spec.openapi, '3.1.0');
  });

  test('POST /v1/verify path exists with operationId', () => {
    assert.ok(spec.paths['/v1/verify'], '/v1/verify path must exist');
    assert.strictEqual(spec.paths['/v1/verify'].post.operationId, 'verifyReceipt');
  });

  test('request schema requires receipt and has all expected fields', () => {
    const ref = spec.paths['/v1/verify'].post.requestBody.content['application/json'].schema;
    const schemaName = ref.$ref?.split('/').pop();
    const reqSchema = schemaName ? spec.components.schemas[schemaName] : ref;

    assert.ok(reqSchema, 'VerifyRequest schema must exist');
    assert.deepStrictEqual(reqSchema.required, ['receipt']);
    assert.ok(reqSchema.properties.receipt, 'receipt field');
    assert.ok(reqSchema.properties.public_key, 'public_key field');
    assert.ok(reqSchema.properties.policy, 'policy field');
    assert.ok(reqSchema.properties.options, 'options field');
    assert.strictEqual(reqSchema.additionalProperties, false, 'strict schema');
  });

  test('success response schema has all DD-210 required fields', () => {
    const ref = spec.paths['/v1/verify'].post.responses['200'].content['application/json'].schema;
    const schemaName = ref.$ref?.split('/').pop();
    const schema = schemaName ? spec.components.schemas[schemaName] : ref;

    const required = schema.required;
    for (const field of [
      'verified',
      'receipt_ref',
      'claims',
      'warnings',
      'policy_binding',
      'issuer',
      'kid',
      'wire_version',
    ]) {
      assert.ok(required.includes(field), `${field} must be required`);
    }
  });

  test('receipt_ref has sha256 pattern constraint', () => {
    const ref = spec.paths['/v1/verify'].post.responses['200'].content['application/json'].schema;
    const schemaName = ref.$ref?.split('/').pop();
    const schema = schemaName ? spec.components.schemas[schemaName] : ref;

    assert.ok(schema.properties.receipt_ref.pattern, 'receipt_ref must have pattern');
    assert.ok(
      schema.properties.receipt_ref.pattern.includes('sha256'),
      'pattern must reference sha256'
    );
  });

  test('policy_binding enum has three states', () => {
    const ref = spec.paths['/v1/verify'].post.responses['200'].content['application/json'].schema;
    const schemaName = ref.$ref?.split('/').pop();
    const schema = schemaName ? spec.components.schemas[schemaName] : ref;

    assert.deepStrictEqual(schema.properties.policy_binding.enum, [
      'unavailable',
      'verified',
      'failed',
    ]);
  });

  test('error responses use application/problem+json for 400, 413, 422, 429, 502', () => {
    const responses = spec.paths['/v1/verify'].post.responses;
    for (const status of ['400', '413', '422', '429', '502']) {
      assert.ok(responses[status], `${status} response must exist`);
      assert.ok(
        responses[status].content['application/problem+json'],
        `${status} must use application/problem+json`
      );
    }
  });

  test('ProblemDetails schema has peac_error_code as required', () => {
    const pd = spec.components.schemas.ProblemDetails;
    assert.ok(pd, 'ProblemDetails schema must exist');
    assert.ok(pd.properties.peac_error_code, 'peac_error_code property must exist');
    assert.ok(pd.required.includes('peac_error_code'), 'peac_error_code must be required');
  });

  test('ProblemDetails has errors array for multi-error responses', () => {
    const pd = spec.components.schemas.ProblemDetails;
    assert.ok(pd.properties.errors, 'errors array must exist');
    assert.strictEqual(pd.properties.errors.type, 'array');
  });

  test('200 response documents RFC 9333 rate limit headers', () => {
    const headers = spec.paths['/v1/verify'].post.responses['200'].headers;
    assert.ok(headers, '200 response must have headers');
    assert.ok(headers['RateLimit-Limit'], 'RateLimit-Limit header');
    assert.ok(headers['RateLimit-Remaining'], 'RateLimit-Remaining header');
    assert.ok(headers['RateLimit-Reset'], 'RateLimit-Reset header');
  });

  test('429 response documents Retry-After header', () => {
    const headers = spec.paths['/v1/verify'].post.responses['429'].headers;
    assert.ok(headers, '429 response must have headers');
    assert.ok(headers['Retry-After'], 'Retry-After header');
  });

  test('options schema includes strictness enum', () => {
    const ref = spec.paths['/v1/verify'].post.requestBody.content['application/json'].schema;
    const schemaName = ref.$ref?.split('/').pop();
    const reqSchema = schemaName ? spec.components.schemas[schemaName] : ref;

    const strictness = reqSchema.properties.options.properties.strictness;
    assert.ok(strictness, 'strictness option must exist');
    assert.deepStrictEqual(strictness.enum, ['strict', 'interop']);
  });
});
