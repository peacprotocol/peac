/**
 * Internal file-IO helpers for @peac/cli command handlers.
 *
 * Package-private; not exported from any package barrel and not part of
 * the public CLI API. Mirrors the syscall-style conventions already in
 * use in `output-preflight.ts`: named imports from `node:fs`,
 * fd-bound reads, errno discrimination via `NodeJS.ErrnoException`, and
 * `closeSync` always wrapped in `try`/`finally` with secondary errors
 * swallowed so they do not mask the primary error.
 *
 * The helpers exist to remove TOCTOU patterns where an existence probe
 * (`existsSync` / `accessSync` / `statSync`) is followed by a file
 * operation (`readFileSync` / `writeFileSync` / `openSync` / `unlinkSync`)
 * on the same path. The atomic alternative is a single syscall that
 * discriminates outcome via errno: success means the operation worked;
 * `ENOENT` means the file is missing; `EACCES` means the file is
 * unreadable / unwritable; `EISDIR` / `ENOTDIR` means the path is the
 * wrong type.
 *
 * Each helper takes a path string. Internal use of file descriptors is
 * hidden from the caller. Callers receive plain return values on success
 * and `NodeJS.ErrnoException`-shaped errors on failure that they can
 * inspect via `e.code === 'ENOENT' | 'EACCES' | 'EEXIST' | 'EISDIR' |
 * 'ENOTDIR'` and translate into user-facing wording.
 */

import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Read the entire file at `path` as a UTF-8 string via a single
 * fd-bound `open`/`fstat`/`read`/`close` sequence.
 *
 * Throws an `ErrnoException`-shaped error on failure. Callers
 * discriminate via `e.code`:
 *   - `ENOENT`: file does not exist
 *   - `EISDIR`: path resolves to a directory
 *   - `EACCES`: not readable
 */
export function readFileUtf8Snapshot(path: string): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, fsConstants.O_RDONLY);
    const stat = fstatSync(fd);
    if (stat.isDirectory()) {
      throw makeErrnoError('EISDIR', `is a directory: ${path}`);
    }
    return readFileSync(fd, 'utf8');
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore close-on-cleanup errors
      }
    }
  }
}

/**
 * Read the entire file at `path` as a `Buffer` via a single fd-bound
 * `open`/`fstat`/`read`/`close` sequence. Optionally enforces a maximum
 * byte size. The size limit is checked twice: once against the `fstat`
 * size before reading (cheap fast-fail) and once against the actual
 * read length (defends against the file growing between `fstat` and the
 * subsequent `readFileSync`).
 *
 * Throws on failure:
 *   - `ENOENT`: file does not exist
 *   - `EISDIR`: path resolves to a directory
 *   - `EACCES`: not readable
 *   - `E_PEAC_FILE_TOO_LARGE`: file exceeds `options.maxBytes`
 */
export function readFileBufferSnapshot(path: string, options?: { maxBytes?: number }): Buffer {
  let fd: number | undefined;
  try {
    fd = openSync(path, fsConstants.O_RDONLY);
    const stat = fstatSync(fd);
    if (stat.isDirectory()) {
      throw makeErrnoError('EISDIR', `is a directory: ${path}`);
    }
    if (options?.maxBytes !== undefined && stat.size > options.maxBytes) {
      throw makeFileTooLargeError(path, stat.size, options.maxBytes);
    }
    const data = readFileSync(fd);
    if (options?.maxBytes !== undefined && data.length > options.maxBytes) {
      throw makeFileTooLargeError(path, data.length, options.maxBytes);
    }
    return data;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore close-on-cleanup errors
      }
    }
  }
}

function makeFileTooLargeError(
  path: string,
  actualSize: number,
  maxBytes: number
): NodeJS.ErrnoException & { actualSize?: number; maxBytes?: number } {
  const err = new Error(
    `file size ${actualSize} bytes exceeds limit ${maxBytes} bytes: ${path}`
  ) as NodeJS.ErrnoException & { actualSize?: number; maxBytes?: number };
  err.code = 'E_PEAC_FILE_TOO_LARGE';
  err.actualSize = actualSize;
  err.maxBytes = maxBytes;
  return err;
}

/**
 * Write `data` to `path` atomically without overwriting an existing
 * file. Uses POSIX `O_CREAT | O_EXCL | O_WRONLY` semantics via Node's
 * `'wx'` flag. The path either gets created with the supplied content
 * or the call throws `EEXIST`.
 *
 * Callers translate `EEXIST` into user-facing wording (e.g. "use --force
 * to overwrite").
 */
export function writeFileNoOverwrite(
  path: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding; mode?: number }
): void {
  const encoding: BufferEncoding | null =
    typeof data === 'string' ? (options?.encoding ?? 'utf8') : null;
  writeFileSync(path, data, {
    encoding,
    flag: 'wx',
    mode: options?.mode,
  });
}

/**
 * Rewrite a JSON config file atomically. If the file does not exist
 * (ENOENT), returns silently: there is no config to rewrite. Otherwise
 * the existing content is parsed, `mutate(config)` is invoked, and the
 * mutated config is written via a sibling temp file plus
 * `renameSync`. The final target path is never partially written.
 *
 * Existing file permissions on the target are preserved across the
 * rename. If the existing mode cannot be observed, the temp file is
 * created with a restrictive `0o600` fallback so a config rewrite never
 * accidentally widens the permission set.
 *
 * Cleans up the temp file if rename fails. Read failures other than
 * `ENOENT` propagate to the caller.
 */
export function rewriteJsonFileAtomic(
  path: string,
  mutate: (config: Record<string, unknown>) => void
): void {
  let raw: string;
  let preservedMode = 0o600;
  let fd: number | undefined;
  try {
    fd = openSync(path, fsConstants.O_RDONLY);
    const stat = fstatSync(fd);
    if (stat.isDirectory()) {
      throw makeErrnoError('EISDIR', `is a directory: ${path}`);
    }
    const observedMode = stat.mode & 0o777;
    if (observedMode !== 0) preservedMode = observedMode;
    raw = readFileSync(fd, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore close-on-cleanup errors
      }
    }
  }

  const config = JSON.parse(raw) as Record<string, unknown>;

  mutate(config);

  const parent = dirname(path);
  const tempName = `.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}.tmp`;
  const tempPath = join(parent, tempName);

  try {
    writeFileSync(tempPath, JSON.stringify(config, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
      mode: preservedMode,
    });
    renameSync(tempPath, path);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      // best-effort temp cleanup; ignore secondary errors
    }
    throw err;
  }
}

/**
 * Remove the file at `path` if it exists. Swallows `ENOENT`. All
 * other errors propagate to the caller.
 */
export function unlinkIfExists(path: string): void {
  try {
    unlinkSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

function makeErrnoError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}
