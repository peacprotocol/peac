import * as jose from 'jose';
import { generateKeyPairSync, randomUUID, createPublicKey } from 'crypto';
import * as fs from 'fs';
import pino from 'pino';

const logger = pino({ name: 'jwks-manager' });

interface KeyPair {
  kid: string;
  privateKey: string;
  publicKey: string;
  createdAt: string;
  expiresAt?: string;
}

export interface JWKSManagerConfig {
  keyStorePath?: string;
  rotationIntervalDays?: number;
  preferredAlgorithm?: 'ES256' | 'RS256';
  retireGracePeriodDays?: number;
}

export class JWKSManager {
  private keys: Map<string, KeyPair> = new Map();
  private primaryKid: string | null = null;
  private secondaryKid: string | null = null;
  private keyStorePath: string | null = null;
  private config: {
    keyStorePath: string | undefined;
    rotationIntervalDays: number;
    preferredAlgorithm: 'ES256' | 'RS256';
    retireGracePeriodDays: number;
  };

  constructor(config: JWKSManagerConfig = {}) {
    this.config = {
      keyStorePath: config.keyStorePath || undefined,
      rotationIntervalDays: config.rotationIntervalDays || 30,
      preferredAlgorithm: config.preferredAlgorithm || 'ES256',
      retireGracePeriodDays: config.retireGracePeriodDays || 7,
    };
    this.keyStorePath = this.config.keyStorePath || null;
  }

  async initialize(): Promise<void> {
    if (this.keyStorePath && fs.existsSync(this.keyStorePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.keyStorePath, 'utf8'));
        this.keys = new Map(data.keys.map((k: KeyPair) => [k.kid, k]));
        this.primaryKid = data.primaryKid;
        this.secondaryKid = data.secondaryKid;
        logger.info({ keysCount: this.keys.size }, 'JWKS loaded from file');
      } catch (error) {
        logger.error({ error, path: this.keyStorePath }, 'Failed to load JWKS from file');
        await this.generateKey();
      }
    } else {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Production mode without key store path - using ephemeral keys');
      }
      await this.generateKey();
    }
  }

  async sign(payload: Record<string, unknown>): Promise<string> {
    if (!this.primaryKid || !this.keys.has(this.primaryKid)) {
      throw new Error('No primary key available for signing');
    }

    const keyPair = this.keys.get(this.primaryKid)!;
    const privateKey = await jose.importPKCS8(keyPair.privateKey, this.config.preferredAlgorithm);

    return await new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: this.config.preferredAlgorithm,
        kid: this.primaryKid,
      })
      .sign(privateKey);
  }

  async generateKey(): Promise<string> {
    const { privateKey, publicKey } =
      this.config.preferredAlgorithm === 'ES256'
        ? generateKeyPairSync('ec', { namedCurve: 'P-256' })
        : generateKeyPairSync('rsa', { modulusLength: 2048 });

    const kid = randomUUID();
    const keyPair: KeyPair = {
      kid,
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      createdAt: new Date().toISOString(),
    };

    this.secondaryKid = this.primaryKid;
    this.primaryKid = kid;
    this.keys.set(kid, keyPair);

    await this.persist();
    logger.info({ kid }, 'Generated new JWKS key');

    return kid;
  }

  getJWKS(): { keys: jose.JWK[] } {
    const keys: jose.JWK[] = [];

    if (this.primaryKid && this.keys.has(this.primaryKid)) {
      const keyPair = this.keys.get(this.primaryKid)!;
      keys.push(this.pemToJWK(keyPair.publicKey, keyPair.kid));
    }

    if (
      this.secondaryKid &&
      this.secondaryKid !== this.primaryKid &&
      this.keys.has(this.secondaryKid)
    ) {
      const keyPair = this.keys.get(this.secondaryKid)!;
      keys.push(this.pemToJWK(keyPair.publicKey, keyPair.kid));
    }

    return { keys };
  }

  handleJWKSRequest(
    req: { headers: Record<string, string | string[] | undefined> },
    res: {
      set(headers: Record<string, string>): void;
      status(code: number): { end(): void };
      json(data: unknown): void;
    },
  ): void {
    const jwks = this.getJWKS();
    const etag = `"jwks-${this.primaryKid}-${this.secondaryKid || 'none'}"`;

    res.set({
      'Content-Type': 'application/jwk-set+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      ETag: etag,
    });

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json(jwks);
  }

  private pemToJWK(publicKeyPem: string, kid: string): jose.JWK {
    const publicKey = createPublicKey(publicKeyPem);
    const jwk = publicKey.export({ format: 'jwk' }) as jose.JWK;

    return {
      ...jwk,
      alg: this.config.preferredAlgorithm,
      kid,
      use: 'sig',
      key_ops: ['verify'],
    };
  }

  private async persist(): Promise<void> {
    if (!this.keyStorePath) return;

    try {
      const data = {
        keys: Array.from(this.keys.values()),
        primaryKid: this.primaryKid,
        secondaryKid: this.secondaryKid,
        lastModified: new Date().toISOString(),
      };

      const tempPath = `${this.keyStorePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tempPath, this.keyStorePath);

      logger.info({ path: this.keyStorePath }, 'JWKS persisted to file');
    } catch (error) {
      logger.error({ error, path: this.keyStorePath }, 'Failed to persist JWKS');
    }
  }
}
