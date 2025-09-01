import { jest } from '@jest/globals';
import * as fc from 'fast-check';
import { fetchPolicy, clearPolicyCache } from '../src/policy.js';
import { validateAttributionFormat } from '../src/headers.js';
import { request } from 'undici';
import * as yaml from 'yaml';

// Mock undici
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('Policy Property-Based Tests', () => {
  beforeEach(() => {
    clearPolicyCache();
    jest.clearAllMocks();
  });

  describe('Attribution format validation', () => {
    it('should handle valid attribution patterns', () => {
      fc.assert(fc.property(
        fc.record({
          name: fc.stringOf(fc.char().filter(c => /[A-Za-z0-9 ._-]/.test(c)), { minLength: 1, maxLength: 50 }),
          url: fc.constantFrom('https://example.com', 'https://agent.test.com', 'https://bot.example.org'),
          version: fc.option(fc.stringOf(fc.char().filter(c => /[A-Za-z0-9._-]/.test(c)), { maxLength: 20 }))
        }),
        ({ name, url, version }) => {
          const attribution = version 
            ? `${name} (${url}) [${version}]`
            : `${name} (${url})`;
          
          const pattern = '^[A-Za-z0-9 ._-]+ \\(https://[^\\)]+\\)( \\[[^\\]]+\\])?$';
          
          const isValid = validateAttributionFormat(attribution, pattern);
          
          // Should be valid for well-formed attributions
          if (name.trim().length > 0) {
            expect(isValid).toBe(true);
          }
        }
      ));
    });

    it('should reject malformed attribution patterns', () => {
      fc.assert(fc.property(
        fc.record({
          badName: fc.stringOf(fc.char().filter(c => !/[A-Za-z0-9 ._-]/.test(c)), { minLength: 1, maxLength: 10 }),
          url: fc.constantFrom('https://example.com')
        }),
        ({ badName, url }) => {
          const attribution = `${badName} (${url})`;
          const pattern = '^[A-Za-z0-9 ._-]+ \\(https://[^\\)]+\\)( \\[[^\\]]+\\])?$';
          
          const isValid = validateAttributionFormat(attribution, pattern);
          
          // Should be invalid for names with bad characters
          expect(isValid).toBe(false);
        }
      ));
    });

    it('should handle edge cases in regex patterns', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.constant('[invalid'),
          fc.constant('*'),
          fc.constant('(?invalid'),
          fc.constant('\\'),
        ),
        (invalidRegex) => {
          const attribution = 'Test Agent (https://example.com)';
          
          const isValid = validateAttributionFormat(attribution, invalidRegex);
          
          // Invalid regex should return false
          expect(isValid).toBe(false);
        }
      ));
    });
  });

  describe('Policy validation bounds', () => {
    it('should validate retention_days bounds', () => {
      fc.assert(fc.property(
        fc.integer({ min: -100, max: 500 }),
        (retentionDays) => {
          const policy = {
            version: '0.9.11',
            site: {
              name: 'Test Site',
              domain: 'test.example.com'
            },
            privacy: {
              retention_days: retentionDays
            }
          };

          mockRequest.mockResolvedValue({
            statusCode: 200,
            headers: { 'content-type': 'application/peac+yaml' },
            body: {
              [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(yaml.stringify(policy), 'utf8');
              }
            }
          } as any);

          const isValidRange = retentionDays >= 1 && retentionDays <= 365;
          
          if (isValidRange) {
            // Should not throw for valid range
            return expect(fetchPolicy('https://test.example.com/.well-known/peac'))
              .resolves.toMatchObject({ privacy: { retention_days: retentionDays } });
          } else {
            // Should throw for invalid range
            return expect(fetchPolicy('https://test.example.com/.well-known/peac'))
              .rejects.toThrow(/retention_days must be between 1 and 365/);
          }
        }
      ));
    });

    it('should validate max_rows bounds', () => {
      fc.assert(fc.property(
        fc.integer({ min: -1000, max: 2000000 }),
        (maxRows) => {
          const policy = {
            version: '0.9.11',
            site: {
              name: 'Test Site',
              domain: 'test.example.com'
            },
            exports: {
              max_rows: maxRows
            }
          };

          mockRequest.mockResolvedValue({
            statusCode: 200,
            headers: { 'content-type': 'application/peac+yaml' },
            body: {
              [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(yaml.stringify(policy), 'utf8');
              }
            }
          } as any);

          const isValidRange = maxRows >= 1 && maxRows <= 1000000;
          
          if (isValidRange) {
            return expect(fetchPolicy('https://test.example.com/.well-known/peac'))
              .resolves.toMatchObject({ exports: { max_rows: maxRows } });
          } else {
            return expect(fetchPolicy('https://test.example.com/.well-known/peac'))
              .rejects.toThrow(/max_rows must be between 1 and 1,000,000/);
          }
        }
      ));
    });

    it('should validate logging sink formats', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.constant('stdout'),
          fc.constant('https://logs.example.com/peac'),
          fc.constant('http://insecure.com'),
          fc.constant('ftp://bad.com'),
          fc.constant('not-a-url'),
        ),
        (sink) => {
          const policy = {
            version: '0.9.11',
            site: {
              name: 'Test Site',
              domain: 'test.example.com'
            },
            logging: {
              sink
            }
          };

          mockRequest.mockResolvedValue({
            statusCode: 200,
            headers: { 'content-type': 'application/peac+yaml' },
            body: {
              [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(yaml.stringify(policy), 'utf8');
              }
            }
          } as any);

          const isValid = sink === 'stdout' || sink.startsWith('https://');
          
          if (isValid) {
            return expect(fetchPolicy('https://test.example.com/.well-known/peac'))
              .resolves.toMatchObject({ logging: { sink } });
          } else {
            return expect(fetchPolicy('https://test.example.com/.well-known/peac'))
              .rejects.toThrow(/logging sink must be "stdout" or https URL/);
          }
        }
      ));
    });
  });

  describe('Cache behavior properties', () => {
    it('should respect TTL bounds', () => {
      fc.assert(fc.property(
        fc.integer({ min: 0, max: 3600 }),
        async (ttlSec) => {
          const policy = {
            version: '0.9.11',
            site: {
              name: 'Test Site',
              domain: 'test.example.com'
            }
          };

          mockRequest.mockResolvedValue({
            statusCode: 200,
            headers: { 
              'content-type': 'application/peac+yaml',
              'etag': '"test-etag"'
            },
            body: {
              [Symbol.asyncIterator]: async function* () {
                yield Buffer.from(yaml.stringify(policy), 'utf8');
              }
            }
          } as any);

          // First call should fetch
          await fetchPolicy('https://test.example.com/.well-known/peac', { cacheTtlSec: ttlSec });
          expect(mockRequest).toHaveBeenCalledTimes(1);

          // Second call within TTL should use cache or check with ETag
          await fetchPolicy('https://test.example.com/.well-known/peac', { cacheTtlSec: ttlSec });
          
          if (ttlSec > 0) {
            // Should still be only 1 call for non-zero TTL
            expect(mockRequest).toHaveBeenCalledTimes(1);
          }
        }
      ), { timeout: 5000 });
    });
  });
});