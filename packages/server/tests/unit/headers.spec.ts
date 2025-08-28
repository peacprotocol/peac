import { readAttribution, detectWebBotAuthHint } from '../../src/http/headers';

describe('Headers utilities', () => {
  describe('readAttribution', () => {
    it('should read canonical x-peac-attribution header', () => {
      const headers = { 'x-peac-attribution': 'TestAgent (https://example.com) [test]' };
      expect(readAttribution(headers)).toBe('TestAgent (https://example.com) [test]');
    });

    it('should read peac-attribution alias header', () => {
      const headers = { 'peac-attribution': 'TestAgent (https://example.com) [test]' };
      expect(readAttribution(headers)).toBe('TestAgent (https://example.com) [test]');
    });

    it('should prefer canonical header over alias', () => {
      const headers = {
        'x-peac-attribution': 'CanonicalAgent (https://canonical.com) [test]',
        'peac-attribution': 'AliasAgent (https://alias.com) [test]',
      };
      expect(readAttribution(headers)).toBe('CanonicalAgent (https://canonical.com) [test]');
    });

    it('should handle array headers', () => {
      const headers = { 'x-peac-attribution': ['First', 'Second'] };
      expect(readAttribution(headers)).toBe('First');
    });

    it('should return null when no attribution header present', () => {
      const headers = {};
      expect(readAttribution(headers)).toBeNull();
    });
  });

  describe('detectWebBotAuthHint', () => {
    it('should detect Web Bot Auth headers', () => {
      const headers = {
        signature: 'sig1=:test:',
        'signature-input': 'sig1=();created=123',
        'signature-agent': '"TestBot/1.0"',
      };

      const result = detectWebBotAuthHint(headers);
      expect(result.hasSignature).toBe(true);
      expect(result.signatureAgent).toBe('"TestBot/1.0"');
    });

    it('should return false when signature headers missing', () => {
      const headers = { 'signature-agent': '"TestBot/1.0"' };

      const result = detectWebBotAuthHint(headers);
      expect(result.hasSignature).toBe(false);
      expect(result.signatureAgent).toBe('"TestBot/1.0"');
    });

    it('should handle array signature-agent header', () => {
      const headers = {
        signature: 'sig1=:test:',
        'signature-input': 'sig1=();created=123',
        'signature-agent': ['"TestBot/1.0"', '"Other/2.0"'],
      };

      const result = detectWebBotAuthHint(headers);
      expect(result.hasSignature).toBe(true);
      expect(result.signatureAgent).toBe('"TestBot/1.0"');
    });

    it('should return false when no headers present', () => {
      const headers = {};

      const result = detectWebBotAuthHint(headers);
      expect(result.hasSignature).toBe(false);
      expect(result.signatureAgent).toBeUndefined();
    });
  });
});
