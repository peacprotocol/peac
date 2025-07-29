const { Parser } = require('../sdk');

describe('PEAC Parser', () => {
  let parser;

  beforeEach(() => {
    parser = new Parser();
  });

  test('validates domain format', () => {
    expect(() => parser.isValidDomain('example.com')).not.toThrow();
    expect(parser.isValidDomain('https://example.com')).toBe(false);
    expect(parser.isValidDomain('example.com/path')).toBe(false);
  });

  test('parses valid YAML pact', () => {
    const yamlContent = `
version: 0.9.1
protocol: peac
pact:
  consent:
    ai_training: allowed
`;
    const pact = parser.parsePactContent(yamlContent);
    expect(pact.version).toBe('0.9.1');
    expect(pact.protocol).toBe('peac');
  });

  test('parses valid JSON pact', () => {
    const jsonContent = JSON.stringify({
      version: '0.9.1',
      protocol: 'peac',
      pact: {
        consent: {
          ai_training: 'allowed'
        }
      }
    });
    const pact = parser.parsePactContent(jsonContent);
    expect(pact.version).toBe('0.9.1');
  });

  test('validates required fields', () => {
    const invalidPact = { protocol: 'peac' };
    expect(() => parser.validatePact(invalidPact)).toThrow('Missing required field: version');
  });

  test('validates protocol', () => {
    const invalidPact = { version: '0.9.1', protocol: 'wrong', pact: {} };
    expect(() => parser.validatePact(invalidPact)).toThrow('Invalid protocol');
  });
});