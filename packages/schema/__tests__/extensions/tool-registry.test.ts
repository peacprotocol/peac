/**
 * Tool Registry Extension Tests (v0.11.3+, DD-145)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ToolRegistrySchema,
  TOOL_REGISTRY_EXTENSION_KEY,
  validateToolRegistry,
} from '../../src/extensions/tool-registry';

describe('ToolRegistrySchema', () => {
  it('should accept HTTPS registry URI', () => {
    const tool = {
      tool_id: 'tool:web-search',
      registry_uri: 'https://registry.example.com/tools/web-search',
    };
    expect(ToolRegistrySchema.parse(tool)).toEqual(tool);
  });

  it('should accept URN registry URI', () => {
    const tool = {
      tool_id: 'tool:calculator',
      registry_uri: 'urn:peac:tools:calculator:v1',
    };
    expect(ToolRegistrySchema.parse(tool)).toEqual(tool);
  });

  it('should accept with version and capabilities', () => {
    const tool = {
      tool_id: 'tool:search',
      registry_uri: 'https://registry.example.com/search',
      version: '2.1.0',
      capabilities: ['query', 'filter', 'sort'],
    };
    expect(ToolRegistrySchema.parse(tool)).toEqual(tool);
  });

  it('should reject file:// URI (SSRF prevention)', () => {
    expect(() =>
      ToolRegistrySchema.parse({
        tool_id: 'tool:exploit',
        registry_uri: 'file:///etc/passwd',
      })
    ).toThrow();
  });

  it('should reject data:// URI (SSRF prevention)', () => {
    expect(() =>
      ToolRegistrySchema.parse({
        tool_id: 'tool:exploit',
        registry_uri: 'data:text/plain,malicious',
      })
    ).toThrow();
  });

  it('should reject HTTP (non-HTTPS) URI', () => {
    expect(() =>
      ToolRegistrySchema.parse({
        tool_id: 'tool:insecure',
        registry_uri: 'http://registry.example.com/tools',
      })
    ).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    expect(() =>
      ToolRegistrySchema.parse({
        tool_id: 'tool:test',
        registry_uri: 'https://example.com',
        extra: 'bad',
      })
    ).toThrow();
  });

  it('should have correct extension key', () => {
    expect(TOOL_REGISTRY_EXTENSION_KEY).toBe('org.peacprotocol/tool_registry');
  });
});

describe('validateToolRegistry', () => {
  it('should return ok for valid tool registry', () => {
    const result = validateToolRegistry({
      tool_id: 'tool:test',
      registry_uri: 'https://example.com/tools',
    });
    expect(result.ok).toBe(true);
  });

  it('should return error for invalid tool registry', () => {
    const result = validateToolRegistry({ tool_id: '' });
    expect(result.ok).toBe(false);
  });
});

describe('conformance fixtures', () => {
  const fixtures = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../specs/conformance/fixtures/zero-trust/tool-registry.json'),
      'utf-8'
    )
  );

  for (const fixture of fixtures.valid) {
    it(`valid: ${fixture.name}`, () => {
      expect(ToolRegistrySchema.safeParse(fixture.input).success).toBe(true);
    });
  }

  for (const fixture of fixtures.invalid) {
    it(`invalid: ${fixture.name}`, () => {
      expect(ToolRegistrySchema.safeParse(fixture.input).success).toBe(false);
    });
  }
});
