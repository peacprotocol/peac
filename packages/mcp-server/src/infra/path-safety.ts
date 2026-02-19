/**
 * TOCTOU-hardened filesystem utilities for bundle creation
 *
 * All path operations validate against symlink injection and traversal.
 * Zero MCP SDK imports (DD-57).
 */

import { lstat, mkdir, rename, rm, mkdtemp } from 'node:fs/promises';
import * as nodePath from 'node:path';
import { randomUUID } from 'node:crypto';
import { PathTraversalError } from './errors.js';

/**
 * Windows reserved device names (case-insensitive, even with extensions).
 * Windows treats CON, CON.txt, NUL, PRN, COM1..COM9, LPT1..LPT9 as special.
 */
const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/**
 * Assert that a path is a safe single-segment relative name.
 *
 * v1 restriction: no nested directories (single path segment only).
 * Rejects absolute paths, `..`, empty strings, multi-segment paths, names >255 chars,
 * null bytes, colons (drive letters, NTFS ADS), Windows reserved device names,
 * and trailing dots/spaces (Windows normalizes these).
 */
export function assertRelativePath(p: string): void {
  if (!p || p.trim().length === 0) {
    throw new PathTraversalError('Path must not be empty');
  }

  // Reject null bytes (injection vector)
  if (p.includes('\0')) {
    throw new PathTraversalError('Null bytes are not allowed in paths');
  }

  // Reject colons (blocks drive letters C: and NTFS ADS file.txt:stream)
  if (p.includes(':')) {
    throw new PathTraversalError('Colons are not allowed in paths (drive letters, NTFS ADS)');
  }

  if (nodePath.isAbsolute(p)) {
    throw new PathTraversalError('Absolute paths are not allowed');
  }

  // Normalize to detect .. traversal
  const normalized = nodePath.normalize(p);
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

  // Reject trailing dots and spaces (Windows normalizes these, causing confusion)
  if (p.endsWith('.') || p.endsWith(' ')) {
    throw new PathTraversalError('Trailing dots and spaces are not allowed');
  }

  // Reject Windows reserved device names (case-insensitive, even with extensions)
  // Check the base name before the first dot: "CON.txt" -> "con"
  const dotIndex = p.indexOf('.');
  const baseName = (dotIndex >= 0 ? p.slice(0, dotIndex) : p).toLowerCase();
  if (WINDOWS_RESERVED_NAMES.has(baseName)) {
    throw new PathTraversalError(`Windows reserved device name: ${baseName.toUpperCase()}`);
  }
}

/**
 * Validate and resolve an output path within a base directory.
 * Does NOT create the directory -- only validates and returns the resolved path.
 */
export function resolveOutputPath(basePath: string, relativePath: string): string {
  assertRelativePath(relativePath);

  const normalizedBase = nodePath.resolve(basePath);
  const resolved = nodePath.resolve(normalizedBase, relativePath);

  // Defense-in-depth: use path.relative to check containment.
  // If the resolved path escapes basePath, relative() produces a string
  // starting with '..' -- this is cross-platform safe unlike string prefix checks.
  const rel = nodePath.relative(normalizedBase, resolved);
  if (rel.startsWith('..') || rel.startsWith('/') || nodePath.isAbsolute(rel)) {
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
  const prefix = nodePath.join(basePath, `.tmp-${randomUUID().slice(0, 8)}-`);
  return mkdtemp(prefix);
}
