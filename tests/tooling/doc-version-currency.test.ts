/**
 * Tests for scripts/verify-doc-version-currency.mjs.
 *
 * The gate checks enumerated version-bearing SOURCE sites (the
 * @peac/telemetry-otel package-version source and the smithery.yaml
 * mcp-server pin) against docs/releases/current.json, plus an anti-drift
 * guard that the telemetry provider does not reintroduce a hardcoded
 * version literal. It is intentionally narrow and does NOT cover markdown
 * version banners; those are gated by
 * tests/tooling/docs-version-banner-truth.test.ts, so this suite does not
 * duplicate them.
 *
 * Two layers:
 *   - checkSite / checkForbidden unit cases (pure, synthetic content).
 *   - CLI smoke cases driving the script against a synthetic tree via
 *     --root, so the live repo files are not required to be at any
 *     particular version for the test to be deterministic.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  checkSite,
  checkForbidden,
  SITES,
  FORBIDDEN,
} from '../../scripts/verify-doc-version-currency.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'verify-doc-version-currency.mjs');

const TELEMETRY_SITE = SITES.find((s: { label: string }) => s.label === 'TELEMETRY_OTEL_VERSION');
const SMITHERY_SITE = SITES.find((s: { label: string }) => s.label === 'smithery mcp-server pin');
const PROVIDER_GUARD = FORBIDDEN.find((g: { label: string }) => g.label.startsWith('provider.ts'));

describe('checkSite', () => {
  it('passes when the version matches', () => {
    const r = checkSite(
      "export const TELEMETRY_OTEL_VERSION = '0.15.0';",
      TELEMETRY_SITE.pattern,
      '0.15.0'
    );
    expect(r.ok).toBe(true);
    expect(r.value).toBe('0.15.0');
  });

  it('fails when the version is stale', () => {
    const r = checkSite(
      "export const TELEMETRY_OTEL_VERSION = '0.9.22';",
      TELEMETRY_SITE.pattern,
      '0.15.0'
    );
    expect(r.ok).toBe(false);
    expect(r.value).toBe('0.9.22');
    expect(r.reason).toContain('expected 0.15.0');
  });

  it('fails when the pattern is not found', () => {
    const r = checkSite('export const SOMETHING_ELSE = 1;', TELEMETRY_SITE.pattern, '0.15.0');
    expect(r.ok).toBe(false);
    expect(r.value).toBeNull();
    expect(r.reason).toContain('not found');
  });

  it('matches the smithery mcp-server pin pattern', () => {
    const r = checkSite(
      "const args = ['-y', '@peac/mcp-server@0.15.0'];",
      SMITHERY_SITE.pattern,
      '0.15.0'
    );
    expect(r.ok).toBe(true);
    expect(r.value).toBe('0.15.0');
  });
});

describe('checkForbidden', () => {
  it('fails when a hardcoded version literal is present', () => {
    const r = checkForbidden("const TELEMETRY_VERSION = '0.9.22';", PROVIDER_GUARD.pattern);
    expect(r.ok).toBe(false);
  });

  it('passes when the version is derived from the single source', () => {
    const r = checkForbidden(
      'const TELEMETRY_VERSION = TELEMETRY_OTEL_VERSION;',
      PROVIDER_GUARD.pattern
    );
    expect(r.ok).toBe(true);
  });
});

describe('verify-doc-version-currency CLI', () => {
  let root: string;

  function writeTree(opts: {
    current: string;
    version?: string;
    smithery?: string;
    versionConst?: boolean;
    providerHardcoded?: boolean;
  }) {
    const dir = mkdtempSync(join(tmpdir(), 'peac-doc-currency-'));
    mkdirSync(join(dir, 'docs', 'releases'), { recursive: true });
    mkdirSync(join(dir, 'packages', 'telemetry-otel', 'src'), { recursive: true });
    mkdirSync(join(dir, 'packages', 'mcp-server'), { recursive: true });
    writeFileSync(
      join(dir, 'docs', 'releases', 'current.json'),
      JSON.stringify({ version: opts.current })
    );
    const versionTs =
      opts.versionConst === false
        ? ''
        : `export const TELEMETRY_OTEL_VERSION = '${opts.version ?? opts.current}';\n`;
    writeFileSync(join(dir, 'packages', 'telemetry-otel', 'src', 'version.ts'), versionTs);
    const providerTs = opts.providerHardcoded
      ? "const TELEMETRY_VERSION = '0.0.1';\n"
      : "import { TELEMETRY_OTEL_VERSION } from './version.js';\nconst TELEMETRY_VERSION = TELEMETRY_OTEL_VERSION;\n";
    writeFileSync(join(dir, 'packages', 'telemetry-otel', 'src', 'provider.ts'), providerTs);
    writeFileSync(
      join(dir, 'packages', 'mcp-server', 'smithery.yaml'),
      `const args = ['-y', '@peac/mcp-server@${opts.smithery ?? opts.current}'];\n`
    );
    return dir;
  }

  function runCli(args: string[]) {
    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execFileSync('node', [SCRIPT, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: Buffer | string };
      exitCode = e.status ?? -1;
      stdout = (e.stdout || '').toString();
    }
    return { stdout, exitCode };
  }

  const created: string[] = [];
  function repo(opts: Parameters<typeof writeTree>[0]) {
    const d = writeTree(opts);
    created.push(d);
    return d;
  }

  beforeAll(() => {
    root = repo({ current: '9.9.9' });
  });

  afterAll(() => {
    for (const d of created) rmSync(d, { recursive: true, force: true });
  });

  it('exits 0 when every site matches and provider derives the version', () => {
    const r = runCli(['--root', root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('all 3 site(s) current');
  });

  it('exits 1 when a site is stale', () => {
    const d = repo({ current: '9.9.9', version: '0.0.1' });
    const r = runCli(['--root', d]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('STALE');
  });

  it('exits 1 (fail closed) when a pattern is missing', () => {
    const d = repo({ current: '9.9.9', versionConst: false });
    const r = runCli(['--root', d]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('not found');
  });

  it('exits 1 when provider.ts hardcodes a version literal', () => {
    const d = repo({ current: '9.9.9', providerHardcoded: true });
    const r = runCli(['--root', d]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('do not hardcode');
  });

  it('--root with no path exits 2', () => {
    expect(runCli(['--root']).exitCode).toBe(2);
  });

  it('unknown argument exits 2', () => {
    expect(runCli(['--nope']).exitCode).toBe(2);
  });

  it('importing the module does not execute main()', () => {
    const url = JSON.stringify(pathToFileURL(SCRIPT).href);
    const out = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import(${url}).then((m) => process.stdout.write(typeof m.checkSite));`,
      ],
      { encoding: 'utf8' }
    );
    expect(out).toBe('function');
  });
});
