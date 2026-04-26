#!/usr/bin/env node
/**
 * Dist-leak grep (P0 invariant).
 *
 * For every package in scripts/publish-manifest.json packages[], after build,
 * grep the emitted dist/**\/*.{mjs,cjs,d.ts} for forbidden identifiers:
 *
 *   - workspace-private package names: @peac/registries, @peac/record-core,
 *     @peac/compat, @peac/resolver-http
 *   - internal-only flag names: PEAC_INTERNAL_SHADOW_CORE, _internal.shadowCore,
 *     PEAC_EXPERIMENTAL_CODEC, _internal.codec
 *
 * Any match is a release blocker: it means an internal symbol or workspace-
 * private package leaked into a published surface, which would break
 * external install for consumers (404 on the unpublished package
 * name) or expose internal-only flags as part of the public TypeScript types.
 *
 * Excludes source maps (.map files) and test fixture directories.
 *
 * Exit codes:
 *   0 = clean (no matches across all packages)
 *   1 = one or more leaks detected
 *   2 = script error (missing dist directory, etc.)
 *
 * Usage:
 *   node scripts/verify-dist-private-leaks.mjs              # scan all
 *   node scripts/verify-dist-private-leaks.mjs --json       # JSON output
 *   node scripts/verify-dist-private-leaks.mjs --package @peac/protocol
 */

import { readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKSPACE_PACKAGE_MAP } from './lib/workspace-package-map.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Tier 1: globally forbidden across all 36 publish-manifest packages'
// dist/**/*.{mjs,cjs,d.ts}. These are private-package imports and public
// option/flag leaks - their presence anywhere in a published tarball is
// unambiguously a bug.
const FORBIDDEN_IDENTIFIERS = [
  '@peac/registries',
  '@peac/record-core',
  '@peac/compat',
  '@peac/resolver-http',
  'PEAC_INTERNAL_SHADOW_CORE',
  '_internal.shadowCore',
  'PEAC_EXPERIMENTAL_CODEC',
  '_internal.codec',
];

// Tier 2: forbidden ONLY on public-surface files. These are implementation
// symbols that legitimately appear in internal dist files (e.g.,
// packages/protocol/dist/_internal/record-core/codec/jws-jwt.cjs) and in
// private-package dist (e.g., packages/compat/dist/index.d.ts). What
// MUST NOT happen is for them to leak onto the public TypeScript surface
// declared by the package's `exports` map.
//
// Tier 2 scan scope per package:
//   - dist/index.d.ts (the only .d.ts that ships in the `types` field)
//   - dist/index.{mjs,cjs} (public root entry points)
//   - every subpath in package.json `exports` field's emitted files
const TIER_2_FORBIDDEN_IDENTIFIERS = [
  'RecordCodec',
  'CodecError',
  'CodecHeader',
  'MigrationClass',
  'MigrationVerdict',
  'ArchivalRecord',
  'ArchivalBundle',
  'defaultCodec',
  'classifyMigration',
  'ParityVerdict',
  'ParityError',
  'ParityWarning',
  'validateWire02Record',
  'validateKernelConstraintsInternal',
  'validateTypeExtensionMappingInternal',
  'TypeExtensionMappingInput',
  'TypeExtensionMappingWarning',
  'validateJoseHardeningInternal',
  'JoseHardeningInput',
  'JoseHardeningResult',
];

const WORKSPACE_PATH_MAP = WORKSPACE_PACKAGE_MAP;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    pkg: args.includes('--package') ? args[args.indexOf('--package') + 1] : null,
    // --package-dir <abs-path> runs the gate against a single package located
    // at the given directory (must contain package.json and dist/). Used by
    // self-tests to operate on temporary fixture packages without touching
    // any real workspace file. Bypasses the workspace-package-map lookup.
    pkgDir: args.includes('--package-dir') ? args[args.indexOf('--package-dir') + 1] : null,
  };
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // Skip sub-directories that are not part of emitted dist (e.g., __snapshots__).
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name === '__snapshots__') continue;
      out.push(...(await walk(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function isScannable(file) {
  if (file.endsWith('.map')) return false;
  return /\.(mjs|cjs|js|d\.ts)$/.test(file);
}

async function scanPackage(npmName, pkgRootOverride = null) {
  let pkgRoot;
  if (pkgRootOverride) {
    pkgRoot = pkgRootOverride;
  } else {
    const rel = WORKSPACE_PATH_MAP[npmName];
    if (!rel) return { npmName, status: 'unmapped', leaks: [] };
    pkgRoot = join(ROOT, rel);
  }
  const distDir = join(pkgRoot, 'dist');
  let stat;
  try {
    stat = statSync(distDir);
  } catch {
    return { npmName, status: 'no-dist', leaks: [] };
  }
  if (!stat.isDirectory()) return { npmName, status: 'no-dist', leaks: [] };

  const leaks = [];
  const files = (await walk(distDir)).filter(isScannable);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const ident of FORBIDDEN_IDENTIFIERS) {
      // Tier 1 detection rules:
      //   - Private-package names (@peac/...): match only inside actual
      //     import / export-from / require specifiers. JSDoc / inline-
      //     comment mentions of the name are NOT leaks; the public-surface
      //     check (Tier 2) and the source-import guard test catch the
      //     real failure modes.
      //   - Internal flag identifiers (PEAC_*, _internal.*): match anywhere
      //     in code (not in /* ... */ block comments, not in `// ...` line
      //     comments). The flags are themselves distinctive enough to make
      //     a substring grep precise; we filter out comments by ignoring
      //     lines that begin with `//` / ` *` after trimming.
      let match = null;
      const escaped = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (ident.startsWith('@peac/')) {
        // Match real import / require statements + dynamic import + JSON
        // dependency keys. Includes side-effect-only `import '@peac/x';`
        // and `import './'/'@peac/x'` plus the standard `from` form.
        // Comment-only mentions of the literal name are filtered out by
        // the comment-line skip below.
        const re = new RegExp(
          `(?:` +
            `from\\s*['"\`]${escaped}(?:/[^'"\`]*)?['"\`]` +
            `|require\\(\\s*['"\`]${escaped}(?:/[^'"\`]*)?['"\`]\\s*\\)` +
            `|import\\(\\s*['"\`]${escaped}(?:/[^'"\`]*)?['"\`]\\s*\\)` +
            `|import\\s+['"\`]${escaped}(?:/[^'"\`]*)?['"\`]` +
            `|"${escaped}"\\s*:` +
            `)`,
        );
        match = re;
      } else {
        match = new RegExp(`\\b${escaped}\\b`);
      }

      const lines = content.split('\n');
      let lineIdx = -1;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trimStart();
        // Skip comment-only lines; they are documentation, not behavior.
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }
        if (match.test(line)) {
          lineIdx = i;
          break;
        }
      }
      if (lineIdx >= 0) {
        leaks.push({
          file: relative(ROOT, file),
          identifier: ident,
          line: lineIdx + 1,
          excerpt: lines[lineIdx].trim().slice(0, 160),
        });
      }
    }
  }
  return { npmName, status: leaks.length ? 'leak' : 'clean', leaks };
}

// -----------------------------------------------------------------------------
// Tier 2 scanner: public-surface-only.
// -----------------------------------------------------------------------------
//
// Walks package.json `exports` to enumerate every file that is part of the
// public TypeScript surface. Internal dist files (e.g., dist/_internal/**)
// and private-package dist are NOT in this scope.
//
// For every public-surface file (.d.ts and .{mjs,cjs} entry points), grep
// for TIER_2_FORBIDDEN_IDENTIFIERS. Any match fails CI.

function collectExportedFiles(pkgJson, pkgRoot) {
  const out = new Set();
  const exportsField = pkgJson.exports;
  if (!exportsField || typeof exportsField !== 'object') return out;

  function walkExports(node) {
    if (!node) return;
    if (typeof node === 'string') {
      // Resolve relative to pkgRoot.
      if (node.startsWith('./')) {
        out.add(join(pkgRoot, node));
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walkExports(item);
      return;
    }
    if (typeof node === 'object') {
      for (const v of Object.values(node)) walkExports(v);
    }
  }

  walkExports(exportsField);
  return out;
}

async function scanPackageTier2(npmName, pkgRootOverride = null) {
  let pkgRoot;
  if (pkgRootOverride) {
    pkgRoot = pkgRootOverride;
  } else {
    const rel = WORKSPACE_PATH_MAP[npmName];
    if (!rel) return { npmName, status: 'unmapped', leaks: [] };
    pkgRoot = join(ROOT, rel);
  }
  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  } catch {
    return { npmName, status: 'no-package-json', leaks: [] };
  }

  // Tier 2 scope: TypeScript declaration files only. The .d.ts files in
  // the dist are the actual public TYPE surface that consumers see via
  // `types`/`import`/`require` resolution. Runtime .mjs/.cjs files are
  // bundled output: tsup tree-shakes internal modules into the public
  // entry points, which is normal and expected (e.g.,
  // `var defaultCodec = new JwsJwtCodec()` ends up bundled inside
  // verify-local.cjs because the codec is on the runtime path). Those
  // are LOCAL variables, not exports; flagging them would create
  // unbreakable false positives. Tier 1 (private package imports +
  // flag identifiers) already covers runtime concerns.
  const surfaceFiles = [...collectExportedFiles(pkgJson, pkgRoot)].filter((f) => {
    return f.endsWith('.d.ts');
  });

  const leaks = [];
  for (const file of surfaceFiles) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      // File missing (build skipped, dry run, etc.). Skip silently; the
      // Tier 1 scan would surface a missing dist regardless.
      continue;
    }
    for (const ident of TIER_2_FORBIDDEN_IDENTIFIERS) {
      // Word-boundary match to avoid coincidental substring hits
      // (e.g., a comment containing the camelCase identifier).
      const re = new RegExp(`\\b${ident}\\b`);
      if (re.test(content)) {
        const lines = content.split('\n');
        const lineIdx = lines.findIndex((l) => re.test(l));
        leaks.push({
          file: relative(ROOT, file),
          identifier: ident,
          line: lineIdx >= 0 ? lineIdx + 1 : null,
          excerpt: lineIdx >= 0 ? lines[lineIdx].trim().slice(0, 160) : null,
        });
      }
    }
  }

  return { npmName, status: leaks.length ? 'leak' : 'clean', leaks };
}

// -----------------------------------------------------------------------------
// Tier 2b scanner: runtime-export only.
// -----------------------------------------------------------------------------
//
// Scans emitted runtime .mjs / .cjs files (the public root + every subpath
// in package.json `exports`) for ACTUAL EXPORT SYNTAX of forbidden
// implementation symbols. A bundled local declaration like
// `var defaultCodec = new JwsJwtCodec();` is NOT an export and is NOT
// flagged. An ESM `export { defaultCodec }` or a CJS
// `exports.defaultCodec = ...` IS flagged.
//
// This complements Tier 2's .d.ts type-surface scan: Tier 2 catches type
// leaks, Tier 2b catches runtime export leaks, and bundler tree-shake
// state in runtime files (the legitimate normal case) is not flagged
// in either scan.

function scanForRuntimeExportLeaks(file, content, identifiers) {
  const leaks = [];
  const lines = content.split('\n');
  for (const ident of identifiers) {
    const escaped = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // ESM forms:
    //   export { defaultCodec }
    //   export { defaultCodec as foo }
    //   export const defaultCodec = ...
    //   export function defaultCodec(...)
    //   export class CodecError ...
    //   export type RecordCodec = ...   (only relevant in .ts; absent from .mjs)
    //   export default defaultCodec
    //   export defaultCodec from '...'
    //
    // CJS forms:
    //   exports.defaultCodec = ...
    //   module.exports.defaultCodec = ...
    //   module.exports = { ..., defaultCodec, ... }
    //
    // Bundler-tree shake export tables (esbuild / tsup):
    //   defaultCodec: () => defaultCodec
    //   exports.foo = exports.defaultCodec = ...
    const patterns = [
      // ESM named export brace lists (treats both shorthand and aliased exports)
      new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`),
      // ESM declaration exports: const / let / var / function / class / type
      new RegExp(`\\bexport\\s+(?:const|let|var|function|class|type|interface|async\\s+function)\\s+${escaped}\\b`),
      // ESM default export of the named symbol
      new RegExp(`\\bexport\\s+default\\s+${escaped}\\b`),
      // CJS assignment forms
      new RegExp(`\\bexports\\.${escaped}\\s*=`),
      new RegExp(`\\bmodule\\.exports\\.${escaped}\\s*=`),
      // CJS object-literal export bag mentioning the symbol as a shorthand or property
      new RegExp(`\\bmodule\\.exports\\s*=\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`),
      // esbuild / tsup bundler export-table form: `defaultCodec: () => defaultCodec`
      new RegExp(`\\b${escaped}\\s*:\\s*\\(\\s*\\)\\s*=>\\s*${escaped}\\b`),
    ];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const re of patterns) {
        if (re.test(line)) {
          leaks.push({
            file: relative(ROOT, file),
            identifier: ident,
            line: i + 1,
            excerpt: line.trim().slice(0, 160),
          });
          break;
        }
      }
    }
  }
  return leaks;
}

async function scanPackageTier2Runtime(npmName, pkgRootOverride = null) {
  let pkgRoot;
  if (pkgRootOverride) {
    pkgRoot = pkgRootOverride;
  } else {
    const rel = WORKSPACE_PATH_MAP[npmName];
    if (!rel) return { npmName, status: 'unmapped', leaks: [] };
    pkgRoot = join(ROOT, rel);
  }
  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  } catch {
    return { npmName, status: 'no-package-json', leaks: [] };
  }

  // Tier 2b scope: emitted runtime files in package.json `exports`. The
  // .mjs / .cjs files are the public runtime entry points; we scan for
  // EXPORT syntax of forbidden symbols, ignoring bundled local
  // declarations.
  const runtimeFiles = [...collectExportedFiles(pkgJson, pkgRoot)].filter((f) => {
    return /\.(mjs|cjs|js)$/.test(f);
  });

  const leaks = [];
  for (const file of runtimeFiles) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    leaks.push(...scanForRuntimeExportLeaks(file, content, TIER_2_FORBIDDEN_IDENTIFIERS));
  }

  return { npmName, status: leaks.length ? 'leak' : 'clean', leaks };
}

async function main() {
  const args = parseArgs();

  let targets;
  let pkgRootOverride = null;
  if (args.pkgDir) {
    // Fixture-mode: scan a single package at the given absolute path.
    let fixturePkgJson;
    try {
      fixturePkgJson = JSON.parse(readFileSync(join(args.pkgDir, 'package.json'), 'utf8'));
    } catch (err) {
      console.error(`Script error: failed to read package.json at ${args.pkgDir}: ${err.message}`);
      process.exit(2);
    }
    targets = [fixturePkgJson.name ?? '@fixture/unknown'];
    pkgRootOverride = args.pkgDir;
  } else {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'scripts', 'publish-manifest.json'), 'utf8')
    );
    targets = args.pkg ? [args.pkg] : manifest.packages;
  }

  const results = [];
  const tier2Results = [];
  const tier2RuntimeResults = [];
  for (const name of targets) {
    results.push(await scanPackage(name, pkgRootOverride));
    tier2Results.push(await scanPackageTier2(name, pkgRootOverride));
    tier2RuntimeResults.push(await scanPackageTier2Runtime(name, pkgRootOverride));
  }

  const leaks = results.filter((r) => r.status === 'leak');
  const tier2Leaks = tier2Results.filter((r) => r.status === 'leak');
  const tier2RuntimeLeaks = tier2RuntimeResults.filter((r) => r.status === 'leak');
  const noDist = results.filter((r) => r.status === 'no-dist');
  const totalLeakCount = leaks.length + tier2Leaks.length + tier2RuntimeLeaks.length;

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          tier1Leaks: leaks,
          tier2Leaks,
          tier2RuntimeLeaks,
          noDist,
          scanned: results.length,
        },
        null,
        2,
      ),
    );
  } else {
    if (totalLeakCount === 0) {
      console.log(
        `OK: scanned ${results.length} package(s); no Tier 1, Tier 2 (.d.ts), or Tier 2b (runtime export) leaks. ` +
          `(${noDist.length} package(s) had no dist/ to scan.)`,
      );
    } else {
      if (leaks.length > 0) {
        console.error(
          `FAIL (Tier 1): ${leaks.length} package(s) leaked private package or flag identifiers into dist/:`,
        );
        for (const r of leaks) {
          console.error(`\n  ${r.npmName}:`);
          for (const l of r.leaks) {
            console.error(`    ${l.file}:${l.line ?? '?'}: '${l.identifier}'`);
            if (l.excerpt) console.error(`      ${l.excerpt}`);
          }
        }
      }
      if (tier2Leaks.length > 0) {
        console.error(
          `\nFAIL (Tier 2): ${tier2Leaks.length} package(s) leaked implementation symbol(s) onto the public type surface (.d.ts):`,
        );
        for (const r of tier2Leaks) {
          console.error(`\n  ${r.npmName}:`);
          for (const l of r.leaks) {
            console.error(`    ${l.file}:${l.line ?? '?'}: '${l.identifier}'`);
            if (l.excerpt) console.error(`      ${l.excerpt}`);
          }
        }
      }
      if (tier2RuntimeLeaks.length > 0) {
        console.error(
          `\nFAIL (Tier 2b): ${tier2RuntimeLeaks.length} package(s) exported implementation symbol(s) from a public runtime entry (.mjs/.cjs/.js):`,
        );
        for (const r of tier2RuntimeLeaks) {
          console.error(`\n  ${r.npmName}:`);
          for (const l of r.leaks) {
            console.error(`    ${l.file}:${l.line ?? '?'}: '${l.identifier}'`);
            if (l.excerpt) console.error(`      ${l.excerpt}`);
          }
        }
      }
    }
  }

  process.exit(totalLeakCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Script error:', err.message);
  process.exit(2);
});
