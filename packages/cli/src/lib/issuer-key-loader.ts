/**
 * Issuer-key loader for `peac record command`.
 *
 * Implements the same issuer-key reference convention used by other
 * PEAC tools: env:VAR_NAME and file:/path. Keeps the CLI signing UX
 * aligned with the existing PEAC convention without coupling
 * @peac/cli to any other package's loader implementation.
 *
 * Supported schemes:
 *   env:VAR_NAME    loads JSON from process.env.VAR_NAME (or
 *                   caller-supplied env)
 *   file:/path      loads JSON from the file path
 *
 * The value at the resolved location is a JSON-encoded
 * Ed25519PrivateJwk:
 *
 *   { "kty": "OKP", "crv": "Ed25519", "x": <b64url>, "d": <b64url>,
 *     "kid": "optional" }
 *
 * `kid` is extracted from the JWK if present, otherwise derived from
 * the public key (truncated SHA-256 of the base64url-encoded public
 * key) so runs are reproducible.
 *
 * The loader NEVER logs key bytes; error messages reference field
 * names and structural problems only.
 */

import { readFile } from 'node:fs/promises';
import {
  base64urlDecode,
  base64urlEncode,
  derivePublicKey,
  validateKeypair,
  sha256Hex,
} from '@peac/crypto';
import type { Ed25519PrivateJwk } from '@peac/crypto';

export class IssuerKeyLoadError extends Error {
  readonly code = 'cli.issuer_key_load_failed';
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'IssuerKeyLoadError';
  }
}

export class IssuerKeyInvalidError extends Error {
  readonly code = 'cli.issuer_key_invalid';
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'IssuerKeyInvalidError';
  }
}

export interface LoadedIssuerKey {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  kid: string;
}

/**
 * Load the issuer key from a `--issuer-key` reference.
 *
 * @param schemeUri - One of `env:VAR` or `file:/path`.
 * @param env       - Environment to consult for `env:` references.
 *                    Defaults to `process.env`. Tests inject custom env.
 */
export async function loadIssuerKey(
  schemeUri: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<LoadedIssuerKey> {
  let raw: string;

  if (schemeUri.startsWith('env:')) {
    const varName = schemeUri.slice(4);
    if (!varName) {
      throw new IssuerKeyLoadError(
        'env: scheme requires a variable name (e.g., env:PEAC_ISSUER_KEY)'
      );
    }
    const envValue = env[varName];
    if (!envValue) {
      throw new IssuerKeyLoadError(`environment variable ${varName} is not set or empty`);
    }
    raw = envValue;
  } else if (schemeUri.startsWith('file:')) {
    const filePath = schemeUri.slice(5);
    if (!filePath) {
      throw new IssuerKeyLoadError('file: scheme requires a path (e.g., file:/path/to/key.json)');
    }
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch (err) {
      throw new IssuerKeyLoadError(
        `failed to read key file: ${filePath} (${(err as NodeJS.ErrnoException)?.code ?? (err instanceof Error ? err.message : String(err))})`,
        err
      );
    }
  } else {
    throw new IssuerKeyLoadError(
      `unsupported --issuer-key scheme: ${schemeUri} (expected env:VAR_NAME or file:/path)`
    );
  }

  let jwk: unknown;
  try {
    jwk = JSON.parse(raw);
  } catch (err) {
    throw new IssuerKeyInvalidError('issuer key is not valid JSON', err);
  }

  if (
    typeof jwk !== 'object' ||
    jwk === null ||
    !('kty' in jwk) ||
    !('crv' in jwk) ||
    !('d' in jwk)
  ) {
    throw new IssuerKeyInvalidError('JWK must contain kty, crv, and d fields');
  }
  const j = jwk as Record<string, unknown>;
  if (j.kty !== 'OKP' || j.crv !== 'Ed25519') {
    throw new IssuerKeyInvalidError(
      `JWK must be Ed25519 (kty: OKP, crv: Ed25519); got kty=${String(j.kty)} crv=${String(j.crv)}`
    );
  }
  if (typeof j.d !== 'string' || typeof j.x !== 'string') {
    throw new IssuerKeyInvalidError('JWK d and x fields must be base64url strings');
  }

  const ed25519Jwk: Ed25519PrivateJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: j.x as string,
    d: j.d as string,
  };

  const valid = await validateKeypair(ed25519Jwk);
  if (!valid) {
    throw new IssuerKeyInvalidError('JWK keypair validation failed: d does not derive to x');
  }

  const privateKey = base64urlDecode(ed25519Jwk.d);
  const publicKey = await derivePublicKey(privateKey);

  let kid: string;
  if (typeof j.kid === 'string' && j.kid.length > 0) {
    kid = j.kid;
  } else {
    const pubB64 = base64urlEncode(publicKey);
    const hash = await sha256Hex(pubB64);
    kid = hash.slice(0, 16);
  }

  return { privateKey, publicKey, kid };
}

/**
 * Derive a `kid` from a freshly-generated ephemeral public key. Same
 * formula as the loader's fallback so observation records are
 * consistent with the JWK-based path.
 */
export async function deriveKidFromPublicKey(publicKey: Uint8Array): Promise<string> {
  const pubB64 = base64urlEncode(publicKey);
  const hash = await sha256Hex(pubB64);
  return hash.slice(0, 16);
}
