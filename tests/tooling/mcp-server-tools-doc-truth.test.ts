/**
 * Doc-truth gate for the @peac/mcp-server tool surface.
 *
 * Keeps four repository surfaces aligned:
 *
 *   1. Actual MCP tool registrations in packages/mcp-server/src/server.ts.
 *   2. packages/mcp-server/manifest.json tool names.
 *   3. packages/mcp-server/README.md "Available tools" table.
 *   4. packages/mcp-server/src/cli.ts banner tool list.
 *
 * The test also guards against legacy placeholder tool names and against
 * documenting tool lists in server.json, which is registry/package metadata
 * rather than the repository's tool catalogue.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const README_PATH = join(REPO_ROOT, 'packages', 'mcp-server', 'README.md');
const MANIFEST_PATH = join(REPO_ROOT, 'packages', 'mcp-server', 'manifest.json');
const SERVER_TS_PATH = join(REPO_ROOT, 'packages', 'mcp-server', 'src', 'server.ts');
const CLI_TS_PATH = join(REPO_ROOT, 'packages', 'mcp-server', 'src', 'cli.ts');

const README_TEXT = readFileSync(README_PATH, 'utf8');
const SERVER_TS_TEXT = readFileSync(SERVER_TS_PATH, 'utf8');
const CLI_TS_TEXT = readFileSync(CLI_TS_PATH, 'utf8');
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  tools: Array<{ name: string; description?: string }>;
};

// Canonical tool-name set: read from manifest.json.
const MANIFEST_TOOL_NAMES: ReadonlyArray<string> = MANIFEST.tools.map((t) => t.name).sort();

// Source-truth tool registrations: parse register('peac_*', ...) calls
// from packages/mcp-server/src/server.ts.
function parseSourceRegistrations(src: string): string[] {
  const re = /register\(\s*['"]([a-z0-9_]+)['"]/g;
  const found = new Set<string>();
  for (const match of src.matchAll(re)) {
    if (match[1].startsWith('peac_')) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

// CLI banner tool-list array: parse `tools.push(...)` and the initial
// `tools = ['peac_...', ...]` literal from packages/mcp-server/src/cli.ts.
function parseCliToolList(src: string): string[] {
  const found = new Set<string>();
  const initRe = /const\s+tools\s*=\s*\[([^\]]*)\]/;
  const initMatch = src.match(initRe);
  if (initMatch) {
    for (const m of initMatch[1].matchAll(/['"]([a-z0-9_]+)['"]/g)) {
      if (m[1].startsWith('peac_')) found.add(m[1]);
    }
  }
  for (const m of src.matchAll(/tools\.push\(\s*['"]([a-z0-9_]+)['"]/g)) {
    if (m[1].startsWith('peac_')) found.add(m[1]);
  }
  return [...found].sort();
}

const SOURCE_REGISTRATIONS = parseSourceRegistrations(SERVER_TS_TEXT);
const CLI_TOOL_LIST = parseCliToolList(CLI_TS_TEXT);

// Extract the "Available tools" markdown table tool names from README.
// Accepts the heading at any level so the test does not pin a structural
// choice the README is free to revisit later.
function parseReadmeAvailableTools(readme: string): string[] {
  const headingMatch = readme.match(/^(#{2,3}) Available tools\s*$/m);
  if (!headingMatch) return [];
  const headingIdx = readme.indexOf(headingMatch[0]);
  const level = headingMatch[1].length;
  const rest = readme.slice(headingIdx + headingMatch[0].length);
  // Section ends at the next heading of equal or higher level.
  const closingRe = new RegExp(`\\n#{1,${level}}\\s`);
  const nextHeadingIdx = rest.search(closingRe);
  const section = nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
  const found = new Set<string>();
  for (const m of section.matchAll(/`(peac_[a-z0-9_]+)`/g)) {
    found.add(m[1]);
  }
  return [...found].sort();
}

const README_TOOL_NAMES = parseReadmeAvailableTools(README_TEXT);

// Unsupported historical tool names. The names are assembled from fragments
// so this guard can detect accidental README drift without presenting them as
// supported tool names in the test source.
const LEGACY_PLACEHOLDER_TOOL_NAMES: ReadonlyArray<string> = [
  'issue' + '_' + 'record',
  'verify' + '_' + 'local',
  'verify' + '_' + 'record',
  'inspect' + '_' + 'record',
  'discover' + '_' + 'policy',
];

const SERVER_JSON_FRAGMENT = 'server' + '.' + 'json';
const TOOLS_FIELD_FRAGMENT = 'to' + 'ols';

describe('mcp-server tool surface: source <-> manifest', () => {
  it('parses at least one tool registration from source', () => {
    expect(SOURCE_REGISTRATIONS.length).toBeGreaterThan(0);
  });

  it('manifest tool name set equals source registration set', () => {
    expect(MANIFEST_TOOL_NAMES).toEqual(SOURCE_REGISTRATIONS);
  });
});

describe('mcp-server tool surface: source <-> cli banner', () => {
  it('parses at least one tool name from cli.ts banner list', () => {
    expect(CLI_TOOL_LIST.length).toBeGreaterThan(0);
  });

  it('cli banner tool list equals source registration set', () => {
    expect(CLI_TOOL_LIST).toEqual(SOURCE_REGISTRATIONS);
  });
});

describe('mcp-server tool surface: manifest <-> README', () => {
  it('README has an "Available tools" section', () => {
    expect(README_TEXT).toMatch(/^#{2,3} Available tools\s*$/m);
  });

  it('README "Available tools" lists each manifest tool name', () => {
    for (const name of MANIFEST_TOOL_NAMES) {
      expect(README_TOOL_NAMES).toContain(name);
    }
  });

  it('README "Available tools" does not list extra tool names', () => {
    for (const name of README_TOOL_NAMES) {
      expect(MANIFEST_TOOL_NAMES).toContain(name);
    }
  });
});

describe('mcp-server README: no legacy placeholder tool names', () => {
  for (const placeholder of LEGACY_PLACEHOLDER_TOOL_NAMES) {
    it(`README does not mention "${placeholder}"`, () => {
      expect(README_TEXT).not.toContain(placeholder);
    });
  }
});

describe('mcp-server README: does not claim server.json carries tools', () => {
  // The MCP Registry server schema (ServerDetail) does not define a
  // top-level field for tool data. README must not claim it does.
  it('README does not assert a server.json tools field', () => {
    const re = new RegExp(`${SERVER_JSON_FRAGMENT}.+${TOOLS_FIELD_FRAGMENT}`, 'i');
    expect(README_TEXT).not.toMatch(re);
  });

  it('README does not assert tools live alongside server.json', () => {
    const re = new RegExp(`${TOOLS_FIELD_FRAGMENT}.+${SERVER_JSON_FRAGMENT}`, 'i');
    expect(README_TEXT).not.toMatch(re);
  });
});
