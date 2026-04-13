import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '../../src');
const pkgPath = resolve(__dirname, '../../package.json');

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('vendor-isolation guards', () => {
  it('source files must not import any vendor runtime SDK', () => {
    const sourceFiles = collectTsFiles(srcDir);
    const vendorPatterns = [
      /from\s+['"]@?agentmesh/,
      /from\s+['"]agent-os/,
      /from\s+['"]@microsoft/,
      /from\s+['"]@azure/,
      /require\(['"]@?agentmesh/,
      /require\(['"]@microsoft/,
      /require\(['"]@azure/,
    ];

    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of vendorPatterns) {
        expect(content, `${file} imports vendor SDK: ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('package.json dependencies must only contain allowed packages', () => {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    const allowed = ['@peac/crypto', '@peac/protocol'];

    for (const dep of deps) {
      expect(allowed, `unexpected dependency: ${dep}`).toContain(dep);
    }
  });

  it('publish manifest accounts for this package in packages[] and pendingTrustedPublishing[]', () => {
    const manifestPath = resolve(__dirname, '../../../../../scripts/publish-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const pkgName = '@peac/adapter-runtime-governance';

    expect(manifest.packages, 'missing from packages[]').toContain(pkgName);

    const inOidc = (manifest.oidcConfigured || []).includes(pkgName);
    const inPending = (manifest.pendingTrustedPublishing || []).includes(pkgName);
    const inDeferred = (manifest.deferredTrustedPublishing || []).includes(pkgName);
    expect(
      inOidc || inPending || inDeferred,
      'must be in oidcConfigured[], pendingTrustedPublishing[], or deferredTrustedPublishing[]'
    ).toBe(true);
  });
});
