/**
 * Race-free output-path writability preflight (neutral, surface-agnostic).
 *
 * Used by every CLI surface that supports `--output <file>` to verify the
 * target path is writable BEFORE doing any side-effecting work (spawning a
 * child process, loading an issuer key, signing, etc.). A record-producing
 * wrapper must never do that work only to discover the record cannot be
 * persisted.
 *
 * The preflight is deliberately non-invasive on the final target path:
 *   - if the final target exists, open it for append/write check and
 *     close it; never unlink the existing target
 *   - if the final target does NOT exist, create a uniquely-named
 *     sibling temp file in the parent directory with O_EXCL and
 *     immediately unlink that temp file; the final target path is
 *     not created or touched until the actual write step
 *
 * Result: between preflight and the eventual write, the CLI has NOT
 * created or modified the final output path. Concurrent observers cannot
 * race against a transient zero-byte target file produced by the preflight.
 */

import { closeSync, constants as fsConstants, openSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Verify that `--output <file>` will be writable. Returns null on
 * success; otherwise an error message suitable for pairing with
 * `cli.output_write_failed`.
 */
export function preflightOutputWritable(output: string): string | null {
  if (output === '-' || output === '') return null;
  const absPath = pathResolve(output);
  const parent = dirname(absPath);
  try {
    const st = statSync(parent);
    if (!st.isDirectory()) {
      return `parent path '${parent}' is not a directory`;
    }
  } catch (err) {
    return `parent directory '${parent}' does not exist (${(err as NodeJS.ErrnoException)?.code ?? (err instanceof Error ? err.message : String(err))})`;
  }

  // Race-free target discrimination. We do NOT call existsSync() before
  // open() because that introduces a TOCTOU window between the check and
  // the use. Instead we open the path for append WITHOUT O_CREAT: a
  // successful open proves the file exists and is writable; an ENOENT
  // error proves the file does not exist; any other errno surfaces a
  // real preflight failure. The single open() syscall makes the
  // discrimination atomic.
  let existingFd: number | undefined;
  try {
    existingFd = openSync(absPath, fsConstants.O_WRONLY | fsConstants.O_APPEND);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      return `cannot open '${absPath}' for write (${code ?? (err instanceof Error ? err.message : String(err))})`;
    }
    // ENOENT: target does not exist. Fall through to the temp-file probe.
  }
  if (existingFd !== undefined) {
    try {
      closeSync(existingFd);
    } catch {
      // ignore
    }
    return null;
  }

  // Missing target: probe writability via a uniquely-named sibling temp
  // file, then immediately unlink the temp file. The final target path
  // is NOT touched.
  const tempName = `.peac-preflight-${randomBytes(8).toString('hex')}.tmp`;
  const tempPath = join(parent, tempName);
  let fd: number | undefined;
  try {
    fd = openSync(tempPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
  } catch (err) {
    return `parent directory '${parent}' is not writable (${(err as NodeJS.ErrnoException)?.code ?? (err instanceof Error ? err.message : String(err))})`;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
  try {
    unlinkSync(tempPath);
  } catch {
    // not fatal; the temp file will linger but the final target was
    // never touched and the eventual write will succeed.
  }
  return null;
}
