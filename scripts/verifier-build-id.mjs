#!/usr/bin/env node
/**
 * Resolve the verifier build identifier.
 *
 * THE PROBLEM THIS SOLVES
 *
 * A bare `git rev-parse HEAD` labels a build with the last COMMIT, not with the source that produced
 * it. A build from an uncommitted working tree would be stamped with the last commit, and two
 * materially different working trees would emit an identical `verifierBuild` -- false provenance in a
 * document whose whole purpose is reproducibility. A plain `-dirty` suffix does not fix it either.
 *
 * RESOLUTION ORDER
 *
 *   0. PEAC_VERIFIER_REQUIRE_CLEAN=1 -- checked FIRST, against the repository, before any identifier
 *                                       is accepted. A supplied identifier cannot make a dirty tree
 *                                       clean, so it must not be able to bypass the check.
 *   1. PEAC_VERIFIER_BUILD           -- an explicit immutable identifier (CI/release), validated.
 *   2. clean worktree                -- `<sha>`
 *   3. dirty worktree                -- `<sha>-dirty.<32-hex build-input digest>`
 *   4. not a git checkout            -- hard failure in production
 *
 * THE BUILD-INPUT CLOSURE
 *
 * The digest covers every input capable of changing the emitted bundle or its embedded build
 * identity -- including this resolver itself, the lockfile and the workspace configuration, because a
 * change to any of them changes what is built. Modified, untracked, deleted and renamed files all
 * change the result: the digest is computed over the ENUMERATED CONTENT of the closure, so a removed
 * file changes it exactly as a modified one does.
 *
 * WHAT THE IDENTIFIER REPRESENTS
 *
 * SOURCE AND CONFIGURATION PROVENANCE: the commit, the build mode, and a collision-resistant digest
 * of the declared build-input closure. It is NOT an identifier for the exact emitted binary, because
 * the toolchain version, the Node runtime and the host environment are not represented. Two builds
 * sharing an identifier had the same declared inputs; they are not thereby proven byte-identical.
 *
 * The build MODE is part of the identifier because it changes emitted output (minification and
 * `import.meta.env` substitution at minimum), so a development and a production build of the same
 * tree must not be indistinguishable.
 *
 * No wall-clock value, no random value, no silent "unknown".
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The declared build-input closure.
 *
 * A file outside this list cannot change the bundle. If that stops being true, this list is wrong and
 * the identifier silently stops meaning what it claims -- so additions here are deliberate, not
 * incidental.
 */
export const DIGEST_ROOTS = [
  // The application itself.
  'apps/verifier/src',
  'apps/verifier/index.html',
  'apps/verifier/vite.config.ts',
  'apps/verifier/vitest.config.ts',
  'apps/verifier/tsconfig.json',
  'apps/verifier/package.json',
  // The contract snapshot shipped with the app.
  'apps/verifier/contracts',
  // Every package whose source is bundled.
  'packages/crypto/src',
  'packages/schema/src',
  'packages/kernel/src',
  'packages/protocol/src',
  // Resolution and toolchain: a lockfile or workspace change alters what those imports resolve to.
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  // This resolver decides the identifier, so it is part of its own closure.
  'scripts/verifier-build-id.mjs',
];

/**
 * Vite loads `.env` files from the project root by default, and their values are substituted into
 * the bundle. None exist today; declaring them means that adding one changes the identifier instead
 * of silently changing the build.
 */
const ENV_FILE_ROOTS = ['apps/verifier', '.'];
const ENV_FILE_PATTERN = /^\.env(\..+)?$/;

const SKIP_DIR = new Set(['__tests__', 'tests', 'node_modules', 'dist', '.turbo', 'coverage']);

function collect(p, out) {
  if (!existsSync(p)) return out;
  const st = statSync(p);
  if (st.isFile()) {
    out.push(p);
    return out;
  }
  for (const name of readdirSync(p)) {
    if (SKIP_DIR.has(name)) continue;
    collect(join(p, name), out);
  }
  return out;
}

/**
 * SHA-256 over the enumerated closure.
 *
 * Each file contributes `sha256(relative path) || sha256(bytes)`, sorted by path. Because the path
 * set itself is part of the input, a deletion or a rename changes the digest just as a content edit
 * does -- there is no "file count" shortcut that a rename could slip past.
 */
export function buildInputDigest(root = ROOT, mode = 'production') {
  const files = [];
  for (const r of DIGEST_ROOTS) collect(join(root, r), files);
  for (const dir of ENV_FILE_ROOTS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (ENV_FILE_PATTERN.test(name)) files.push(join(abs, name));
    }
  }
  files.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
  const h = createHash('sha256');
  // The MODE is part of the preimage: the same sources built in different modes emit different
  // bundles and must not share an identifier.
  h.update(`mode:${mode}\n`);
  h.update(`files:${files.length}\n`);
  for (const f of files) {
    h.update(createHash('sha256').update(relative(root, f)).digest());
    h.update(createHash('sha256').update(readFileSync(f)).digest());
  }
  // 32 hex characters = 128 bits, the stated minimum.
  return h.digest('hex').slice(0, 32);
}

/** Retained name for the previous export. */
export const sourceTreeDigest = buildInputDigest;

function git(args, root) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * Explicit identifiers enter deterministic report vectors, so they are validated, not trusted.
 *
 * The EXACT supplied value is validated. Trimming first would silently accept `"release-1\n"` and
 * `" release-1 "` as `release-1`, contradicting the rule that whitespace and control characters are
 * invalid, and quietly changing an identifier the caller believed they had set.
 */
const EXPLICIT_ID = /^[A-Za-z0-9._:+/-]{1,128}$/;

export function assertValidExplicitBuildId(id) {
  if (typeof id !== 'string') {
    throw new Error('PEAC_VERIFIER_BUILD must be a string');
  }
  if (id.length === 0) {
    throw new Error('PEAC_VERIFIER_BUILD is defined but empty');
  }
  if (id.length > 128) {
    throw new Error(`PEAC_VERIFIER_BUILD exceeds 128 characters (${id.length})`);
  }
  if (!EXPLICIT_ID.test(id)) {
    throw new Error(
      'PEAC_VERIFIER_BUILD must be printable and stable: only A-Z a-z 0-9 . _ : + / - are allowed. ' +
        'Whitespace, newlines and control characters are rejected rather than stripped, so the ' +
        'identifier recorded in a report is exactly the one that was supplied.'
    );
  }
  return id;
}

/** Build modes this resolver understands. An unknown mode is a hard failure, not a silent default. */
const KNOWN_MODES = new Set(['production', 'development', 'test']);

export function resolveVerifierBuild({ mode = 'development', root = ROOT, env = process.env } = {}) {
  if (typeof mode !== 'string' || !KNOWN_MODES.has(mode)) {
    throw new Error(
      `Unknown build mode ${JSON.stringify(mode)}. Known modes: ${[...KNOWN_MODES].join(', ')}. ` +
        'An unrecognized mode cannot be represented in the build identifier, and a build whose mode ' +
        'is not represented can silently differ from another carrying the same identifier.'
    );
  }
  const requireClean = env.PEAC_VERIFIER_REQUIRE_CLEAN === '1';

  let sha;
  let dirty;
  let inGit = true;
  try {
    sha = git(['rev-parse', 'HEAD'], root);
    dirty = git(['status', '--porcelain'], root).length > 0;
  } catch {
    inGit = false;
  }

  // Step 0. The cleanliness requirement is about the REPOSITORY, so it is checked before any
  // identifier is considered. Checking it after would let `PEAC_VERIFIER_BUILD=release-1` label a
  // dirty tree as a release -- exactly the claim the flag exists to prevent.
  if (requireClean) {
    if (!inGit) {
      throw new Error(
        'PEAC_VERIFIER_REQUIRE_CLEAN=1 but this is not a git checkout, so cleanliness cannot be established.'
      );
    }
    if (dirty) {
      throw new Error(
        `Refusing to build: the worktree is dirty and PEAC_VERIFIER_REQUIRE_CLEAN=1. ` +
          `A dirty build cannot honestly claim commit ${sha.slice(0, 12)}. ` +
          'Commit the changes, or drop PEAC_VERIFIER_REQUIRE_CLEAN.'
      );
    }
  }

  // Presence, not truthiness: a variable that is DEFINED but empty or whitespace-only is a
  // misconfiguration to report, not a reason to fall through to automatic resolution.
  if (Object.prototype.hasOwnProperty.call(env, 'PEAC_VERIFIER_BUILD') && env.PEAC_VERIFIER_BUILD !== undefined) {
    return assertValidExplicitBuildId(env.PEAC_VERIFIER_BUILD);
  }

  if (!inGit) {
    if (mode === 'production') {
      throw new Error(
        'No build identifier: PEAC_VERIFIER_BUILD is unset and this is not a git checkout. ' +
          'A production build must carry a real identifier -- a placeholder would enter deterministic report vectors.'
      );
    }
    return 'dev';
  }

  // Production is the release mode and carries no suffix; any other mode is named explicitly so a
  // non-release artifact can never be mistaken for the release built from the same commit.
  const modeSuffix = mode === 'production' ? '' : `.${mode}`;
  if (!dirty) return `${sha}${modeSuffix}`;

  return `${sha}-dirty.${buildInputDigest(root, mode)}${modeSuffix}`;
}

if (process.argv[1] && process.argv[1].endsWith('verifier-build-id.mjs')) {
  const mode = process.argv.includes('--production') ? 'production' : 'development';
  process.stdout.write(resolveVerifierBuild({ mode }) + '\n');
}
