/**
 * Conformance Digest Computation
 *
 * Handles SHA-256 hashing, JCS canonicalization, and vectors digest computation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { canonicalize } from '@peac/crypto';

/**
 * Compute SHA-256 digest of a string
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Convert Zod path array to JSON Pointer (RFC 6901)
 *
 * @param path - Array of path segments from Zod (string for keys, number for array indices)
 * @returns JSON Pointer string (e.g., "/auth/attestations/0/issued_at")
 */
export function zodPathToJsonPointer(path: (string | number)[]): string {
  if (path.length === 0) return '';

  return (
    '/' +
    path
      .map((segment) => {
        const str = String(segment);
        // RFC 6901 escaping: ~ -> ~0, / -> ~1
        return str.replace(/~/g, '~0').replace(/\//g, '~1');
      })
      .join('/')
  );
}

/**
 * Compute canonical input digest using JCS (RFC 8785)
 *
 * Uses JSON Canonicalization Scheme for deterministic serialization,
 * ensuring consistent digests across implementations regardless of
 * JSON key ordering from JSON.parse.
 *
 * @returns Object with alg and value (alg differs if fallback was used)
 */
export function computeCanonicalDigest(input: unknown): { alg: string; value: string } {
  try {
    const canonical = canonicalize(input);
    return { alg: 'sha-256+jcs', value: sha256(canonical) };
  } catch {
    // Fallback to JSON.stringify if canonicalize fails (e.g., for non-JSON values)
    // Use different alg to indicate fallback was used
    return { alg: 'sha-256+json', value: sha256(JSON.stringify(input)) };
  }
}

/**
 * File extensions to include in vectors digest
 *
 * This allowlist ensures we capture all conformance-relevant files:
 * - .json: Fixtures, manifests, JWKS
 * - .txt: Policy files (peac.txt)
 * - .jwks: JWKS key files
 * - .pem: PEM-encoded keys
 * - .zip: Bundle archives (if used)
 */
const VECTORS_FILE_EXTENSIONS = new Set(['.json', '.txt', '.jwks', '.pem', '.zip']);

/**
 * Files to exclude from vectors digest
 */
const VECTORS_EXCLUDE_FILES = new Set(['.DS_Store', '.gitkeep', 'Thumbs.db']);

/**
 * Recursively collect all conformance-relevant files in a directory
 */
function collectFilesRecursive(
  dir: string,
  basePath: string = ''
): Array<{ relativePath: string; content: string }> {
  const files: Array<{ relativePath: string; content: string }> = [];

  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip excluded files
    if (VECTORS_EXCLUDE_FILES.has(entry.name)) continue;

    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      files.push(...collectFilesRecursive(fullPath, relativePath));
    } else {
      // Check if extension is in allowlist
      const ext = path.extname(entry.name).toLowerCase();
      if (VECTORS_FILE_EXTENSIONS.has(ext)) {
        files.push({
          relativePath,
          content: fs.readFileSync(fullPath, 'utf8'),
        });
      }
    }
  }

  return files;
}

/**
 * Compute comprehensive vectors digest by hashing all fixture files
 *
 * VECTORS DIGEST CONTRACT (NORMATIVE):
 * ====================================
 *
 * 1. FILE SELECTION:
 *    - INCLUDES: manifest.json (if present) at root level
 *    - INCLUDES: All files in category directories with extensions: .json, .txt, .jwks, .pem, .zip
 *    - EXCLUDES: .DS_Store, .gitkeep, Thumbs.db
 *
 * 2. RECURSION:
 *    - Hashes files in nested directories (e.g., bundle/vectors/*.json)
 *
 * 3. ORDERING:
 *    - All files sorted lexicographically by normalized relative path
 *    - Path separator is always forward slash (/)
 *    - Comparison uses default string comparison (ASCII/Unicode code point order)
 *
 * 4. HASH INPUT FORMAT (per file):
 *    - relativePath + NUL byte (\x00) + sha256(fileBytes)
 *    - relativePath uses forward slashes, no leading slash
 *    - fileBytes are raw bytes, NO newline normalization
 *
 * 5. FINAL DIGEST:
 *    - SHA-256 of all concatenated (path + NUL + hash) entries
 *    - Reported as lowercase hex string
 *
 * This contract ensures:
 * - Digest changes when any fixture content changes
 * - Digest is reproducible across platforms
 * - Digest can be verified by other implementations
 */
export function computeVectorsDigest(fixturesDir: string, categories: string[]): string {
  const hash = createHash('sha256');
  const allFiles: Array<{ relativePath: string; content: string }> = [];

  // Include manifest.json if present (it's part of the conformance vectors)
  const manifestPath = path.join(fixturesDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    allFiles.push({
      relativePath: 'manifest.json',
      content: fs.readFileSync(manifestPath, 'utf8'),
    });
  }

  // Sort categories for determinism
  const sortedCategories = [...categories].sort();

  for (const cat of sortedCategories) {
    const categoryPath = path.join(fixturesDir, cat);
    // Recursively collect all conformance-relevant files in the category
    const categoryFiles = collectFilesRecursive(categoryPath, cat);
    allFiles.push(...categoryFiles);
  }

  // Sort all files by relative path for deterministic ordering
  allFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const file of allFiles) {
    const fileHash = sha256(file.content);
    // Hash: relativePath + NUL + fileHash
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(fileHash);
  }

  return hash.digest('hex');
}
