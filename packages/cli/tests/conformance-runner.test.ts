/**
 * Conformance Runner Self-Tests
 *
 * These tests verify that the conformance runner correctly enforces
 * manifest-based reason checking. A "correct failure" should pass,
 * but a "wrong failure" (different error code) should fail.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  runConformance,
  zodPathToJsonPointer,
  type ConformanceReport,
} from '../src/lib/conformance-runner';

const TEST_FIXTURES_DIR = join(__dirname, '..', '.test-fixtures');

describe('Conformance Runner', () => {
  beforeAll(() => {
    // Create test fixtures directory
    if (existsSync(TEST_FIXTURES_DIR)) {
      rmSync(TEST_FIXTURES_DIR, { recursive: true });
    }
    mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up test fixtures
    if (existsSync(TEST_FIXTURES_DIR)) {
      rmSync(TEST_FIXTURES_DIR, { recursive: true });
    }
  });

  describe('zodPathToJsonPointer', () => {
    it('should convert empty path to empty string', () => {
      expect(zodPathToJsonPointer([])).toBe('');
    });

    it('should convert simple path', () => {
      expect(zodPathToJsonPointer(['auth', 'iat'])).toBe('/auth/iat');
    });

    it('should convert path with array index', () => {
      expect(zodPathToJsonPointer(['evidence', 'attestations', 0, 'issued_at'])).toBe(
        '/evidence/attestations/0/issued_at'
      );
    });

    it('should escape tilde per RFC 6901', () => {
      expect(zodPathToJsonPointer(['field~name'])).toBe('/field~0name');
    });

    it('should escape slash per RFC 6901', () => {
      expect(zodPathToJsonPointer(['field/name'])).toBe('/field~1name');
    });

    it('should handle combined escapes', () => {
      expect(zodPathToJsonPointer(['a~b/c'])).toBe('/a~0b~1c');
    });
  });

  describe('Manifest Reason Checking', () => {
    it('should pass when correct failure matches expected error code', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'test-invalid');
      mkdirSync(categoryDir, { recursive: true });

      // Create manifest with expected error code
      // When iss is wrong type, the error is E_INVALID_ISSUER (path-based mapping)
      const manifest = {
        'test-invalid': {
          'wrong-type.json': {
            description: 'Wrong type for issuer field',
            expected_error_code: 'E_INVALID_ISSUER',
          },
        },
      };
      writeFileSync(join(TEST_FIXTURES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Create fixture that will fail with E_INVALID_ISSUER
      const fixture = {
        payload: {
          iss: 123, // Wrong type - should be string, mapped to E_INVALID_ISSUER
          aud: 'https://example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'wrong-type.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'test-invalid',
      });

      const testResult = report.results.find((r) => r.id === 'test-invalid.wrong-type');
      expect(testResult).toBeDefined();
      // Both should be invalid, and error codes should match
      expect(testResult?.expected?.valid).toBe(false);
      expect(testResult?.observed?.valid).toBe(false);
      // When expected and observed are both invalid with matching error codes, status should be pass
      expect(testResult?.status).toBe('pass');
      expect(testResult?.observed?.error_code).toBe('E_INVALID_ISSUER');
    });

    it('should fail when wrong failure does not match expected error code', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'test-mismatch');
      mkdirSync(categoryDir, { recursive: true });

      // Create manifest expecting a DIFFERENT error code than what will be produced
      const manifest = {
        'test-mismatch': {
          'wrong-expected.json': {
            description: 'Expecting wrong error code',
            expected_error_code: 'E_INVALID_RID', // Expecting RID error
          },
        },
      };
      writeFileSync(join(TEST_FIXTURES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Create fixture that will fail with E_INVALID_ISSUER (not RID)
      const fixture = {
        payload: {
          iss: 123, // Wrong type - will produce E_INVALID_ISSUER or E_INVALID_FORMAT
          aud: 'https://example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'wrong-expected.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'test-mismatch',
      });

      // The test should FAIL because observed error doesn't match expected
      const testResult = report.results.find((r) => r.id === 'test-mismatch.wrong-expected');
      expect(testResult).toBeDefined();
      expect(testResult?.status).toBe('fail');
      expect(testResult?.expected?.error_code).toBe('E_INVALID_RID');
      expect(testResult?.observed?.error_code).not.toBe('E_INVALID_RID');
    });

    it('should use manifest expected_keyword to derive error code', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'test-keyword');
      mkdirSync(categoryDir, { recursive: true });

      // Create manifest with expected_keyword (not expected_error_code)
      const manifest = {
        'test-keyword': {
          'missing-field.json': {
            description: 'Missing required field',
            expected_keyword: 'required', // Will become E_REQUIRED
          },
        },
      };
      writeFileSync(join(TEST_FIXTURES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Create fixture missing a required field
      const fixture = {
        payload: {
          // Missing 'iss' field
          aud: 'https://example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'missing-field.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'test-keyword',
      });

      // Check that expected_keyword was converted to E_REQUIRED
      const testResult = report.results.find((r) => r.id === 'test-keyword.missing-field');
      expect(testResult).toBeDefined();
      expect(testResult?.expected?.error_code).toBe('E_REQUIRED');
    });

    it('should fail when expected_path does not match observed path', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'test-path');
      mkdirSync(categoryDir, { recursive: true });

      // Create manifest expecting a DIFFERENT path than what will be produced
      const manifest = {
        'test-path': {
          'wrong-path.json': {
            description: 'Expecting wrong path',
            expected_path: '/aud', // Expecting aud path, but error will be on /iss
            expected_keyword: 'type',
          },
        },
      };
      writeFileSync(join(TEST_FIXTURES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Create fixture that will fail at /iss (not /aud)
      const fixture = {
        payload: {
          iss: 123, // Wrong type - error will be at /iss
          aud: 'https://example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'wrong-path.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'test-path',
      });

      // The test should FAIL because observed path doesn't match expected
      const testResult = report.results.find((r) => r.id === 'test-path.wrong-path');
      expect(testResult).toBeDefined();
      expect(testResult?.status).toBe('fail');
      expect(testResult?.expected?.error_path).toBe('/aud');
      expect(testResult?.observed?.error_path).toBe('/iss');
    });

    it('should fail when expected_keyword does not match observed keyword', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'test-kw-mismatch');
      mkdirSync(categoryDir, { recursive: true });

      // Create manifest expecting a DIFFERENT keyword than what will be produced
      const manifest = {
        'test-kw-mismatch': {
          'wrong-keyword.json': {
            description: 'Expecting wrong keyword',
            expected_path: '/iss',
            expected_keyword: 'format', // Expecting format, but error will be 'type'
          },
        },
      };
      writeFileSync(join(TEST_FIXTURES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Create fixture that will fail with 'type' keyword (not 'format')
      const fixture = {
        payload: {
          iss: 123, // Wrong type - keyword will be 'type', not 'format'
          aud: 'https://example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'wrong-keyword.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'test-kw-mismatch',
      });

      // The test should FAIL because observed keyword doesn't match expected
      const testResult = report.results.find((r) => r.id === 'test-kw-mismatch.wrong-keyword');
      expect(testResult).toBeDefined();
      expect(testResult?.status).toBe('fail');
      expect(testResult?.expected?.error_keyword).toBe('format');
      expect(testResult?.observed?.error_keyword).toBe('type');
    });

    it('should expose observed path and keyword in report', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'test-expose');
      mkdirSync(categoryDir, { recursive: true });

      // Create manifest with correct expectations (including error_code)
      const manifest = {
        'test-expose': {
          'expose-details.json': {
            description: 'Test that path and keyword are exposed',
            expected_error_code: 'E_INVALID_ISSUER', // Path-based error code for /iss
            expected_path: '/iss',
            expected_keyword: 'type',
          },
        },
      };
      writeFileSync(join(TEST_FIXTURES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Create fixture
      const fixture = {
        payload: {
          iss: 123, // Wrong type
          aud: 'https://example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'expose-details.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'test-expose',
      });

      // Check that path and keyword are exposed in observed
      const testResult = report.results.find((r) => r.id === 'test-expose.expose-details');
      expect(testResult).toBeDefined();
      expect(testResult?.observed?.error_path).toBe('/iss');
      expect(testResult?.observed?.error_keyword).toBe('type');
      expect(testResult?.status).toBe('pass'); // Should pass since expectations match
    });
  });

  describe('Report Capabilities', () => {
    it('should include capabilities with level and validator info', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'valid');
      mkdirSync(categoryDir, { recursive: true });

      // Create a minimal valid fixture
      const fixture = {
        payload: {
          iss: 'https://example.com',
          aud: 'https://api.example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'minimal.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'valid',
      });

      // Check capabilities are present
      expect(report.suite.capabilities).toBeDefined();
      expect(report.suite.capabilities?.length).toBeGreaterThan(0);

      // Check capability structure
      const capability = report.suite.capabilities?.[0];
      expect(capability).toHaveProperty('profile');
      expect(capability).toHaveProperty('level');
      expect(capability).toHaveProperty('validator');
      expect(['shape', 'semantic']).toContain(capability?.level);
    });

    it('should mark bundle and x402 as shape-only', () => {
      // Set up test fixtures
      const bundleDir = join(TEST_FIXTURES_DIR, 'bundle');
      const x402Dir = join(TEST_FIXTURES_DIR, 'x402');
      mkdirSync(bundleDir, { recursive: true });
      mkdirSync(x402Dir, { recursive: true });

      // Create minimal bundle fixture
      writeFileSync(
        join(bundleDir, 'test.json'),
        JSON.stringify({ version: '0.1', entries: [] }, null, 2)
      );

      // Create minimal x402 fixture
      writeFileSync(
        join(x402Dir, 'test.json'),
        JSON.stringify({ accepts: [{ amount: '100', currency: 'USD' }] }, null, 2)
      );

      // Run conformance for both
      const bundleReport = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'bundle',
      });

      const x402Report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'x402',
      });

      // Check bundle is shape-only
      const bundleCap = bundleReport.suite.capabilities?.find((c) => c.profile.includes('bundle'));
      expect(bundleCap?.level).toBe('shape');
      expect(bundleCap?.profile).toBe('bundle.shape');

      // Check x402 is shape-only
      const x402Cap = x402Report.suite.capabilities?.find((c) => c.profile.includes('x402'));
      expect(x402Cap?.level).toBe('shape');
      expect(x402Cap?.profile).toBe('transport.x402.shape');
    });
  });

  describe('Report Meta Fields', () => {
    it('should include generated_at, duration_ms, and runner in meta', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'meta-test');
      mkdirSync(categoryDir, { recursive: true });

      // Create a minimal valid fixture
      const fixture = {
        payload: {
          iss: 'https://example.com',
          aud: 'https://api.example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'minimal.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'meta-test',
      });

      // Check meta fields are present
      expect(report.meta).toBeDefined();
      expect(report.meta?.generated_at).toBeDefined();
      expect(report.meta?.duration_ms).toBeDefined();
      expect(report.meta?.runner).toBeDefined();

      // Check meta field values
      expect(typeof report.meta?.generated_at).toBe('string');
      expect(new Date(report.meta!.generated_at!).getTime()).toBeGreaterThan(0);
      expect(typeof report.meta?.duration_ms).toBe('number');
      expect(report.meta?.duration_ms).toBeGreaterThanOrEqual(0);
      expect(report.meta?.runner?.name).toBe('@peac/cli');
    });
  });

  describe('Input Digest', () => {
    it('should use sha-256+jcs for JCS-canonicalized inputs', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'digest-test');
      mkdirSync(categoryDir, { recursive: true });

      // Create fixture with payload
      const fixture = {
        payload: {
          iss: 'https://example.com',
          aud: 'https://api.example.com',
          iat: 1234567890,
          rid: 'test-001',
        },
      };
      writeFileSync(join(categoryDir, 'with-payload.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'digest-test',
      });

      // Check digest algorithm
      const testResult = report.results.find((r) => r.id === 'digest-test.with-payload');
      expect(testResult?.diagnostics?.input_digest?.alg).toMatch(/^sha-256\+jcs/);
    });

    it('should use sha-256 for raw file hash when no payload', () => {
      // Set up test fixtures
      const categoryDir = join(TEST_FIXTURES_DIR, 'digest-raw');
      mkdirSync(categoryDir, { recursive: true });

      // Create fixture WITHOUT payload field
      const fixture = {
        iss: 'https://example.com',
        aud: 'https://api.example.com',
        iat: 1234567890,
        rid: 'test-001',
      };
      writeFileSync(join(categoryDir, 'no-payload.json'), JSON.stringify(fixture, null, 2));

      // Run conformance
      const report = runConformance({
        fixturesDir: TEST_FIXTURES_DIR,
        level: 'basic',
        category: 'digest-raw',
      });

      // Check digest algorithm is plain sha-256 (not +jcs)
      const testResult = report.results.find((r) => r.id === 'digest-raw.no-payload');
      expect(testResult?.diagnostics?.input_digest?.alg).toBe('sha-256');
    });
  });
});
