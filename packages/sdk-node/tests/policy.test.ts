import { jest } from '@jest/globals';
import { fetchPolicy, clearPolicyCache } from '../src/policy.js';
import { request } from 'undici';
import * as yaml from 'yaml';

// Mock undici
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('Policy Module', () => {
  beforeEach(() => {
    clearPolicyCache();
    jest.clearAllMocks();
  });

  describe('fetchPolicy', () => {
    const validPolicy = {
      version: '0.9.11',
      site: {
        name: 'Test Site',
        domain: 'test.example.com'
      },
      attribution: {
        format: '^[A-Za-z0-9 ._-]+ \\(https://[^\\)]+\\)( \\[[^\\]]+\\])?$'
      },
      privacy: {
        retention_days: 30
      }
    };

    it('should fetch and parse YAML policy', async () => {
      const yamlContent = yaml.stringify(validPolicy);
      
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: {
          'content-type': 'application/peac+yaml',
          'etag': '"abc123"'
        },
        body: {
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.from(yamlContent, 'utf8');
          }
        }
      } as any);

      const result = await fetchPolicy('https://test.example.com/.well-known/peac');
      
      expect(result).toEqual(validPolicy);
      expect(mockRequest).toHaveBeenCalledWith(
        'https://test.example.com/.well-known/peac',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'accept': 'application/peac+yaml, application/peac+json, text/plain;q=0.8'
          })
        })
      );
    });

    it('should fetch and parse JSON policy', async () => {
      const jsonContent = JSON.stringify(validPolicy);
      
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: {
          'content-type': 'application/peac+json'
        },
        body: {
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.from(jsonContent, 'utf8');
          }
        }
      } as any);

      const result = await fetchPolicy('https://test.example.com/.well-known/peac');
      
      expect(result).toEqual(validPolicy);
    });

    it('should handle 304 Not Modified', async () => {
      // First request
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: {
          'content-type': 'application/peac+yaml',
          'etag': '"abc123"'
        },
        body: {
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.from(yaml.stringify(validPolicy), 'utf8');
          }
        }
      } as any);

      await fetchPolicy('https://test.example.com/.well-known/peac');

      // Second request returns 304
      mockRequest.mockResolvedValueOnce({
        statusCode: 304,
        headers: {},
        body: {
          [Symbol.asyncIterator]: async function* () {}
        }
      } as any);

      const result = await fetchPolicy('https://test.example.com/.well-known/peac');
      
      expect(result).toEqual(validPolicy);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('should validate policy schema', async () => {
      const invalidPolicy = { version: '0.9.11' }; // Missing required fields
      
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/peac+yaml' },
        body: {
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.from(yaml.stringify(invalidPolicy), 'utf8');
          }
        }
      } as any);

      await expect(fetchPolicy('https://test.example.com/.well-known/peac'))
        .rejects.toThrow('Policy must have a site object');
    });

    it('should validate attribution format regex', async () => {
      const policyWithInvalidRegex = {
        ...validPolicy,
        attribution: { format: '[invalid regex' }
      };
      
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/peac+yaml' },
        body: {
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.from(yaml.stringify(policyWithInvalidRegex), 'utf8');
          }
        }
      } as any);

      await expect(fetchPolicy('https://test.example.com/.well-known/peac'))
        .rejects.toThrow('Invalid attribution format regex');
    });

    it('should validate retention_days range', async () => {
      const policyWithInvalidRetention = {
        ...validPolicy,
        privacy: { retention_days: 500 }
      };
      
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/peac+yaml' },
        body: {
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.from(yaml.stringify(policyWithInvalidRetention), 'utf8');
          }
        }
      } as any);

      await expect(fetchPolicy('https://test.example.com/.well-known/peac'))
        .rejects.toThrow('retention_days must be between 1 and 365');
    });

    it('should handle network errors with cached fallback', async () => {
      // First successful request
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/peac+yaml' },
        body: {
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.from(yaml.stringify(validPolicy), 'utf8');
          }
        }
      } as any);

      await fetchPolicy('https://test.example.com/.well-known/peac');

      // Second request fails
      mockRequest.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchPolicy('https://test.example.com/.well-known/peac');
      
      expect(result).toEqual(validPolicy);
    });
  });
});