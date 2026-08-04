/**
 * Build provenance.
 *
 * A build identifier that does not identify the source that produced it is worse than none: it
 * gives a deterministic report false provenance. These tests pin the resolution order and, most
 * importantly, that two different dirty trees do not share an identifier.
 * The closure and enforcement-order tests live in build-provenance-closure.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  resolveVerifierBuild,
  sourceTreeDigest,
  DIGEST_ROOTS,
} from '../../../scripts/verifier-build-id.mjs';

const REPO = resolve(__dirname, '../../..');

function tempRepo(dirty: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'peac-prov-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
  mkdirSync(join(dir, 'apps/verifier/src'), { recursive: true });
  writeFileSync(join(dir, 'apps/verifier/src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'apps/verifier/index.html'), '<!doctype html>\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: dir });
  if (dirty) writeFileSync(join(dir, 'apps/verifier/src/a.ts'), 'export const a = 2;\n');
  return dir;
}

describe('resolution order', () => {
  it('an explicit identifier always wins', () => {
    const id = resolveVerifierBuild({
      mode: 'production',
      root: REPO,
      env: { PEAC_VERIFIER_BUILD: 'ci-immutable-42' },
    });
    expect(id).toBe('ci-immutable-42');
  });

  it('a clean repository resolves to the bare commit sha', () => {
    const dir = tempRepo(false);
    try {
      const id = resolveVerifierBuild({ mode: 'production', root: dir, env: {} });
      expect(id).toMatch(/^[0-9a-f]{40}$/);
      expect(id).not.toContain('dirty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a dirty repository is labelled with a source digest, never a bare sha', () => {
    const dir = tempRepo(true);
    try {
      const id = resolveVerifierBuild({ mode: 'production', root: dir, env: {} });
      expect(id).toMatch(/^[0-9a-f]{40}-dirty\.[0-9a-f]{32}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('PEAC_VERIFIER_REQUIRE_CLEAN=1 refuses a dirty build outright', () => {
    const dir = tempRepo(true);
    try {
      expect(() =>
        resolveVerifierBuild({
          mode: 'production',
          root: dir,
          env: { PEAC_VERIFIER_REQUIRE_CLEAN: '1' },
        })
      ).toThrowError(/Refusing to build/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('outside a git checkout a production build fails rather than inventing an identifier', () => {
    const dir = mkdtempSync(join(tmpdir(), 'peac-nogit-'));
    try {
      expect(() => resolveVerifierBuild({ mode: 'production', root: dir, env: {} })).toThrowError(
        /must carry a real identifier/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the digest actually distinguishes trees', () => {
  it('two different dirty trees do not share an identifier', () => {
    const a = tempRepo(true);
    const b = mkdtempSync(join(tmpdir(), 'peac-prov-b-'));
    try {
      // `git clone` rather than a raw directory copy: it reproduces the same HEAD commit, which is
      // the premise of this test, without copying a live object store file by file.
      rmSync(b, { recursive: true, force: true });
      execFileSync('git', ['clone', '-q', a, b]);
      writeFileSync(join(b, 'apps/verifier/src/a.ts'), 'export const a = 999;\n');
      const idA = resolveVerifierBuild({ mode: 'production', root: a, env: {} });
      const idB = resolveVerifierBuild({ mode: 'production', root: b, env: {} });
      // Same base commit ...
      expect(idA.split('-dirty.')[0]).toBe(idB.split('-dirty.')[0]);
      // ... but DIFFERENT identifiers. A bare `-dirty` suffix would have collided here.
      expect(idA).not.toBe(idB);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('the digest changes when any contributing file changes', () => {
    const dir = tempRepo(false);
    try {
      const before = sourceTreeDigest(dir);
      writeFileSync(join(dir, 'apps/verifier/src/b.ts'), 'export const b = 1;\n');
      expect(sourceTreeDigest(dir)).not.toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('documents exactly which roots contribute', () => {
    expect(DIGEST_ROOTS).toContain('apps/verifier/src');
    expect(DIGEST_ROOTS).toContain('packages/crypto/src');
    expect(DIGEST_ROOTS).toContain('packages/protocol/src');
    for (const r of DIGEST_ROOTS) expect(existsSync(resolve(REPO, r))).toBe(true);
  });
});

describe('the identifier reaches the artifacts', () => {
  it('a pinned identifier appears in generated reports', async () => {
    const { initializeLocalVerifier } = await import('../src/verify.js');
    const { makeFixture } = await import('./helpers/fixtures.js');
    const f = await makeFixture();
    const v = await initializeLocalVerifier({ verifierBuild: 'pinned-build-id' });
    const r = await v.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(r.report?.verifierBuild).toBe('pinned-build-id');
  });

  it('rejects an empty or oversized identifier at construction', async () => {
    const { initializeLocalVerifier } = await import('../src/verify.js');
    await expect(initializeLocalVerifier({ verifierBuild: '' })).rejects.toMatchObject({
      code: 'E_VERIFIER_BUILD_INVALID',
    });
    await expect(initializeLocalVerifier({ verifierBuild: 'x'.repeat(129) })).rejects.toMatchObject(
      { code: 'E_VERIFIER_BUILD_INVALID' }
    );
  });
});
