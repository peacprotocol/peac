import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const PACK = resolve(ROOT, 'surfaces/plugin-pack');

function readText(relativePath: string): string {
  return readFileSync(resolve(PACK, relativePath), 'utf8');
}

// ---------------------------------------------------------------------------
// Claude Code SKILL.md
// ---------------------------------------------------------------------------
describe('claude-code SKILL.md', () => {
  const content = readText('claude-code/peac/SKILL.md');

  it('exists at the correct path', () => {
    expect(existsSync(resolve(PACK, 'claude-code/peac/SKILL.md'))).toBe(true);
  });

  it('has an H1 heading', () => {
    expect(content).toMatch(/^# /m);
  });

  it('has verify section', () => {
    expect(content).toContain('## Verify');
  });

  it('has issue section', () => {
    expect(content).toContain('## Issue');
  });

  it('has inspect section', () => {
    expect(content).toContain('## Inspect');
  });

  it('has decode section', () => {
    expect(content).toContain('## Decode');
  });

  it('has bundle section', () => {
    expect(content).toContain('## Create an Evidence Bundle');
  });

  it('has rules section', () => {
    expect(content).toContain('## Rules');
  });

  it('specifies allowed-tools as Bash and Read only', () => {
    expect(content).toMatch(/allowed-tools:\s*\["Bash",\s*"Read"\]/);
  });

  it('does not reference Write tool', () => {
    expect(content).not.toMatch(/\bWrite\b/);
  });

  it('does not reference WebFetch tool', () => {
    expect(content).not.toContain('WebFetch');
  });

  it('does not contain vendor-specific names', () => {
    // No vendor names in skill content (neutrality requirement)
    expect(content).not.toMatch(/\bOpenAI\b/i);
    expect(content).not.toMatch(/\bAnthropic\b/i);
    expect(content).not.toMatch(/\bGoogle\b/i);
  });

  it('references the MCP server package', () => {
    expect(content).toContain('@peac/mcp-server');
  });

  it('references the wire format', () => {
    expect(content).toContain('peac-receipt/0.1');
  });
});

// ---------------------------------------------------------------------------
// Cursor rules peac.mdc
// ---------------------------------------------------------------------------
describe('cursor peac.mdc', () => {
  const content = readText('cursor/peac.mdc');

  it('exists at the correct path', () => {
    expect(existsSync(resolve(PACK, 'cursor/peac.mdc'))).toBe(true);
  });

  it('has YAML frontmatter', () => {
    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/\n---\n/);
  });

  it('has description in frontmatter', () => {
    expect(content).toMatch(/^description:/m);
  });

  it('has globs in frontmatter', () => {
    expect(content).toMatch(/^globs:/m);
  });

  it('globs include TypeScript files', () => {
    expect(content).toContain('**/*.ts');
  });

  it('globs include receipt JSON files', () => {
    expect(content).toContain('**/*.receipt.json');
  });

  it('globs include peac.txt', () => {
    expect(content).toContain('**/peac.txt');
  });

  it('globs include peac-issuer.json', () => {
    expect(content).toContain('**/peac-issuer.json');
  });

  it('documents import patterns', () => {
    expect(content).toContain('@peac/kernel');
    expect(content).toContain('@peac/schema');
    expect(content).toContain('@peac/crypto');
    expect(content).toContain('@peac/protocol');
  });

  it('documents verifyLocal usage', () => {
    expect(content).toContain('verifyLocal');
  });

  it('documents issue usage', () => {
    expect(content).toContain('issue(');
  });

  it('documents assertJsonSafeIterative', () => {
    expect(content).toContain('assertJsonSafeIterative');
  });

  it('documents computeReceiptRef', () => {
    expect(content).toContain('computeReceiptRef');
  });

  it('documents CarrierAdapter pattern', () => {
    expect(content).toContain('CarrierAdapter');
  });

  it('does not reference Write tool', () => {
    // Security: no file write tool references
    expect(content).not.toMatch(/\bWrite\b/);
  });

  it('does not reference WebFetch tool', () => {
    expect(content).not.toContain('WebFetch');
  });

  it('does not contain vendor-specific names', () => {
    expect(content).not.toMatch(/\bOpenAI\b/i);
    expect(content).not.toMatch(/\bAnthropic\b/i);
    expect(content).not.toMatch(/\bGoogle\b/i);
  });
});

// ---------------------------------------------------------------------------
// README
// ---------------------------------------------------------------------------
describe('plugin-pack README', () => {
  const content = readText('README.md');

  it('exists', () => {
    expect(existsSync(resolve(PACK, 'README.md'))).toBe(true);
  });

  it('has setup instructions for Claude Code', () => {
    expect(content).toContain('Claude Code');
  });

  it('has setup instructions for Cursor', () => {
    expect(content).toContain('Cursor');
  });

  it('documents security properties', () => {
    expect(content).toContain('default-deny');
  });
});

// ---------------------------------------------------------------------------
// No package.json (DD-139: distribution surface, not a package)
// ---------------------------------------------------------------------------
describe('plugin-pack structure', () => {
  it('does not have a package.json (not an npm package)', () => {
    expect(existsSync(resolve(PACK, 'package.json'))).toBe(false);
  });
});
