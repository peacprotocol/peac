/**
 * A build that writes a commit-derived identifier into its output must not be restored from the
 * Turbo cache.
 *
 * The browser verifier embeds a build identifier resolved by scripts/verifier-build-id.mjs: the
 * HEAD commit, plus a dirty marker and a digest when the worktree has uncommitted changes anywhere
 * in the repository. Turbo hashes package files, dependency outputs and declared environment
 * variables; it does not hash HEAD or the repository-wide dirty state. A cached build is therefore
 * restored after an empty commit, or on a tree whose dirty state differs, and the restored bundle
 * names a commit or state that did not produce it.
 *
 * The stamping task is uncached, and the environment variables the resolver reads are declared so
 * Turbo's strict environment mode passes them to the build. Every other build task stays cached.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const RESOLVER = 'scripts/verifier-build-id.mjs';

interface TurboTask {
  cache?: boolean;
  dependsOn?: string[];
  env?: string[];
  outputs?: string[];
}

const turbo = JSON.parse(readFileSync(join(ROOT, 'turbo.json'), 'utf8')) as {
  tasks: Record<string, TurboTask>;
};

const BUILD_CONFIG = /^(vite|tsup|rollup|esbuild)\.config\.(ts|mts|cts|js|mjs|cjs)$/;
const COMMIT_SOURCE = /verifier-build-id|rev-parse/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'build', 'lib']);

function workspaceBuildConfigs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        workspaceBuildConfigs(join(dir, entry.name), out);
      }
    } else if (BUILD_CONFIG.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function packageNameFor(file: string): string {
  let dir = dirname(file);
  while (dir.startsWith(ROOT) && dir !== ROOT) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      return (JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name;
    }
    dir = dirname(dir);
  }
  throw new Error(`no package.json above ${relative(ROOT, file)}`);
}

/** Build configs in the workspace whose output embeds a commit-derived identifier. */
const stampingConfigs = ['apps', 'packages', 'surfaces', 'examples']
  .map((d) => join(ROOT, d))
  .filter((d) => existsSync(d))
  .flatMap((d) => workspaceBuildConfigs(d))
  .filter((f) => COMMIT_SOURCE.test(readFileSync(f, 'utf8')));

/** Environment variables the identifier resolver reads. */
const resolverEnv = [
  ...new Set(
    [...readFileSync(join(ROOT, RESOLVER), 'utf8').matchAll(/env\.(PEAC_[A-Z0-9_]+)/g)].map(
      (m) => m[1]
    )
  ),
].sort();

describe('commit-stamped builds are not restored from the cache', () => {
  it('finds the stamping build configs (the check is not vacuous)', () => {
    const names = stampingConfigs.map(packageNameFor);
    expect(names).toContain('@peac/app-verifier');
    expect(resolverEnv).toEqual(['PEAC_VERIFIER_BUILD', 'PEAC_VERIFIER_REQUIRE_CLEAN']);
  });

  it.each(stampingConfigs.map((f) => [relative(ROOT, f), packageNameFor(f)]))(
    '%s: the %s build task is uncached and receives the resolver environment',
    (_config, name) => {
      const task = turbo.tasks[`${name}#build`];
      expect(task, `turbo.json has no "${name}#build" task`).toBeDefined();
      expect(task.cache).toBe(false);
      expect(task.dependsOn).toEqual(turbo.tasks.build.dependsOn);
      for (const key of resolverEnv) {
        expect(task.env ?? [], `${name}#build does not declare ${key}`).toContain(key);
      }
    }
  );

  it('keeps every other build task cached', () => {
    expect(turbo.tasks.build.cache).not.toBe(false);
    const stampingTasks = new Set(stampingConfigs.map((f) => `${packageNameFor(f)}#build`));
    const uncachedBuilds = Object.entries(turbo.tasks)
      .filter(([key, task]) => /(^|#)build$/.test(key) && task.cache === false)
      .map(([key]) => key);
    for (const key of uncachedBuilds) {
      expect(stampingTasks.has(key), `${key} is uncached but stamps nothing`).toBe(true);
    }
  });
});
