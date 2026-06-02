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

  it('declares both stdio and streamable-http transports', () => {
    const packages = serverJson.packages as Array<Record<string, unknown>>;
    expect(packages).toHaveLength(2);
    for (const pkg of packages) {
      expect(pkg.registryType).toBe('npm');
      expect(pkg.identifier).toBe('@peac/mcp-server');
    }
    const transportTypes = packages.map((p) => (p.transport as Record<string, unknown>).type);
    expect(transportTypes).toContain('stdio');
    expect(transportTypes).toContain('streamable-http');
  });

  it('streamable-http entry declares required url field', () => {
    const packages = serverJson.packages as Array<Record<string, unknown>>;
    const httpEntry = packages.find(
      (p) => (p.transport as Record<string, unknown>).type === 'streamable-http'
    );
    expect(httpEntry).toBeDefined();
    const transport = httpEntry!.transport as Record<string, unknown>;
    expect(typeof transport.url).toBe('string');
    expect(transport.url).toMatch(/^https?:\/\//);
  });

  it('version matches package.json version', () => {
    const pkgJson = readJson('packages/mcp-server/package.json') as Record<string, unknown>;
    expect(serverJson.version).toBe(pkgJson.version);
  });

  it('all package entries match package.json version', () => {
    const pkgJson = readJson('packages/mcp-server/package.json') as Record<string, unknown>;
    const packages = serverJson.packages as Array<Record<string, unknown>>;
    for (const pkg of packages) {
      expect(pkg.version).toBe(pkgJson.version);
    }
  });

  it('mcpName in package.json matches server.json name', () => {
    const pkgJson = readJson('packages/mcp-server/package.json') as Record<string, unknown>;
    expect(pkgJson.mcpName).toBe(serverJson.name);
  });

  it('does not declare a top-level tools field (registry schema does not define one)', () => {
    // The MCP Registry server schema (ServerDetail) defines:
    //   $schema, _meta, description, icons, name, packages, remotes,
    //   repository, title, version, websiteUrl
    // Tool registrations live in manifest.json and the source server,
    // not in server.json. Adding a top-level field here would be a
    // non-schema invention that registry consumers will not surface.
    const TOOLS_FIELD_NAME = ['to', 'ols'].join('');
    expect(serverJson).not.toHaveProperty(TOOLS_FIELD_NAME);
  });
});

// ---------------------------------------------------------------------------
// manifest.json
// ---------------------------------------------------------------------------
describe('manifest.json', () => {
  const manifestJson = readJson('packages/mcp-server/manifest.json') as Record<string, unknown>;
  const pkgJson = readJson('packages/mcp-server/package.json') as Record<string, unknown>;

  it('version matches packages/mcp-server/package.json version', () => {
    expect(manifestJson.version).toBe(pkgJson.version);
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

  it('commandFunction pins @peac/mcp-server to the current package.json version', () => {
    const pkgJson = readJson('packages/mcp-server/package.json') as Record<string, unknown>;
    const startCommand = doc.startCommand as Record<string, unknown>;
    const fn = startCommand.commandFunction as string;
    expect(fn).toContain(`@peac/mcp-server@${pkgJson.version}`);
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

  it('has Integration Surfaces section', () => {
    expect(content).toContain('## Integration Surfaces');
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
