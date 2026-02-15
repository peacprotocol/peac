/**
 * @peac/adapter-openclaw - Keygen Tests
 *
 * Tests for Ed25519 signing key generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateSigningKey, keygenCli } from '../src/keygen.js';

// =============================================================================
// Test Helpers
// =============================================================================

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-keygen-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// Tests
// =============================================================================

describe('generateSigningKey', () => {
  it('generates a valid Ed25519 keypair', async () => {
    const result = await generateSigningKey({ outputDir: tmpDir });

    expect(result.kid).toBeDefined();
    expect(result.kid.length).toBeGreaterThan(0);
    expect(result.keyPath).toBe(path.join(tmpDir, 'signing-key.jwk'));
    expect(result.publicJwk.kty).toBe('OKP');
    expect(result.publicJwk.crv).toBe('Ed25519');
    expect(result.publicJwk.x).toBeDefined();
    expect(result.publicJwk.kid).toBe(result.kid);
    expect(result.publicJwk.alg).toBe('EdDSA');
    expect(result.publicJwk.use).toBe('sig');

    // Public JWK must NOT have private component
    expect(result.publicJwk.d).toBeUndefined();

    // Private JWK must have private component
    expect(result.privateJwk.d).toBeDefined();
    expect(result.privateJwk.kty).toBe('OKP');
    expect(result.privateJwk.crv).toBe('Ed25519');
    expect(result.privateJwk.kid).toBe(result.kid);
  });

  it('writes private key file to disk', async () => {
    const result = await generateSigningKey({ outputDir: tmpDir });

    const content = await fs.readFile(result.keyPath, 'utf-8');
    const jwk = JSON.parse(content);

    expect(jwk.kty).toBe('OKP');
    expect(jwk.crv).toBe('Ed25519');
    expect(jwk.d).toBe(result.privateJwk.d);
    expect(jwk.x).toBe(result.privateJwk.x);
    expect(jwk.kid).toBe(result.kid);
  });

  it('sets restrictive file permissions', async () => {
    const result = await generateSigningKey({ outputDir: tmpDir });

    const stat = await fs.stat(result.keyPath);
    // 0o600 = owner read/write only (0o100600 with file type bits)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('creates output directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    const result = await generateSigningKey({ outputDir: nestedDir });

    expect(result.keyPath).toBe(path.join(nestedDir, 'signing-key.jwk'));
    const content = await fs.readFile(result.keyPath, 'utf-8');
    expect(JSON.parse(content).kty).toBe('OKP');
  });

  it('uses custom filename when specified', async () => {
    const result = await generateSigningKey({
      outputDir: tmpDir,
      filename: 'my-key.jwk',
    });

    expect(result.keyPath).toBe(path.join(tmpDir, 'my-key.jwk'));
    const stat = await fs.stat(result.keyPath);
    expect(stat.isFile()).toBe(true);
  });

  it('generates unique keys on each call', async () => {
    const result1 = await generateSigningKey({
      outputDir: tmpDir,
      filename: 'key1.jwk',
    });
    const result2 = await generateSigningKey({
      outputDir: tmpDir,
      filename: 'key2.jwk',
    });

    // Keys should be different
    expect(result1.privateJwk.d).not.toBe(result2.privateJwk.d);
    expect(result1.publicJwk.x).not.toBe(result2.publicJwk.x);
    expect(result1.kid).not.toBe(result2.kid);
  });

  it('defaults to current directory and signing-key.jwk', async () => {
    // Use explicit outputDir to avoid writing to cwd
    const result = await generateSigningKey({ outputDir: tmpDir });
    expect(result.keyPath).toBe(path.join(tmpDir, 'signing-key.jwk'));
  });
});

describe('keygenCli', () => {
  it('generates key with --output-dir', async () => {
    // Capture stdout
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await keygenCli(['--output-dir', tmpDir]);
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join('');
    expect(output).toContain('Key generated successfully.');
    expect(output).toContain('kid:');
    expect(output).toContain('key file:');
    expect(output).toContain('public x:');
    expect(output).toContain('signing.key_ref:');

    // Key file should exist
    const keyPath = path.join(tmpDir, 'signing-key.jwk');
    const stat = await fs.stat(keyPath);
    expect(stat.isFile()).toBe(true);
  });

  it('prints help with --help', async () => {
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await keygenCli(['--help']);
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join('');
    expect(output).toContain('Usage: peac-keygen');
    expect(output).toContain('--output-dir');
  });

  it('prints help with -h', async () => {
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await keygenCli(['-h']);
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join('');
    expect(output).toContain('Usage: peac-keygen');
  });
});
