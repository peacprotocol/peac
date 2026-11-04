/**
 * CLI Version Utility
 *
 * Reads version from package.json at runtime to avoid hardcoding.
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const PACKAGE_NAME = '@peac/cli';

/**
 * Read the version from a package.json path, accepting only this package's
 * manifest. Returns undefined when the file is absent, unreadable, or belongs
 * to another package.
 */
function readOwnPackageVersion(pkgPath: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: unknown; version?: unknown };
    if (pkg.name === PACKAGE_NAME && typeof pkg.version === 'string' && pkg.version !== '') {
      return pkg.version;
    }
  } catch {
    // Absent or unreadable: the caller tries the next location
  }
  return undefined;
}

/**
 * Get CLI version from package.json
 *
 * Looks for package.json in this order:
 * 1. Paths relative to this file (for CJS): the bin is the single bundled
 *    file dist/index.cjs, one level below the package root; the unbundled
 *    source file src/lib/version.ts is two levels below it
 * 2. Process.cwd() fallback (running from the monorepo root)
 */
export function getVersion(): string {
  // 1. Relative to this file
  try {
    for (const pkgPath of [
      join(__dirname, '..', 'package.json'),
      join(__dirname, '..', '..', 'package.json'),
    ]) {
      const version = readOwnPackageVersion(pkgPath);
      if (version) return version;
    }
  } catch {
    // __dirname is not defined in the ESM build; fall through
  }

  // 2. From CWD (running in monorepo)
  const fromCwd = readOwnPackageVersion(join(process.cwd(), 'packages', 'cli', 'package.json'));
  if (fromCwd) return fromCwd;

  // 3. Fallback version (should rarely happen)
  return '0.0.0-unknown';
}

/**
 * Get runtime string (e.g., "node-22.0.0")
 */
export function getRuntime(): string {
  return `node-${process.version.slice(1)}`;
}

/**
 * Get git commit hash if available
 */
export function getCommit(): string | undefined {
  // Could be enhanced to read from .git or environment variable
  return process.env.GIT_COMMIT ?? process.env.GITHUB_SHA;
}
