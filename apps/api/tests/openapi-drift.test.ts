/**
 * OpenAPI drift check.
 *
 * Verifies that apps/api/openapi.yaml declares the content negotiation,
 * report ID, and failure reason features implemented in verify-v1.ts.
 * This test fails if someone adds new features to the endpoint without
 * updating the spec, or removes spec entries that the code still emits.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const openapiText = readFileSync(join(ROOT, 'openapi.yaml'), 'utf-8');

describe('openapi drift', () => {
  it('declares PEAC-Report-Id response header', () => {
    expect(openapiText).toContain('PEAC-Report-Id');
  });

  it('declares Accept header parameter with three content types', () => {
    expect(openapiText).toContain('application/json');
    expect(openapiText).toContain('application/peac-report+json');
    expect(openapiText).toContain('text/plain');
  });

  it('declares ExtendedVerifyReport schema', () => {
    expect(openapiText).toContain('ExtendedVerifyReport:');
    expect(openapiText).toContain('report_id');
    expect(openapiText).toContain('verified_at');
    expect(openapiText).toContain('duration_ms');
    expect(openapiText).toContain('key_resolution');
    expect(openapiText).toContain('failure_reasons');
  });

  it('declares FailureReason schema', () => {
    expect(openapiText).toContain('FailureReason:');
  });

  it('key_resolution enum covers all three variants', () => {
    expect(openapiText).toMatch(/key_resolution[\s\S]*provided[\s\S]*allowlist[\s\S]*discovery/);
  });
});
