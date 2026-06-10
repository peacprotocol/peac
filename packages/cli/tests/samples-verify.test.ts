/**
 * Verifies that CLI-generated valid samples are current PEAC signed
 * interaction records that pass local verification, and that invalid samples
 * remain rejection fixtures.
 *
 * Spawns the built CLI (`samples generate`) and checks the generated records
 * programmatically with verifyLocal() against the generated sandbox JWKS,
 * independent of the `peac verify --public-key` CLI flag (covered by
 * verify-public-key-cli.test.ts). Asserts the event-time semantics (`--now` sets occurred_at, not iat),
 * kid handling, and that a payload-tampered record fails.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLocal } from '@peac/protocol';
import { jwkToPublicKeyBytes, decode } from '@peac/crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', 'dist', 'index.cjs');

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generate(args: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'peac-samples-verify-'));
  execFileSync('node', [CLI_PATH, 'samples', 'generate', '-o', dir, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return dir;
}

/** Run `samples generate` expecting it may fail; returns exit code and dir. */
function generateExit(args: string[]): { code: number; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'peac-samples-verify-'));
  try {
    execFileSync('node', [CLI_PATH, 'samples', 'generate', '-o', dir, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { code: 0, dir };
  } catch (err) {
    return { code: (err as { status?: number }).status ?? -1, dir };
  }
}

function publicKeyFrom(dir: string): Uint8Array {
  const jwks = JSON.parse(readFileSync(join(dir, 'bundles', 'sandbox-jwks.json'), 'utf8'));
  expect(Array.isArray(jwks.keys)).toBe(true);
  expect(jwks.keys.length).toBe(1);
  return jwkToPublicKeyBytes(jwks.keys[0]);
}

describe('CLI-generated samples align with local verification', () => {
  let dir: string;

  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error('CLI not built. Run "pnpm --filter @peac/cli build" first.');
    }
    dir = generate([]);
  });

  it('every generated valid sample passes verifyLocal()', async () => {
    const publicKey = publicKeyFrom(dir);
    const validDir = join(dir, 'valid');
    const files = readdirSync(validDir).filter((f) => f.endsWith('.jws'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const jws = readFileSync(join(validDir, f), 'utf8').trim();
      const result = await verifyLocal(jws, publicKey);
      expect(result.valid, `${f} should verify (got ${result.valid ? 'valid' : result.code})`).toBe(
        true
      );
      // jti is a fresh UUIDv7 assigned by issue() (not a fixed literal).
      const { payload } = decode<{ jti?: string }>(jws);
      expect(typeof payload.jti, `${f} jti`).toBe('string');
      expect(UUIDV7.test(payload.jti as string), `${f} jti shape: ${payload.jti}`).toBe(true);
    }
  });

  it('generates the expected valid record IDs and not the removed long-expiry', () => {
    const files = readdirSync(join(dir, 'valid'));
    for (const id of [
      'basic-record',
      'full-record',
      'mcp-tool-run',
      'payment-event',
      'event-time-record',
    ]) {
      expect(files.includes(`${id}.jws`)).toBe(true);
    }
    expect(files.includes('long-expiry.jws')).toBe(false);
  });

  it('invalid samples remain rejection fixtures', async () => {
    const publicKey = publicKeyFrom(dir);
    const invalidDir = join(dir, 'invalid');
    const files = readdirSync(invalidDir).filter((f) => f.endsWith('.jws'));
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) {
      const jws = readFileSync(join(invalidDir, f), 'utf8').trim();
      const result = await verifyLocal(jws, publicKey);
      expect(result.valid, `${f} must be rejected`).toBe(false);
    }
  });

  it('--now sets occurred_at (event time), not iat (issuance time)', () => {
    const timestamp = 1700000000;
    const nowDir = generate(['--now', String(timestamp)]);
    const jws = readFileSync(join(nowDir, 'valid', 'basic-record.jws'), 'utf8').trim();
    const { payload } = decode<{ occurred_at?: string; iat?: number }>(jws);
    expect(payload.occurred_at).toBe(new Date(timestamp * 1000).toISOString());
    expect(typeof payload.iat).toBe('number');
    expect(payload.iat).not.toBe(timestamp);
  });

  it('--kid is reflected in the generated JWS protected header and JWKS', () => {
    const kid = 'test-key-001';
    const kidDir = generate(['--kid', kid]);
    const jwks = JSON.parse(readFileSync(join(kidDir, 'bundles', 'sandbox-jwks.json'), 'utf8'));
    expect(jwks.keys[0].kid).toBe(kid);
    const jws = readFileSync(join(kidDir, 'valid', 'basic-record.jws'), 'utf8').trim();
    const { header } = decode(jws);
    expect(header.kid).toBe(kid);
  });

  it('rejects a future --now before generating any valid samples', async () => {
    const future = Math.floor(Date.now() / 1000) + 999_999;
    const { code, dir: outDir } = generateExit(['--category', 'valid', '--now', String(future)]);
    expect(code).not.toBe(0);
    // No valid records that fail local verification should have been written.
    const validDir = join(outDir, 'valid');
    const files = existsSync(validDir)
      ? readdirSync(validDir).filter((f) => f.endsWith('.jws'))
      : [];
    expect(files.length).toBe(0);
  });

  it('rejects a non-integer --now', () => {
    const { code } = generateExit(['--now', '1.5']);
    expect(code).not.toBe(0);
  });

  it('rejects an out-of-range --now before writing any files', () => {
    const { code, dir: outDir } = generateExit([
      '--category',
      'valid',
      '--now',
      '-999999999999999',
    ]);
    expect(code).not.toBe(0);
    const validDir = join(outDir, 'valid');
    const files = existsSync(validDir)
      ? readdirSync(validDir).filter((f) => f.endsWith('.jws'))
      : [];
    expect(files.length).toBe(0);
  });

  it('--now 0 succeeds and sets occurred_at to the epoch (not skipped as falsy)', () => {
    const zeroDir = generate(['--category', 'valid', '--now', '0']);
    const jws = readFileSync(join(zeroDir, 'valid', 'basic-record.jws'), 'utf8').trim();
    const { payload } = decode<{ occurred_at?: string; iat?: number }>(jws);
    expect(payload.occurred_at).toBe(new Date(0).toISOString());
    expect(typeof payload.iat).toBe('number');
    expect(payload.iat).not.toBe(0);
  });

  function malformedSamplesDir(): string {
    const root = mkdtempSync(join(tmpdir(), 'peac-bad-samples-'));
    mkdirSync(join(root, 'valid'), { recursive: true });
    writeFileSync(
      join(root, 'valid', 'bad-sample.json'),
      JSON.stringify({ $comment: 'malformed', claims: { iss: 'x' } })
    );
    return root;
  }

  it('a custom --samples dir with only a malformed valid sample yields no samples (no embedded fallback)', () => {
    const out = execFileSync(
      'node',
      [CLI_PATH, 'samples', 'list', '--json', '--samples', malformedSamplesDir()],
      { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
    );
    const data = JSON.parse(out) as { samples: Array<{ id: string }> };
    expect(data.samples).toEqual([]);
    // Crucially, embedded defaults must NOT leak in for an explicit custom path.
    expect(data.samples.some((s) => s.id === 'basic-record')).toBe(false);
  });

  it('generate against a malformed-only custom --samples dir fails (no records written)', () => {
    const { code } = generateExit(['--samples', malformedSamplesDir()]);
    expect(code).not.toBe(0);
  });

  it('a missing custom --samples path fails clearly', () => {
    const missing = join(tmpdir(), 'peac-does-not-exist-xyz', 'nope');
    let code = 0;
    let stderr = '';
    try {
      execFileSync('node', [CLI_PATH, 'samples', 'list', '--samples', missing], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });
    } catch (err) {
      const e = err as { status?: number; stderr?: Buffer | string };
      code = e.status ?? -1;
      stderr = (e.stderr || '').toString();
    }
    expect(code).not.toBe(0);
    expect(stderr).toContain('Samples directory not found');
  });

  it('--category valid generates only valid records and they all verify', async () => {
    const onlyValid = generate(['--category', 'valid']);
    const publicKey = publicKeyFrom(onlyValid);
    const invalidDir = join(onlyValid, 'invalid');
    const invalidFiles = existsSync(invalidDir)
      ? readdirSync(invalidDir).filter((f) => f.endsWith('.jws'))
      : [];
    expect(invalidFiles.length).toBe(0);
    const validFiles = readdirSync(join(onlyValid, 'valid')).filter((f) => f.endsWith('.jws'));
    expect(validFiles.length).toBeGreaterThanOrEqual(5);
    for (const f of validFiles) {
      const jws = readFileSync(join(onlyValid, 'valid', f), 'utf8').trim();
      const result = await verifyLocal(jws, publicKey);
      expect(result.valid, `${f} should verify`).toBe(true);
    }
  });

  it('a payload-tampered record fails verification', async () => {
    const publicKey = publicKeyFrom(dir);
    const jws = readFileSync(join(dir, 'valid', 'basic-record.jws'), 'utf8').trim();
    const parts = jws.split('.');
    // Mutate a character in the middle of the payload segment (changes the
    // signed bytes; not the final signature char, whose low bits are unused).
    const p = parts[1];
    const i = Math.floor(p.length / 2);
    parts[1] = p.slice(0, i) + (p[i] === 'a' ? 'b' : 'a') + p.slice(i + 1);
    const result = await verifyLocal(parts.join('.'), publicKey);
    expect(result.valid).toBe(false);
  });
});
