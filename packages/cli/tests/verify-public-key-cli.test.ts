/**
 * CLI wiring tests for `peac verify --public-key <path>`.
 *
 * Spawns the built CLI to prove the offline flag works end-to-end against
 * generated samples: a valid record verifies (exit 0), a tampered record
 * fails (non-zero), unusable key files (private material, oversized,
 * directory, missing) are rejected, and bounded receipt-file reads reject
 * oversized files and directory paths with user-safe messages.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Resolve the built CLI whether vitest runs with the package root or the
// repository root as cwd.
const PKG_ROOT = existsSync(join(process.cwd(), 'dist', 'index.cjs'))
  ? process.cwd()
  : join(process.cwd(), 'packages', 'cli');
const CLI_PATH = join(PKG_ROOT, 'dist', 'index.cjs');
const SPAWN_TIMEOUT_MS = 15_000;

interface CliResult {
  status: number;
  stdout: string;
}

function runVerify(args: string[]): CliResult {
  try {
    const stdout = execFileSync('node', [CLI_PATH, 'verify', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    });
    return { status: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '' };
  }
}

let samplesDir: string;
let validJwsPath: string;
let jwksPath: string;

beforeAll(() => {
  samplesDir = mkdtempSync(join(tmpdir(), 'peac-verify-pk-'));
  execFileSync('node', [CLI_PATH, 'samples', 'generate', '-o', samplesDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
  });
  validJwsPath = join(samplesDir, 'valid', 'basic-record.jws');
  jwksPath = join(samplesDir, 'bundles', 'sandbox-jwks.json');
});

afterAll(() => {
  rmSync(samplesDir, { recursive: true, force: true });
});

describe('peac verify --public-key (CLI wiring)', () => {
  it('verifies a valid sample offline with the sandbox JWKS', () => {
    const { status, stdout } = runVerify([validJwsPath, '--public-key', jwksPath]);
    expect(status).toBe(0);
    expect(stdout).toContain('Signature valid (offline)');
  });

  it('fails on a tampered record', () => {
    const jws = readFileSync(validJwsPath, 'utf8').trim();
    // Flip a mid-signature character: the final base64url character of an
    // Ed25519 signature carries 4 ignored padding bits, so tampering there
    // can decode to identical bytes. A mid-segment flip always changes the
    // signature.
    const i = jws.length - 10;
    const tampered = `${jws.slice(0, i)}${jws[i] === 'x' ? 'y' : 'x'}${jws.slice(i + 1)}`;
    const tamperedPath = join(samplesDir, 'tampered.jws');
    writeFileSync(tamperedPath, tampered);

    const { status, stdout } = runVerify([tamperedPath, '--public-key', jwksPath]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('E_INVALID_SIGNATURE');
  });

  it('rejects a key file containing private key material', () => {
    const privatePath = join(samplesDir, 'private.jwk.json');
    writeFileSync(
      privatePath,
      JSON.stringify({
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.alloc(32, 7).toString('base64url'),
        d: Buffer.alloc(32, 9).toString('base64url'),
      })
    );

    const { status, stdout } = runVerify([validJwsPath, '--public-key', privatePath]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('private key material');
  });

  it('rejects an oversized key file', () => {
    const bigPath = join(samplesDir, 'big-key.json');
    writeFileSync(bigPath, `{"pad":"${'x'.repeat(20_000)}"}`);

    const { status, stdout } = runVerify([validJwsPath, '--public-key', bigPath]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('exceeds');
  });

  it('rejects a directory as the key path', () => {
    const { status, stdout } = runVerify([validJwsPath, '--public-key', samplesDir]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('directory');
  });

  it('rejects a missing key path', () => {
    const missingPath = join(samplesDir, 'does-not-exist.json');
    const { status, stdout } = runVerify([validJwsPath, '--public-key', missingPath]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('could not read public key file');
  });
});

describe('peac verify receipt-file input (bounded reads)', () => {
  it('rejects an oversized receipt file', () => {
    const bigJwsPath = join(samplesDir, 'big-receipt.jws');
    writeFileSync(bigJwsPath, 'a'.repeat(600 * 1024));

    const { status, stdout } = runVerify([bigJwsPath, '--public-key', jwksPath]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('receipt file exceeds');
  });

  it('rejects a directory as the receipt path', () => {
    const { status, stdout } = runVerify([samplesDir, '--public-key', jwksPath]);
    expect(status).not.toBe(0);
    expect(stdout).toContain('receipt path is a directory');
  });
});
