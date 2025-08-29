import * as crypto from 'crypto';
import type { JWK } from 'jose';

export interface SiteKey {
  kid: string;
  created: number;
  expires?: number;
  publicKey: Uint8Array;
  privateKey?: Uint8Array;
}

export interface KeyStore {
  getActive(): Promise<SiteKey>;
  getByKid(kid: string): Promise<SiteKey | undefined>;
  getAllPublic(): Promise<SiteKey[]>;
  rotate(newKey: SiteKey): Promise<void>;
}

class InMemoryKeyStore implements KeyStore {
  private keys = new Map<string, SiteKey>();
  private activeKid?: string;

  async getActive(): Promise<SiteKey> {
    if (!this.activeKid) {
      throw new Error('No active key configured');
    }

    const key = this.keys.get(this.activeKid);
    if (!key) {
      throw new Error('Active key not found in store');
    }

    return key;
  }

  async getByKid(kid: string): Promise<SiteKey | undefined> {
    return this.keys.get(kid);
  }

  async getAllPublic(): Promise<SiteKey[]> {
    const now = Date.now() / 1000;
    return Array.from(this.keys.values())
      .filter((key) => !key.expires || key.expires > now)
      .sort((a, b) => b.created - a.created);
  }

  async rotate(newKey: SiteKey): Promise<void> {
    this.keys.set(newKey.kid, newKey);
    this.activeKid = newKey.kid;

    // Clean up expired keys
    const now = Date.now() / 1000;
    for (const [kid, key] of this.keys) {
      if (key.expires && key.expires < now - 86400) {
        // Grace period
        this.keys.delete(kid);
      }
    }
  }
}

export const keyStore = new InMemoryKeyStore();

export function generateKeyPair(kid: string): SiteKey {
  const keyPair = crypto.generateKeyPairSync('ed25519');

  const publicKeyJwk = keyPair.publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const privateKeyJwk = keyPair.privateKey.export({ format: 'jwk' }) as JsonWebKey;

  const publicKey = Buffer.from(publicKeyJwk.x!, 'base64url');
  const privateKey = Buffer.from(privateKeyJwk.d!, 'base64url');

  return {
    kid,
    created: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, // 1 year
    publicKey,
    privateKey,
  };
}

export function exportJWKS(keys: SiteKey[]): { keys: JWK[] } {
  return {
    keys: keys.map((key) => ({
      kty: 'OKP',
      crv: 'Ed25519',
      use: 'sig',
      alg: 'EdDSA',
      kid: key.kid,
      x: Buffer.from(key.publicKey).toString('base64url'),
    })),
  };
}

export function siteKeyToJWK(key: SiteKey, includePrivate = false): JWK {
  const jwk: JWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    use: 'sig',
    alg: 'EdDSA',
    kid: key.kid,
    x: Buffer.from(key.publicKey).toString('base64url'),
  };

  if (includePrivate && key.privateKey) {
    jwk.d = Buffer.from(key.privateKey).toString('base64url');
  }

  return jwk;
}
