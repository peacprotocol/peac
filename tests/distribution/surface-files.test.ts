import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const ROOT = resolve(__dirname, '../..');

function readJson(relativePath: string): unknown {
  const content = readFileSync(resolve(ROOT, relativePath), 'utf8');
  return JSON.parse(content);
}

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

// ---------------------------------------------------------------------------
// server.json
// ---------------------------------------------------------------------------
describe('server.json', () => {
  const serverJson = readJson('packages/mcp-server/server.json') as Record<string, unknown>;
  const schema = readJson('specs/registry/server.schema.json') as Record<string, unknown>;

  it('validates against the vendored MCP Registry JSON Schema', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const valid = validate(serverJson);
    if (!valid) {
      throw new Error(
        `server.json schema validation failed:\n${JSON.stringify(validate.errors, null, 2)}`
      );
    }
    expect(valid).toBe(true);
  });

  it('has required top-level fields', () => {
    expect(serverJson).toHaveProperty('name');
    expect(serverJson).toHaveProperty('description');
    expect(serverJson).toHaveProperty('version');
    expect(serverJson).toHaveProperty('repository');
    expect(serverJson).toHaveProperty('packages');
  });

  it('name follows reverse-DNS format', () => {
    expect(serverJson.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  });

  it('description is 100 characters or fewer', () => {
    expect(typeof serverJson.description).toBe('string');
    expect((serverJson.description as string).length).toBeLessThanOrEqual(100);
  });

  it('repository points to peacprotocol/peac', () => {
    const repo = serverJson.repository as Record<string, unknown>;
    expect(repo.url).toBe('https://github.com/peacprotocol/peac');
    expect(repo.source).toBe('github');
  });

  it('packages[0] is an npm package with stdio transport', () => {
    const packages = serverJson.packages as Array<Record<string, unknown>>;
    expect(packages).toHaveLength(1);
    expect(packages[0].registryType).toBe('npm');
    expect(packages[0].identifier).toBe('@peac/mcp-server');
    const transport = packages[0].transport as Record<string, unknown>;
    expect(transport.type).toBe('stdio');
  });

  it('version matches package.json version', () => {
    const pkgJson = readJson('packages/mcp-server/package.json') as Record<string, unknown>;
    expect(serverJson.version).toBe(pkgJson.version);
  });

  it('packages[0].version matches package.json version', () => {
    const pkgJson = readJson('packages/mcp-server/package.json') as Record<string, unknown>;
    const packages = serverJson.packages as Array<Record<string, unknown>>;
    expect(packages[0].version).toBe(pkgJson.version);
  });

  it('mcpName in package.json matches server.json name', () => {
    const pkgJson = readJson('packages/mcp-server/package.json') as Record<string, unknown>;
    expect(pkgJson.mcpName).toBe(serverJson.name);
  });
});

// ---------------------------------------------------------------------------
// smithery.yaml
// ---------------------------------------------------------------------------
describe('smithery.yaml', () => {
  const content = readText('packages/mcp-server/smithery.yaml');
  const doc = yaml.load(content) as Record<string, unknown>;

  it('parses as valid YAML', () => {
    expect(doc).toBeDefined();
    expect(typeof doc).toBe('object');
  });

  it('has startCommand with required fields', () => {
    expect(doc).toHaveProperty('startCommand');
    const startCommand = doc.startCommand as Record<string, unknown>;
    expect(startCommand).toHaveProperty('type');
    expect(startCommand).toHaveProperty('commandFunction');
  });

  it('specifies stdio transport type', () => {
    const startCommand = doc.startCommand as Record<string, unknown>;
    expect(startCommand.type).toBe('stdio');
  });

  it('has a configSchema with JSON Schema structure', () => {
    const startCommand = doc.startCommand as Record<string, unknown>;
    expect(startCommand).toHaveProperty('configSchema');
    const configSchema = startCommand.configSchema as Record<string, unknown>;
    expect(configSchema.type).toBe('object');
    expect(configSchema).toHaveProperty('properties');
  });

  it('commandFunction references @peac/mcp-server', () => {
    const startCommand = doc.startCommand as Record<string, unknown>;
    expect(typeof startCommand.commandFunction).toBe('string');
    expect(startCommand.commandFunction as string).toContain('@peac/mcp-server');
  });

  it('commandFunction returns command and args', () => {
    const startCommand = doc.startCommand as Record<string, unknown>;
    const fn = startCommand.commandFunction as string;
    expect(fn).toContain('command');
    expect(fn).toContain('args');
    expect(fn).toContain('npx');
  });

  it('has exampleConfig', () => {
    const startCommand = doc.startCommand as Record<string, unknown>;
    expect(startCommand).toHaveProperty('exampleConfig');
  });
});

// ---------------------------------------------------------------------------
// llms.txt
// ---------------------------------------------------------------------------
describe('llms.txt', () => {
  const content = readText('llms.txt');

  it('starts with an H1 heading', () => {
    expect(content).toMatch(/^# /m);
  });

  it('has a blockquote summary', () => {
    expect(content).toMatch(/^> /m);
  });

  it('has Quick Start section', () => {
    expect(content).toContain('## Quick Start');
  });

  it('has Key Packages section', () => {
    expect(content).toContain('## Key Packages');
  });

  it('has Documentation section', () => {
    expect(content).toContain('## Documentation');
  });

  it('references the GitHub repository', () => {
    expect(content).toContain('https://github.com/peacprotocol/peac');
  });

  it('mentions the MCP server package', () => {
    expect(content).toContain('@peac/mcp-server');
  });

  it('uses peacprotocol.org domain only', () => {
    // Must not reference peac.dev
    expect(content).not.toContain('peac.dev');
  });

  it('has Agent Integration section', () => {
    expect(content).toContain('## Agent Integration');
  });

  it('mentions the wire format', () => {
    expect(content).toContain('peac-receipt/0.1');
  });
});

// ---------------------------------------------------------------------------
// Cross-file consistency
// ---------------------------------------------------------------------------
describe('cross-file consistency', () => {
  it('server.json $schema points to the vendored schema $id', () => {
    const serverJson = readJson('packages/mcp-server/server.json') as Record<string, unknown>;
    const schema = readJson('specs/registry/server.schema.json') as Record<string, unknown>;
    expect(serverJson.$schema).toBe(schema.$id);
  });
});
