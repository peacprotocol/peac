/**
 * CLI Version Utility
 *
 * Reads version from package.json at runtime to avoid hardcoding.
 */

import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Get CLI version from package.json
 *
 * Uses multiple strategies to find package.json:
 * 1. __dirname relative path (for CJS)
 * 2. Process.cwd() fallback
 */
export function getVersion(): string {
  // Strategy 1: Try relative path from this file (dist/lib/version.js -> package.json)
  try {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Try from CWD (running in monorepo)
  try {
    const pkgPath = join(process.cwd(), 'packages', 'cli', 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {
    // Continue to fallback
  }

  // Strategy 3: Fallback version (should rarely happen)
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
