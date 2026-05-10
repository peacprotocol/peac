/**
 * Unit tests for the package-private file-IO helpers in
 * `packages/cli/src/lib/safe-file.ts`. Each helper covers the success
 * path plus the errno branches that the command-handler call sites
 * discriminate on (`ENOENT`, `EISDIR`, `EEXIST`, `E_PEAC_FILE_TOO_LARGE`).
 *
 * Tests run inside per-test temp directories created via
 * `mkdtempSync` so they do not depend on or mutate any shared state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readFileBufferSnapshot,
  readFileUtf8Snapshot,
  rewriteJsonFileAtomic,
  unlinkIfExists,
  writeFileNoOverwrite,
} from '../src/lib/safe-file.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'peac-cli-safe-file-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readFileUtf8Snapshot', () => {
  it('returns file contents on success', () => {
    const target = join(dir, 'a.txt');
    writeFileSync(target, 'hello\n', 'utf8');

    expect(readFileUtf8Snapshot(target)).toBe('hello\n');
  });

  it('throws ENOENT for a missing file', () => {
    expect(() => readFileUtf8Snapshot(join(dir, 'missing.txt'))).toThrow(
      expect.objectContaining({ code: 'ENOENT' })
    );
  });

  it('throws EISDIR when the path resolves to a directory', () => {
    const subdir = join(dir, 'subdir');
    mkdirSync(subdir);

    expect(() => readFileUtf8Snapshot(subdir)).toThrow(expect.objectContaining({ code: 'EISDIR' }));
  });
});

describe('readFileBufferSnapshot', () => {
  it('returns a buffer on success', () => {
    const target = join(dir, 'binary.bin');
    writeFileSync(target, Buffer.from([0xde, 0xad, 0xbe, 0xef]));

    const buf = readFileBufferSnapshot(target);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(4);
    expect(buf[0]).toBe(0xde);
  });

  it('rejects oversized files with E_PEAC_FILE_TOO_LARGE before reading', () => {
    const target = join(dir, 'big.bin');
    writeFileSync(target, Buffer.alloc(2048));

    expect(() => readFileBufferSnapshot(target, { maxBytes: 1024 })).toThrow(
      expect.objectContaining({ code: 'E_PEAC_FILE_TOO_LARGE' })
    );
  });

  it('accepts files within maxBytes', () => {
    const target = join(dir, 'small.bin');
    writeFileSync(target, Buffer.alloc(512));

    expect(readFileBufferSnapshot(target, { maxBytes: 1024 }).length).toBe(512);
  });

  it('throws ENOENT for a missing file', () => {
    expect(() => readFileBufferSnapshot(join(dir, 'missing.bin'))).toThrow(
      expect.objectContaining({ code: 'ENOENT' })
    );
  });
});

describe('writeFileNoOverwrite', () => {
  it('creates the target file when it does not exist', () => {
    const target = join(dir, 'new.txt');

    writeFileNoOverwrite(target, 'data', { encoding: 'utf8' });

    expect(readFileSync(target, 'utf8')).toBe('data');
  });

  it('throws EEXIST when the target already exists', () => {
    const target = join(dir, 'existing.txt');
    writeFileSync(target, 'pre-existing', 'utf8');

    expect(() => writeFileNoOverwrite(target, 'data')).toThrow(
      expect.objectContaining({ code: 'EEXIST' })
    );
    expect(readFileSync(target, 'utf8')).toBe('pre-existing');
  });

  it('writes Buffer payloads', () => {
    const target = join(dir, 'buf.bin');
    writeFileNoOverwrite(target, Buffer.from([0x01, 0x02, 0x03]));

    const written = readFileSync(target);
    expect(written.length).toBe(3);
    expect(written[1]).toBe(0x02);
  });
});

describe('rewriteJsonFileAtomic', () => {
  it('returns silently when the target does not exist', () => {
    const target = join(dir, 'absent.json');

    rewriteJsonFileAtomic(target, () => {
      throw new Error('mutate must not run when file is absent');
    });

    expect(existsSync(target)).toBe(false);
  });

  it('rewrites an existing config atomically', () => {
    const target = join(dir, 'config.json');
    writeFileSync(target, JSON.stringify({ keep: true, drop_me: 1 }), 'utf8');

    rewriteJsonFileAtomic(target, (config) => {
      delete config.drop_me;
      config.added = 'value';
    });

    const after = JSON.parse(readFileSync(target, 'utf8'));
    expect(after).toEqual({ keep: true, added: 'value' });
  });

  it('does not leave a sibling temp file behind on success', () => {
    const target = join(dir, 'config.json');
    writeFileSync(target, '{"x":1}', 'utf8');

    rewriteJsonFileAtomic(target, (config) => {
      config.x = 2;
    });

    const siblings = readdirSync(dir).filter((name) => name.endsWith('.tmp'));
    expect(siblings).toEqual([]);
  });
});

describe('unlinkIfExists', () => {
  it('removes the file when it exists', () => {
    const target = join(dir, 'doomed.txt');
    writeFileSync(target, 'bye', 'utf8');

    unlinkIfExists(target);

    expect(existsSync(target)).toBe(false);
  });

  it('returns silently when the file does not exist', () => {
    const target = join(dir, 'never-existed.txt');

    expect(() => unlinkIfExists(target)).not.toThrow();
    expect(existsSync(target)).toBe(false);
  });

  // chmod semantics differ on Windows; the unlink-EACCES path is POSIX-only.
  it.skipIf(process.platform === 'win32')('propagates errors other than ENOENT', () => {
    const subdir = join(dir, 'locked');
    mkdirSync(subdir);
    const target = join(subdir, 'inside.txt');
    writeFileSync(target, 'data');
    chmodSync(subdir, 0o500); // read+exec only; cannot remove children

    try {
      expect(() => unlinkIfExists(target)).toThrow();
    } finally {
      chmodSync(subdir, 0o700);
    }
  });
});
