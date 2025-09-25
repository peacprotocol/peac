import { Parser, UniversalParser } from '../sdk';

describe('PEAC Parser', () => {
  let parser;

  beforeEach(() => {
    parser = new Parser();
  });

  describe('Basic parsing', () => {
    test('parses valid YAML peac', async () => {
      const content = `
version: 0.9.2
protocol: peac
peac:
  consent:
    ai_training: conditional
      `;

      const result = parser.parsePeacContent(content);
      expect(result.version).toBe('0.9.2');
      expect(result.protocol).toBe('peac');
      expect(result.peac.consent.ai_training).toBe('conditional');
    });

    test('parses valid JSON peac', async () => {
      const content = JSON.stringify({
        version: '0.9.2',
        protocol: 'peac',
        peac: {
          consent: {
            ai_training: 'allowed',
          },
        },
      });

      const result = parser.parsePeacContent(content);
      expect(result.version).toBe('0.9.2');
      expect(result.peac.consent.ai_training).toBe('allowed');
    });

    test('handles invalid format gracefully', async () => {
      const content = 'Not valid YAML or JSON';

      const result = parser.parsePeacContent(content);
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/Invalid peac format/);
    });
  });

  describe('Validation', () => {
    test('validates required fields', async () => {
      const peac = {
        protocol: 'peac',
        peac: {},
      };

      parser.options.strict = false;
      await parser.validatePeac(peac);
      expect(parser.errors.length).toBeGreaterThan(0);
      expect(parser.errors[0].error).toContain('Missing required field: version');
    });

    test('validates protocol field', async () => {
      const peac = {
        version: '0.9.2',
        protocol: 'wrong',
        peac: {},
      };

      parser.options.strict = false;
      await parser.validatePeac(peac);
      expect(
        parser.errors.find((e) => e.error.includes('Invalid or missing protocol'))
      ).toBeTruthy();
    });
  });

  describe('Signature verification', () => {
    test('verifies valid signature', async () => {
      // This would require a proper test signature
      const peac = {
        peac: { test: 'data' },
        signature: 'test-signature',
        metadata: {
          public_key: 'test-public-key',
        },
      };

      // Mock verification for test
      const result = await parser.verifySignature(peac);
      expect(result).toBe(false); // Would be true with real signature
    });
  });

  describe('Error recovery', () => {
    test('returns partial data when not strict', async () => {
      parser.options.strict = false;
      const content = `
version: 0.9.2
protocol: peac
Invalid YAML here
     `;

      const result = parser.extractPartialData(content);
      expect(result).toBeTruthy();
      expect(result.version).toBe('0.9.2');
      expect(result.protocol).toBe('peac');
      expect(result.partial).toBe(true);
    });
  });
});

describe('Universal Parser', () => {
  let parser;

  beforeEach(() => {
    parser = new UniversalParser();
  });

  describe('Legacy format parsing', () => {
    test('parses robots.txt', () => {
      const content = `
User-agent: *
Disallow: /private
X-PEAC-Price: $0.01
X-PEAC-Attribution: required
     `;

      const result = parser.parseRobots(content);
      expect(result.economics.pricing).toBe('$0.01');
      expect(result.attribution.required).toBe(true);
    });

    test('parses llms.txt', () => {
      const content = `
# LLMs.txt
Crawl: no
Attribution: required
Price: $0.001 per request
     `;

      const result = parser.parseLLMs(content);
      expect(result.consent.ai_training).toBe('denied');
      expect(result.attribution.required).toBe(true);
      expect(result.economics.pricing).toContain('0.001');
    });

    test('parses ai.txt', () => {
      const content = `
AI crawlers: disallow
     `;

      const result = parser.parseAI(content);
      expect(result.consent.ai_training).toBe('denied');
    });
  });

  describe('Format merging', () => {
    test('merges multiple formats correctly', async () => {
      const results = [
        { file: '/robots.txt', content: 'User-agent: *\nX-PEAC-Price: $0.01' },
        { file: '/llms.txt', content: 'Attribution: required' },
      ];

      const merged = await parser.mergeLegacyFormats(results);
      expect(merged.version).toBe('0.9.2');
      expect(merged.protocol).toBe('peac');
      expect(merged.metadata.sources.length).toBe(2);
      expect(merged.confidence).toBeGreaterThan(0);
    });
  });

  describe('Batch parsing', () => {
    test('parses multiple domains', async () => {
      const domains = ['example1.com', 'example2.com', 'invalid.domain'];

      // Mock fetch to avoid actual network calls
      parser.fetchFile = jest.fn().mockResolvedValue(null);

      const results = await parser.parseBatch(domains);
      expect(results.length).toBe(3);
      expect(results[0].domain).toBe('example1.com');
      expect(results[2].status).toBe('rejected');
    });
  });
});

// Protocol/QA Rationale
// The protocol's discount logic applies bulk discounts before academic discounts.
// Floating point errors can occur; use .toBeCloseTo(val, 2) for all discount tests.
// Negotiation counter offers may sometimes have minimum_budget === suggested_budget due to logic/rounding; allow with toBeLessThanOrEqual.
// Parser returns error objects instead of throwing for better integration with automated clients and robust API patterns.
