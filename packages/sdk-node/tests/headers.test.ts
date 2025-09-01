import { parseHeaders, createHeaders, validateAttributionFormat } from '../src/headers.js';

describe('Headers Module', () => {
  describe('parseHeaders', () => {
    it('should parse standard PEAC headers', () => {
      const headers = {
        'peac-attribution': 'Test Bot (https://example.com)',
        'peac-agreement': 'agr_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        'peac-receipt-kid': 'key_123'
      };

      const result = parseHeaders(headers);

      expect(result).toEqual({
        attribution: 'Test Bot (https://example.com)',
        agreement: 'agr_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        receiptKid: 'key_123'
      });
    });

    it('should handle case-insensitive headers', () => {
      const headers = {
        'PEAC-Attribution': 'Test Bot (https://example.com)',
        'Peac-Agreement': 'agr_01ARZ3NDEKTSV4RRFFQ69G5FAV'
      };

      const result = parseHeaders(headers);

      expect(result.attribution).toBe('Test Bot (https://example.com)');
      expect(result.agreement).toBe('agr_01ARZ3NDEKTSV4RRFFQ69G5FAV');
    });

    it('should handle missing headers gracefully', () => {
      const headers = {
        'content-type': 'application/json'
      };

      const result = parseHeaders(headers);

      expect(result).toEqual({});
    });

    it('should ignore non-PEAC headers', () => {
      const headers = {
        'peac-attribution': 'Test Bot (https://example.com)',
        'authorization': 'Bearer token123',
        'user-agent': 'Test/1.0'
      };

      const result = parseHeaders(headers);

      expect(result).toEqual({
        attribution: 'Test Bot (https://example.com)'
      });
      expect(result).not.toHaveProperty('authorization');
      expect(result).not.toHaveProperty('userAgent');
    });
  });

  describe('createHeaders', () => {
    it('should create standard PEAC headers', () => {
      const options = {
        attribution: 'Test Bot (https://example.com)',
        agreement: 'agr_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        receiptKid: 'key_123'
      };

      const result = createHeaders(options);

      expect(result).toEqual({
        'peac-attribution': 'Test Bot (https://example.com)',
        'peac-agreement': 'agr_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        'peac-receipt-kid': 'key_123'
      });
    });

    it('should only include defined values', () => {
      const options = {
        attribution: 'Test Bot (https://example.com)',
        agreement: undefined,
        receiptKid: null
      };

      const result = createHeaders(options);

      expect(result).toEqual({
        'peac-attribution': 'Test Bot (https://example.com)'
      });
      expect(result).not.toHaveProperty('peac-agreement');
      expect(result).not.toHaveProperty('peac-receipt-kid');
    });

    it('should handle empty options', () => {
      const result = createHeaders({});

      expect(result).toEqual({});
    });
  });

  describe('validateAttributionFormat', () => {
    const standardPattern = '^[A-Za-z0-9 ._-]+ \\\\(https://[^\\\\)]+\\\\)( \\\\[[^\\\\]]+\\\\])?$';

    it('should validate correct attribution format', () => {
      const validAttributions = [
        'Test Bot (https://example.com)',
        'My Agent (https://test.example.com) [v1.0.0]',
        'Bot_Name (https://site.com)',
        'Agent-v2 (https://example.org) [beta]'
      ];

      validAttributions.forEach(attribution => {
        expect(validateAttributionFormat(attribution, standardPattern)).toBe(true);
      });
    });

    it('should reject invalid attribution format', () => {
      const invalidAttributions = [
        'Invalid@Bot (https://example.com)', // Invalid character @
        'Bot (http://example.com)', // Non-HTTPS URL
        'Bot https://example.com', // Missing parentheses
        'Bot (https://example.com) extra', // Extra content after
        'Bot (https://example.com) [version] extra' // Extra content after version
      ];

      invalidAttributions.forEach(attribution => {
        expect(validateAttributionFormat(attribution, standardPattern)).toBe(false);
      });
    });

    it('should handle invalid regex patterns', () => {
      const invalidPatterns = [
        '[invalid',
        '*',
        '(?invalid',
        '\\\\'
      ];

      invalidPatterns.forEach(pattern => {
        expect(validateAttributionFormat('Test (https://example.com)', pattern)).toBe(false);
      });
    });

    it('should handle empty inputs', () => {
      expect(validateAttributionFormat('', standardPattern)).toBe(false);
      expect(validateAttributionFormat('Test (https://example.com)', '')).toBe(false);
    });
  });
});