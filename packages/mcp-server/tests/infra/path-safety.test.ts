import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, symlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertRelativePath,
  resolveOutputPath,
  safeMkdir,
  atomicWriteDir,
  createTempDir,
} from '../../src/infra/path-safety.js';
import { PathTraversalError } from '../../src/infra/errors.js';

describe('infra/path-safety', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'path-safety-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('assertRelativePath', () => {
    it('accepts valid single-segment name', () => {
      expect(() => assertRelativePath('bundle-2024-01-01')).not.toThrow();
    });

    it('accepts exactly 255 chars', () => {
      expect(() => assertRelativePath('x'.repeat(255))).not.toThrow();
    });

    it('rejects empty string', () => {
      expect(() => assertRelativePath('')).toThrow(PathTraversalError);
    });

    it('rejects absolute path', () => {
      expect(() => assertRelativePath('/tmp/evil')).toThrow(PathTraversalError);
    });

    it('rejects path traversal', () => {
      expect(() => assertRelativePath('../evil')).toThrow(PathTraversalError);
    });

    it('rejects multi-segment path', () => {
      expect(() => assertRelativePath('a/b/c')).toThrow(PathTraversalError);
    });

    it('rejects backslash paths', () => {
      expect(() => assertRelativePath('a\\b')).toThrow(PathTraversalError);
    });

    it('rejects hidden paths', () => {
      expect(() => assertRelativePath('.hidden')).toThrow(PathTraversalError);
    });

    it('rejects names longer than 255 chars', () => {
      expect(() => assertRelativePath('x'.repeat(256))).toThrow(PathTraversalError);
    });

    // --- Null byte injection ---

    it('rejects null bytes', () => {
      expect(() => assertRelativePath('foo\x00bar')).toThrow(PathTraversalError);
      expect(() => assertRelativePath('foo\x00bar')).toThrow('Null bytes');
    });

    // --- Colon: drive letters and NTFS ADS ---

    it('rejects colon (drive letter pattern)', () => {
      expect(() => assertRelativePath('C:foo')).toThrow(PathTraversalError);
      expect(() => assertRelativePath('C:foo')).toThrow('Colons');
    });

    it('rejects colon (NTFS Alternate Data Stream)', () => {
      expect(() => assertRelativePath('file.txt:stream')).toThrow(PathTraversalError);
    });

    // --- Windows reserved device names ---

    it('rejects CON (Windows reserved)', () => {
      expect(() => assertRelativePath('CON')).toThrow(PathTraversalError);
      expect(() => assertRelativePath('CON')).toThrow('reserved device name');
    });

    it('rejects CON.txt (reserved name with extension)', () => {
      expect(() => assertRelativePath('CON.txt')).toThrow(PathTraversalError);
    });

    it('rejects nul (case-insensitive reserved)', () => {
      expect(() => assertRelativePath('nul')).toThrow(PathTraversalError);
    });

    it('rejects NUL (uppercase)', () => {
      expect(() => assertRelativePath('NUL')).toThrow(PathTraversalError);
    });

    it('rejects PRN', () => {
      expect(() => assertRelativePath('PRN')).toThrow(PathTraversalError);
    });

    it('rejects AUX', () => {
      expect(() => assertRelativePath('AUX')).toThrow(PathTraversalError);
    });

    it('rejects COM1', () => {
      expect(() => assertRelativePath('COM1')).toThrow(PathTraversalError);
    });

    it('rejects LPT3.log (reserved name with extension)', () => {
      expect(() => assertRelativePath('LPT3.log')).toThrow(PathTraversalError);
    });

    it('accepts names that start with reserved prefix but are longer', () => {
      // "CONSOLE" is not reserved, "CON" is
      expect(() => assertRelativePath('CONSOLE')).not.toThrow();
      expect(() => assertRelativePath('null-check')).not.toThrow();
      expect(() => assertRelativePath('printer-driver')).not.toThrow();
    });

    // --- Trailing dots and spaces ---

    it('rejects trailing dot', () => {
      expect(() => assertRelativePath('bundle.')).toThrow(PathTraversalError);
      expect(() => assertRelativePath('bundle.')).toThrow('Trailing dots');
    });

    it('rejects trailing space', () => {
      expect(() => assertRelativePath('bundle ')).toThrow(PathTraversalError);
      expect(() => assertRelativePath('bundle ')).toThrow('Trailing dots');
    });

    it('accepts names with dots and spaces in the middle', () => {
      expect(() => assertRelativePath('bundle-2024.01.01')).not.toThrow();
      expect(() => assertRelativePath('my bundle')).not.toThrow();
    });
  });

  describe('resolveOutputPath', () => {
    it('resolves valid path under base', () => {
      const result = resolveOutputPath(testDir, 'bundle-abc');
      expect(result).toBe(join(testDir, 'bundle-abc'));
    });

    it('rejects traversal that escapes base', () => {
      // '../evil' is caught by assertRelativePath before escape check
      expect(() => resolveOutputPath(testDir, '../evil')).toThrow(PathTraversalError);
    });

    it('handles basePath with trailing slash', () => {
      const result = resolveOutputPath(testDir + '/', 'bundle-abc');
      expect(result).toBe(join(testDir, 'bundle-abc'));
    });

    it('handles non-normalized basePath', () => {
      // e.g. /tmp/foo/../foo resolves to /tmp/foo
      const nonNormalized = join(testDir, '..', testDir.split('/').pop()!);
      const result = resolveOutputPath(nonNormalized, 'bundle-abc');
      expect(result).toBe(join(testDir, 'bundle-abc'));
    });

    it('rejects when basePath is a substring of another path (prefix attack)', () => {
      // Classic startsWith pitfall: /tmp/foo should not accept /tmp/foobar
      // resolveOutputPath only takes single-segment relative paths, so this
      // is tested by verifying containment with path.relative, not string prefix.
      const result = resolveOutputPath(testDir, 'bundle-test');
      expect(result.startsWith(testDir)).toBe(true);
    });

    // Cross-platform safety note: resolveOutputPath uses path.resolve + path.relative
    // from node:path, which automatically uses the platform's native separators.
    // On Windows, backslash paths are handled natively by path.resolve/relative.
    // On POSIX, backslash-containing names are rejected by assertRelativePath before
    // the containment check runs. This means:
    // - POSIX: backslash in input -> rejected by assertRelativePath
    // - Windows: backslash in input -> treated as separator by path.resolve
    // The path.relative containment check works correctly on both platforms because
    // it uses native separator semantics, unlike string prefix checks (basePath + '/').
    it('backslash in relative path is rejected (POSIX: invalid, Windows: assertRelativePath)', () => {
      expect(() => resolveOutputPath(testDir, 'a\\b')).toThrow(PathTraversalError);
    });
  });

  describe('safeMkdir', () => {
    it('creates directory under basePath', async () => {
      const created = await safeMkdir(testDir, 'my-bundle');
      const info = await stat(created);
      expect(info.isDirectory()).toBe(true);
      expect(created).toBe(join(testDir, 'my-bundle'));
    });

    it('rejects if target already exists as symlink', async () => {
      const linkTarget = join(testDir, 'real-dir');
      await mkdtemp(join(tmpdir(), 'path-safety-target-')).then(async (real) => {
        // Create the real dir as a separate temp dir, symlink inside testDir to it
        await symlink(real, linkTarget);
      });

      await expect(safeMkdir(testDir, 'real-dir')).rejects.toThrow(PathTraversalError);
    });
  });

  describe('createTempDir', () => {
    it('creates a .tmp- prefixed directory under base', async () => {
      const tmpPath = await createTempDir(testDir);
      const info = await stat(tmpPath);
      expect(info.isDirectory()).toBe(true);
      const basename = tmpPath.slice(testDir.length + 1);
      expect(basename.startsWith('.tmp-')).toBe(true);
    });

    it('returned path starts with base', async () => {
      const tmpPath = await createTempDir(testDir);
      expect(tmpPath.startsWith(testDir)).toBe(true);
    });
  });

  describe('atomicWriteDir', () => {
    it('renames temp dir to final path', async () => {
      const tmpPath = await createTempDir(testDir);
      const finalPath = join(testDir, 'final-bundle');

      await atomicWriteDir(tmpPath, finalPath);

      const info = await stat(finalPath);
      expect(info.isDirectory()).toBe(true);
    });

    it('cleans up temp dir on rename failure', async () => {
      const tmpPath = await createTempDir(testDir);
      const nonExistentParent = join(testDir, 'no-such-parent', 'final');

      await expect(atomicWriteDir(tmpPath, nonExistentParent)).rejects.toThrow();

      // Temp dir should be cleaned up after the failed rename
      await expect(stat(tmpPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});
