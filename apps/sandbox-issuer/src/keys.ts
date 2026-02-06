/**
 * Sandbox Issuer Key Management
 *
 * Stable key resolution hierarchy:
 * 1. Environment variable PEAC_SANDBOX_PRIVATE_JWK (JSON string)
 * 2. Local file .local/keys.json (persisted, gitignored)
 * 3. Ephemeral (generated fresh, clearly labeled)
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateKeypair, base64urlEncode, base64urlDecode } from '@peac/crypto';

export interface SandboxKeys {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  kid: string;
  mode: 'env' | 'persisted' | 'ephemeral';
}

interface PersistedKeyFile {
  privateKey: string; // base64url
  publicKey: string; // base64url
  kid: string;
  createdAt: string;
}

const LOCAL_KEYS_DIR = path.resolve(process.cwd(), '.local');
const LOCAL_KEYS_PATH = path.join(LOCAL_KEYS_DIR, 'keys.json');

function makeKid(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `sandbox-${yyyy}-${mm}`;
}

function tryLoadFromEnv(): SandboxKeys | null {
  const jwkStr = process.env.PEAC_SANDBOX_PRIVATE_JWK;
  if (!jwkStr) return null;

  try {
    const jwk = JSON.parse(jwkStr) as { d?: string; x?: string; kid?: string };
    if (!jwk.d || !jwk.x) return null;

    return {
      privateKey: base64urlDecode(jwk.d),
      publicKey: base64urlDecode(jwk.x),
      kid: jwk.kid ?? makeKid(),
      mode: 'env',
    };
  } catch {
    return null;
  }
}

function tryLoadFromFile(): SandboxKeys | null {
  try {
    if (!fs.existsSync(LOCAL_KEYS_PATH)) return null;
    const content = fs.readFileSync(LOCAL_KEYS_PATH, 'utf-8');
    const data = JSON.parse(content) as PersistedKeyFile;

    return {
      privateKey: base64urlDecode(data.privateKey),
      publicKey: base64urlDecode(data.publicKey),
      kid: data.kid,
      mode: 'persisted',
    };
  } catch {
    return null;
  }
}

async function generateAndPersist(): Promise<SandboxKeys> {
  const { privateKey, publicKey } = await generateKeypair();
  const kid = makeKid();

  // Attempt to persist for stability across restarts
  try {
    if (!fs.existsSync(LOCAL_KEYS_DIR)) {
      fs.mkdirSync(LOCAL_KEYS_DIR, { recursive: true });
    }
    const data: PersistedKeyFile = {
      privateKey: base64urlEncode(privateKey),
      publicKey: base64urlEncode(publicKey),
      kid,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(LOCAL_KEYS_PATH, JSON.stringify(data, null, 2));
    return { privateKey, publicKey, kid, mode: 'persisted' };
  } catch {
    // Cannot persist (read-only filesystem, etc) -- run ephemeral
    return { privateKey, publicKey, kid, mode: 'ephemeral' };
  }
}

let cachedKeys: SandboxKeys | null = null;

/**
 * Resolve sandbox signing keys using the stability hierarchy:
 * env -> local file -> generate + persist -> ephemeral
 */
export async function resolveKeys(): Promise<SandboxKeys> {
  if (cachedKeys) return cachedKeys;

  const fromEnv = tryLoadFromEnv();
  if (fromEnv) {
    cachedKeys = fromEnv;
    return fromEnv;
  }

  const fromFile = tryLoadFromFile();
  if (fromFile) {
    cachedKeys = fromFile;
    return fromFile;
  }

  const generated = await generateAndPersist();
  cachedKeys = generated;
  return generated;
}

/**
 * Get public key as JWK for JWKS endpoint
 */
export async function getPublicJwk(): Promise<Record<string, string>> {
  const keys = await resolveKeys();
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64urlEncode(keys.publicKey),
    kid: keys.kid,
    use: 'sig',
  };
}

/**
 * Reset cached keys (for testing)
 */
export function resetKeyCache(): void {
  cachedKeys = null;
}
