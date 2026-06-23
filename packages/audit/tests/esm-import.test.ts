/**
 * ESM import-safety test for @peac/audit.
 *
 * Regression guard for a dynamic `require('node:crypto')` inside
 * dispute-bundle.ts `generateBundleId()`. When the package is bundled to ESM
 * (dist/index.mjs) and loaded under a real Node ESM loader (or tsx), tsup turns
 * a dynamic require into a `__require(...)` shim that throws
 * `Dynamic require of "crypto" is not supported`. `createDisputeBundle()` calls
 * `generateBundleId()` on the bundle-assembly path, so the whole dispute-bundle
 * flow fails at runtime under ESM.
 *
 * The check MUST run under a real Node ESM loader, not inside vitest: vitest's
 * runtime provides a defined `require`, so the tsup `__require` shim's fallback
 * resolves and the bug is hidden. So this spawns the current Node binary
 * (process.execPath) on a temp .mjs that imports the BUILT bundle and calls
 * createDisputeBundle. It fails before the fix (the crypto require throws) and
 * passes after (static `import { randomBytes } from 'node:crypto'`).
 *
 * Lives in the @peac/audit package suite so `pnpm --filter @peac/audit test`
 * (the normal per-package PR lane) runs it, not only release/full-suite lanes.
 *
 * No network access; one short in-repo subprocess.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/audit/tests/ -> repo root is three levels up.
const REPO_ROOT = join(__dirname, '..', '..', '..');
const AUDIT_ESM = join(__dirname, '..', 'dist', 'index.mjs');
const SPAWN_TIMEOUT_MS = 15_000;
const BUILD_TIMEOUT_MS = 180_000; // on-demand @peac/audit... build when dist is missing

describe('@peac/audit ESM bundle is import-safe', () => {
  let tmp: string;

  beforeAll(() => {
    // Self-sufficient: this test asserts a property of the BUILT ESM bundle, so
    // it builds @peac/audit (and its workspace deps) if dist is missing rather
    // than depending on CI build ordering. The root suite that runs this lives
    // on rails that build first (publish.yml `pnpm build && pnpm test`, ci:all),
    // but tooling tests are not guaranteed a prior build everywhere -- so build
    // on demand to keep the guard reliable regardless of how it is invoked.
    if (!existsSync(AUDIT_ESM)) {
      try {
        // stdio: 'pipe' (not 'ignore') so a build failure surfaces in the error.
        execFileSync('pnpm', ['--filter', '@peac/audit...', 'build'], {
          cwd: REPO_ROOT,
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: BUILD_TIMEOUT_MS,
        });
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        throw new Error(
          `Failed to build @peac/audit for the ESM import test.\n${e.stdout ?? ''}${e.stderr ?? ''}`
        );
      }
    }
    if (!existsSync(AUDIT_ESM)) {
      throw new Error(
        `Built ESM bundle missing after build (${AUDIT_ESM}). Run "pnpm --filter @peac/audit build".`
      );
    }
    tmp = mkdtempSync(join(tmpdir(), 'peac-audit-esm-'));
  }, BUILD_TIMEOUT_MS);

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('createDisputeBundle runs under a real Node ESM loader (no dynamic-require failure)', () => {
    // A standalone ESM script (real loader, no CJS `require` in scope) imports
    // the built bundle and drives generateBundleId() via createDisputeBundle.
    // Minimal valid-shaped receipt + JWKS mirror packages/audit/tests.
    const auditUrl = pathToFileURL(AUDIT_ESM).href;
    const probe = [
      `import { createDisputeBundle } from ${JSON.stringify(auditUrl)};`,
      `const mk = (jti, iat) => {`,
      `  const h = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');`,
      `  const p = Buffer.from(JSON.stringify({ jti, iat, iss: 'https://issuer.example.com' })).toString('base64url');`,
      `  const s = Buffer.from('mock-signature').toString('base64url');`,
      `  return h + '.' + p + '.' + s;`,
      `};`,
      `const r = await createDisputeBundle({`,
      `  dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',`,
      `  created_by: 'https://auditor.example.com',`,
      `  receipts: [mk('receipt-001', 1704067200)],`,
      `  keys: { keys: [{ kty: 'OKP', kid: 'key-001', alg: 'EdDSA', crv: 'Ed25519', x: 'test-public-key-x', use: 'sig' }] },`,
      `});`,
      `if (!r.ok) { console.error('NOT_OK:' + JSON.stringify(r.error)); process.exit(2); }`,
      `if (!(r.value instanceof Buffer)) { console.error('NOT_BUFFER'); process.exit(3); }`,
      `console.log('ESM_OK');`,
    ].join('\n');

    const probePath = join(tmp, 'probe.mjs');
    writeFileSync(probePath, probe);

    let stdout = '';
    let failure: string | undefined;
    try {
      // process.execPath: use the same Node binary as the test runner.
      stdout = execFileSync(process.execPath, [probePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: SPAWN_TIMEOUT_MS,
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      failure = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    // Surface the real error (e.g. "Dynamic require of \"crypto\"...") on failure.
    expect(failure, failure).toBeUndefined();
    expect(stdout).toContain('ESM_OK');
  });
});
