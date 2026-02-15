/**
 * @peac/adapter-openclaw - Signing Key Generation
 *
 * Generates an Ed25519 keypair for PEAC receipt signing.
 * Reuses generateKeyId() from plugin.ts for kid derivation.
 *
 * Usage (programmatic):
 *   const result = await generateSigningKey({ outputDir: '~/.openclaw/peac' });
 *   console.log(result.kid);
 *
 * Usage (CLI):
 *   npx @peac/adapter-openclaw keygen
 *   npx @peac/adapter-openclaw keygen --output-dir /path/to/dir
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { generateKeypair, base64urlEncode } from '@peac/crypto';
import { generateKeyId, type JWK } from './plugin.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for key generation.
 */
export interface KeygenOptions {
  /** Directory to write the key file to. Default: current directory. */
  outputDir?: string;
  /** Filename for the private key. Default: signing-key.jwk */
  filename?: string;
}

/**
 * Result of key generation.
 */
export interface KeygenResult {
  /** Key ID (derived from public key). */
  kid: string;
  /** Path where the private key was written. */
  keyPath: string;
  /** The public JWK (safe to share). */
  publicJwk: JWK;
  /** The private JWK (keep secret). */
  privateJwk: JWK;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_KEY_FILENAME = 'signing-key.jwk';

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate an Ed25519 signing keypair and write the private key to disk.
 *
 * - Private key file has 0o600 permissions (owner read/write only).
 *   On platforms where chmod fails (Windows), a warning is logged to stderr.
 * - The key ID (kid) is derived from the public key via generateKeyId().
 *
 * @returns KeygenResult with paths and key material
 */
export async function generateSigningKey(options?: KeygenOptions): Promise<KeygenResult> {
  const outputDir = options?.outputDir ?? '.';
  const filename = options?.filename ?? DEFAULT_KEY_FILENAME;

  // Generate Ed25519 keypair via @peac/crypto
  const { privateKey: privateKeyBytes, publicKey: publicKeyBytes } = await generateKeypair();

  // Encode as base64url
  const d = base64urlEncode(privateKeyBytes);
  const x = base64urlEncode(publicKeyBytes);

  // Build JWK
  const privateJwk: JWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    x,
    d,
    alg: 'EdDSA',
    use: 'sig',
  };

  // Derive key ID from public component
  const kid = generateKeyId(privateJwk);
  privateJwk.kid = kid;

  // Public JWK (no private component)
  const publicJwk: JWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    x,
    kid,
    alg: 'EdDSA',
    use: 'sig',
  };

  // Write to disk
  await fs.mkdir(outputDir, { recursive: true });
  const keyPath = path.join(outputDir, filename);
  await fs.writeFile(keyPath, JSON.stringify(privateJwk, null, 2) + '\n', 'utf-8');

  // Set restrictive permissions (0o600 = owner read/write only)
  try {
    await fs.chmod(keyPath, 0o600);
  } catch {
    // chmod may fail on Windows -- log warning but don't fail
    process.stderr.write(
      `Warning: Could not set file permissions on ${keyPath}. ` +
        `Ensure the file is not readable by other users.\n`
    );
  }

  return { kid, keyPath, publicJwk, privateJwk };
}

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * CLI handler for `peac-keygen` command.
 * Parses args, generates key, prints results.
 */
export async function keygenCli(args: string[]): Promise<void> {
  let outputDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output-dir' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      process.stdout.write(
        'Usage: peac-keygen [--output-dir <dir>]\n\n' +
          'Generate an Ed25519 signing key for PEAC receipt signing.\n\n' +
          'Options:\n' +
          '  --output-dir <dir>  Directory for key file (default: current directory)\n' +
          '  --help, -h          Show this help message\n'
      );
      return;
    }
  }

  const result = await generateSigningKey({ outputDir });

  process.stdout.write(`Key generated successfully.\n`);
  process.stdout.write(`  kid:      ${result.kid}\n`);
  process.stdout.write(`  key file: ${result.keyPath}\n`);
  process.stdout.write(`  public x: ${result.publicJwk.x}\n`);
  process.stdout.write(`\nTo use with the OpenClaw adapter:\n`);
  process.stdout.write(`  signing.key_ref: "file:${path.resolve(result.keyPath)}"\n`);
}
