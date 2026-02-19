/**
 * TOCTOU-hardened filesystem utilities for bundle creation
 *
 * All path operations validate against symlink injection and traversal.
 * Zero MCP SDK imports (DD-57).
 */

import { lstat, mkdir, rename, rm, mkdtemp } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PathTraversalError } from './errors.js';

/**
 * Assert that a path is a safe single-segment relative name.
 *
 * v1 restriction: no nested directories (single path segment only).
 * Rejects absolute paths, `..`, empty strings, multi-segment paths, and names >255 chars.
 */
export function assertRelativePath(p: string): void {
  if (!p || p.trim().length === 0) {
    throw new PathTraversalError('Path must not be empty');
  }

  if (isAbsolute(p)) {
    throw new PathTraversalError('Absolute paths are not allowed');
  }

  // Normalize to detect .. traversal
  const normalized = normalize(p);
  if (normalized.startsWith('..') || normalized.includes('/..') || normalized.includes('\\..')) {
    throw new PathTraversalError('Path traversal (..) is not allowed');
  }

  // v1: single segment only -- no slashes
  if (p.includes('/') || p.includes('\\')) {
    throw new PathTraversalError('Nested directories are not allowed (single segment only)');
  }

  if (p.length > 255) {
    throw new PathTraversalError(`Path segment exceeds 255 characters (got ${p.length})`);
  }

  // Reject hidden files/dirs
  if (p.startsWith('.')) {
    throw new PathTraversalError('Hidden paths (starting with .) are not allowed');
  }
}

/**
 * Validate and resolve an output path within a base directory.
 * Does NOT create the directory -- only validates and returns the resolved path.
 */
export function resolveOutputPath(basePath: string, relativePath: string): string {
  assertRelativePath(relativePath);

  const normalizedBase = resolve(basePath);
  const resolved = resolve(normalizedBase, relativePath);

  // Defense-in-depth: use path.relative to check containment.
  // If the resolved path escapes basePath, relative() produces a string
  // starting with '..' -- this is cross-platform safe unlike string prefix checks.
  const rel = relative(normalizedBase, resolved);
  if (rel.startsWith('..') || rel.startsWith('/') || isAbsolute(rel)) {
    throw new PathTraversalError('Resolved path escapes base directory');
  }

  return resolved;
}

/**
 * Check that a path component is not a symlink.
 * Throws PathTraversalError if the component is a symlink.
 */
async function assertNotSymlink(componentPath: string): Promise<void> {
  try {
    const stats = await lstat(componentPath);
    if (stats.isSymbolicLink()) {
      throw new PathTraversalError(`Symlink detected at ${componentPath}`);
    }
  } catch (err) {
    if (err instanceof PathTraversalError) throw err;
    // ENOENT is fine -- the component doesn't exist yet
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}

/**
 * Create a directory under basePath with per-component symlink checks.
 * Returns the resolved path of the created directory.
 */
export async function safeMkdir(basePath: string, relativePath: string): Promise<string> {
  const resolved = resolveOutputPath(basePath, relativePath);

  // Check base path itself is not a symlink
  await assertNotSymlink(basePath);

  // Check that target does not already exist as a symlink
  await assertNotSymlink(resolved);

  await mkdir(resolved, { recursive: false, mode: 0o700 });
  return resolved;
}

/**
 * Atomically move a temp directory to a final path.
 * Uses rename() which is atomic on the same filesystem.
 * Cleans up temp dir on failure.
 */
export async function atomicWriteDir(tempDir: string, finalPath: string): Promise<void> {
  try {
    await rename(tempDir, finalPath);
  } catch (err) {
    // Clean up temp dir on failure
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
}

/**
 * Create a temporary directory under basePath.
 * Uses a `.tmp-<uuid>` prefix to avoid collisions.
 */
export async function createTempDir(basePath: string): Promise<string> {
  await assertNotSymlink(basePath);
  const prefix = join(basePath, `.tmp-${randomUUID().slice(0, 8)}-`);
  return mkdtemp(prefix);
}
