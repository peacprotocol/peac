/**
 * Build provenance: enforcement order and build-input closure.
 *
 * Two properties are asserted here.
 *
 *   1. The cleanliness requirement is evaluated BEFORE any supplied identifier. An explicit
 *      identifier must not be able to label a dirty tree as a release, which is the one claim the
 *      flag exists to prevent.
 *   2. The declared closure covers every input that changes the emitted bundle, including the
 *      lockfile, the workspace configuration and the resolver itself.
 *
 * Every mutation is reverted in a `finally`, and each test re-asserts the original digest afterwards
 * so a leaked mutation fails here rather than silently affecting a later test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, rmSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  resolveVerifierBuild,
  buildInputDigest,
  DIGEST_ROOTS,
} from '../../../scripts/verifier-build-id.mjs';

const REPO = resolve(__dirname, '../../..');

/**
 * Mutation tests run against a TEMPORARY tree, never the live repository.
 *
 * Editing real build inputs from a test is unsafe under parallel workers: another test can observe
 * a half-restored file, and an interrupted run leaves the working tree dirty. The digest only reads
 * the declared closure, so a minimal tree containing those paths exercises it exactly.
 */
let FIXTURE = '';

/** A minimal git repository, optionally carrying an uncommitted change. */
function makeRepo(makeDirty: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'peac-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  mkdirSync(join(dir, 'apps/verifier/src'), { recursive: true });
  writeFileSync(join(dir, 'apps/verifier/src/a.ts'), 'export const a = 1;\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
  if (makeDirty) writeFileSync(join(dir, 'apps/verifier/src/a.ts'), 'export const a = 2;\n');
  return dir;
}

function writeFixtureFile(rel: string, content: string): void {
  const abs = join(FIXTURE, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

beforeAll(() => {
  FIXTURE = mkdtempSync(join(tmpdir(), 'peac-closure-'));
  writeFixtureFile('apps/verifier/src/verify.ts', 'export const verify = 1;\n');
  writeFixtureFile('apps/verifier/src/lib/build-info.ts', 'export const build = 1;\n');
  writeFixtureFile('apps/verifier/index.html', '<!doctype html>\n');
  writeFixtureFile('apps/verifier/vite.config.ts', 'export default {};\n');
  writeFixtureFile('apps/verifier/package.json', '{"name":"fixture"}\n');
  writeFixtureFile('apps/verifier/contracts/README.md', 'fixture\n');
  writeFixtureFile('packages/crypto/src/jws.ts', 'export const jws = 1;\n');
  writeFixtureFile('packages/kernel/src/kid.ts', 'export const kid = 1;\n');
  writeFixtureFile('package.json', '{"name":"root"}\n');
  writeFixtureFile('pnpm-lock.yaml', 'lockfileVersion: 6.0\n');
  writeFixtureFile('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  writeFixtureFile('scripts/verifier-build-id.mjs', '// fixture resolver\n');
});

afterAll(() => {
  if (FIXTURE) rmSync(FIXTURE, { recursive: true, force: true });
});

describe('cleanliness is checked before any supplied identifier', () => {
  /**
   * Dedicated repositories, never the live one. Asserting on the live tree's dirtiness makes the
   * outcome depend on whether the suite runs before or after a commit, which is not a property of
   * the code under test.
   */
  let cleanRepo = '';
  let dirtyRepo = '';

  beforeAll(() => {
    cleanRepo = makeRepo(false);
    dirtyRepo = makeRepo(true);
  });

  afterAll(() => {
    for (const d of [cleanRepo, dirtyRepo]) if (d) rmSync(d, { recursive: true, force: true });
  });

  it('rejects a dirty tree even when an explicit build identifier is supplied', () => {
    expect(() =>
      resolveVerifierBuild({
        mode: 'production',
        root: dirtyRepo,
        env: { PEAC_VERIFIER_BUILD: 'release-1', PEAC_VERIFIER_REQUIRE_CLEAN: '1' },
      })
    ).toThrowError(/dirty/i);
  });

  it('accepts a clean tree with the same flag set', () => {
    expect(
      resolveVerifierBuild({
        mode: 'production',
        root: cleanRepo,
        env: { PEAC_VERIFIER_BUILD: 'release-1', PEAC_VERIFIER_REQUIRE_CLEAN: '1' },
      })
    ).toBe('release-1');
  });

  it('accepts the same explicit identifier when cleanliness is not required', () => {
    expect(
      resolveVerifierBuild({
        mode: 'production',
        root: dirtyRepo,
        env: { PEAC_VERIFIER_BUILD: 'release-1' },
      })
    ).toBe('release-1');
  });
});

describe('explicit identifiers are validated, not trusted', () => {
  const invalid: Array<[string, string]> = [
    ['newline', 'release\nid'],
    ['carriage return', 'release\rid'],
    ['tab', 'release\tid'],
    ['space', 'release id'],
    ['quote', 'release"id'],
    ['backtick', 'release`id'],
    ['control character', 'release\u0001id'],
    ['too long', 'a'.repeat(129)],
  ];

  it.each(invalid)('rejects %s', (_label, value) => {
    expect(() =>
      resolveVerifierBuild({ mode: 'production', root: REPO, env: { PEAC_VERIFIER_BUILD: value } })
    ).toThrow();
  });

  it.each(['abc123', 'v0.16.4', 'sha256:deadbeef', 'refs/tags/v1', 'a'.repeat(128)])(
    'accepts the stable identifier %s',
    (value) => {
      expect(
        resolveVerifierBuild({
          mode: 'production',
          root: REPO,
          env: { PEAC_VERIFIER_BUILD: value },
        })
      ).toBe(value);
    }
  );

  it('rejects a DEFINED but empty or whitespace-only value instead of falling through', () => {
    // Falling through would resolve an identifier automatically while the operator believed they had
    // pinned one, which is the same class of false provenance the resolver exists to prevent.
    for (const value of ['', ' ', '   ', '\t', '\n']) {
      expect(() =>
        resolveVerifierBuild({
          mode: 'production',
          root: REPO,
          env: { PEAC_VERIFIER_BUILD: value },
        })
      ).toThrow();
    }
  });

  it('does NOT trim before validating', () => {
    // Trimming would silently accept these as "release-1", contradicting the stated rule and
    // changing an identifier the caller believed they had set.
    for (const value of ['release-1\n', ' release-1', 'release-1 ', ' release-1 ', '\trelease-1']) {
      expect(() =>
        resolveVerifierBuild({
          mode: 'production',
          root: REPO,
          env: { PEAC_VERIFIER_BUILD: value },
        })
      ).toThrowError(/rejected rather than stripped|printable and stable/);
    }
  });

  it('resolves automatically only when the variable is genuinely UNSET', () => {
    const r = resolveVerifierBuild({ mode: 'development', root: REPO, env: {} });
    expect(r.length).toBeGreaterThan(0);
    expect(r).toMatch(/^[0-9a-f]{40}/);
  });
});

describe('the build-input closure covers everything that changes the bundle', () => {
  const REQUIRED = [
    'apps/verifier/src',
    'apps/verifier/index.html',
    'apps/verifier/vite.config.ts',
    'apps/verifier/package.json',
    'apps/verifier/contracts',
    'packages/crypto/src',
    'packages/schema/src',
    'packages/kernel/src',
    'packages/protocol/src',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'scripts/verifier-build-id.mjs',
  ];

  it('declares every required input', () => {
    for (const r of REQUIRED) expect(DIGEST_ROOTS).toContain(r);
  });

  it('produces a digest of at least 128 bits', () => {
    expect(buildInputDigest(FIXTURE).length).toBeGreaterThanOrEqual(32);
  });

  const mutations: Array<[string, string, (s: string) => string]> = [
    ['a bundled source file', 'apps/verifier/src/verify.ts', (s) => `${s}\n// closure probe\n`],
    ['the vite config', 'apps/verifier/vite.config.ts', (s) => `${s}\n// closure probe\n`],
    ['an imported package source', 'packages/crypto/src/jws.ts', (s) => `${s}\n// closure probe\n`],
    ['the lockfile', 'pnpm-lock.yaml', (s) => `${s}\n# closure probe\n`],
    ['the resolver itself', 'scripts/verifier-build-id.mjs', (s) => `${s}\n// closure probe\n`],
    [
      'the shipped contract snapshot',
      'apps/verifier/contracts/README.md',
      (s) => `${s}\nclosure probe\n`,
    ],
  ];

  it.each(mutations)('changing %s changes the identifier', (_label, rel, mutate) => {
    const abs = join(FIXTURE, rel);
    // No separate existence check: the read below establishes both existence and content in one
    // operation, and a check-then-use pair would only widen the window between them.
    const before = buildInputDigest(FIXTURE);
    const original = readFileSync(abs, 'utf8');
    try {
      writeFileSync(abs, mutate(original));
      expect(buildInputDigest(FIXTURE)).not.toBe(before);
    } finally {
      writeFileSync(abs, original);
    }
    expect(buildInputDigest(FIXTURE)).toBe(before);
  });

  it('DELETING a closure file changes the identifier', () => {
    const abs = join(FIXTURE, 'apps/verifier/src/lib/build-info.ts');
    const before = buildInputDigest(FIXTURE);
    const original = readFileSync(abs, 'utf8');
    try {
      rmSync(abs);
      expect(buildInputDigest(FIXTURE)).not.toBe(before);
    } finally {
      writeFileSync(abs, original);
    }
    expect(buildInputDigest(FIXTURE)).toBe(before);
  });

  it('an UNTRACKED file inside the closure changes the identifier', () => {
    const abs = join(FIXTURE, 'apps/verifier/src/lib/closure-probe-untracked.ts');
    const before = buildInputDigest(FIXTURE);
    try {
      writeFileSync(abs, 'export const probe = 1;\n');
      expect(buildInputDigest(FIXTURE)).not.toBe(before);
    } finally {
      rmSync(abs, { force: true });
    }
    expect(buildInputDigest(FIXTURE)).toBe(before);
  });

  it('RENAMING a closure file changes the identifier', () => {
    const from = join(FIXTURE, 'apps/verifier/src/lib/build-info.ts');
    const to = join(FIXTURE, 'apps/verifier/src/lib/build-info-renamed-probe.ts');
    const before = buildInputDigest(FIXTURE);
    const original = readFileSync(from, 'utf8');
    try {
      rmSync(from);
      writeFileSync(to, original);
      expect(buildInputDigest(FIXTURE)).not.toBe(before);
    } finally {
      rmSync(to, { force: true });
      writeFileSync(from, original);
    }
    expect(buildInputDigest(FIXTURE)).toBe(before);
  });
});

describe('build mode is part of the identity', () => {
  it('rejects an unknown mode rather than defaulting silently', () => {
    expect(() =>
      // @ts-expect-error deliberately outside the known set
      resolveVerifierBuild({ mode: 'staging', root: REPO, env: {} })
    ).toThrowError(/Unknown build mode/);
  });

  it('a development build is distinguishable from a production build of the same tree', () => {
    // Mode changes emitted output (minification, import.meta.env substitution), so the two artifacts
    // must not share an identifier.
    const prod = resolveVerifierBuild({ mode: 'production', root: REPO, env: {} });
    const dev = resolveVerifierBuild({ mode: 'development', root: REPO, env: {} });
    expect(dev).not.toBe(prod);
  });

  it('the mode is part of the digest preimage, not only the suffix', () => {
    expect(buildInputDigest(FIXTURE, 'production')).not.toBe(
      buildInputDigest(FIXTURE, 'development')
    );
  });

  it('production carries no mode suffix', () => {
    const prod = resolveVerifierBuild({ mode: 'production', root: REPO, env: {} });
    expect(prod).not.toMatch(/\.production$/);
    expect(resolveVerifierBuild({ mode: 'development', root: REPO, env: {} })).toMatch(
      /\.development$/
    );
  });
});
