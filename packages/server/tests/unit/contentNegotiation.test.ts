import { contentNegotiation } from '../../src/http/middleware/content-negotiation';
import { Request } from 'express';

describe('Content Negotiation', () => {
  describe('parseMediaType', () => {
    it('should parse vendor media types correctly', () => {
      const mt = contentNegotiation.parseMediaType(
        'application/vnd.peac.capabilities+json;version=0.9.10',
      );
      expect(mt).toEqual({
        type: 'application',
        subtype: 'capabilities',
        vendor: 'peac',
        version: '0.9.10',
        parameters: { version: '0.9.10' },
        quality: 1.0,
      });
    });

    it('should parse quality values', () => {
      const mt = contentNegotiation.parseMediaType('application/json;q=0.8');
      expect(mt?.quality).toBe(0.8);
    });
  });

  describe('negotiate', () => {
    it('should match exact media types', () => {
      const req = {
        get: (name: string) =>
          name === 'Accept' ? 'application/vnd.peac.capabilities+json;version=0.9.10' : undefined,
      } as Request;

      const result = contentNegotiation.negotiate(req, [
        'application/vnd.peac.capabilities+json;version=0.9.10',
      ]);

      expect(result).toBe('application/vnd.peac.capabilities+json;version=0.9.10');
    });

    it('should handle wildcards', () => {
      const req = {
        get: (name: string) => (name === 'Accept' ? '*/*' : undefined),
      } as Request;

      const result = contentNegotiation.negotiate(req, ['application/json']);
      expect(result).toBe('application/json');
    });

    it('should return null for no match', () => {
      const req = {
        get: (name: string) => (name === 'Accept' ? 'text/plain' : undefined),
      } as Request;

      const result = contentNegotiation.negotiate(req, ['application/json']);
      expect(result).toBeNull();
    });
  });
});
