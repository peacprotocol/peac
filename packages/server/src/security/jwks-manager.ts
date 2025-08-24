import * as jose from 'jose';
import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'jwks-manager' });

interface JWKSConfig {
  rotationIntervalDays: number;
  keyStorePath: string;
  preferredAlgorithm: 'ES256' | 'RS256';
  retireGracePeriodDays: number;
}

interface KeyMetadata {
  kid: string;
  algorithm: 'ES256' | 'RS256';
  created_at: number;
  rotated_at?: number;
  retired_at?: number;
  status: 'active' | 'rotating' | 'retired';
}

interface KeyEntry {
  privateKey: jose.KeyLike;
  publicKey: jose.KeyLike;
  metadata: KeyMetadata;
}

export interface JWKSManagerConfig {
  keyStorePath?: string;
  rotationIntervalDays?: number;
  preferredAlgorithm?: 'ES256' | 'RS256';
  retireGracePeriodDays?: number;
}

export class JWKSManager {
  private keys: Map<string, KeyEntry> = new Map();
  private publicJWKSCache: { jwks: jose.JSONWebKeySet; etag: string; generated: number } | null =
    null;
  private rotationTimer: NodeJS.Timeout | null = null;

  constructor(private config: JWKSConfig) {
    this.config = {
      rotationIntervalDays: config.rotationIntervalDays || 30,
      retireGracePeriodDays: config.retireGracePeriodDays || 7,
      preferredAlgorithm: config.preferredAlgorithm || 'ES256',
      keyStorePath: config.keyStorePath,
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing JWKS Manager');
    await this.loadOrGenerateKeys();
    this.scheduleRotation();

    if (process.env.NODE_ENV === 'development') {
      await this.watchKeyStore();
    }

    logger.info({ keyCount: this.keys.size }, 'JWKS Manager initialized');
  }

  async generateKey(alg: 'ES256' | 'RS256'): Promise<string> {
    const timestamp = Date.now();
    const kid = `peac-${alg.toLowerCase()}-${timestamp}`;

    logger.info({ kid, algorithm: alg }, 'Generating new key');

    let keyPair: jose.GenerateKeyPairResult;

    if (alg === 'ES256') {
      keyPair = await jose.generateKeyPair('ES256', {
        extractable: true,
        crv: 'P-256',
      });
    } else {
      keyPair = await jose.generateKeyPair('RS256', {
        extractable: true,
        modulusLength: 2048,
      });
    }

    const metadata: KeyMetadata = {
      kid,
      algorithm: alg,
      created_at: timestamp,
      status: 'active',
    };

    await this.storeKey(kid, keyPair.privateKey, keyPair.publicKey, metadata);
    await this.updatePublicJWKS();

    logger.info({ kid }, 'Key generated successfully');
    return kid;
  }

  async rotateKeys(): Promise<void> {
    logger.info('Starting key rotation');

    const now = Date.now();
    const rotationThreshold = now - this.config.rotationIntervalDays * 24 * 60 * 60 * 1000;

    for (const [kid, entry] of this.keys.entries()) {
      if (entry.metadata.status === 'active' && entry.metadata.created_at < rotationThreshold) {
        entry.metadata.status = 'rotating';
        entry.metadata.rotated_at = now;

        logger.info({ kid }, 'Rotating key');
        await this.generateKey(entry.metadata.algorithm);

        setTimeout(
          () => this.retireKey(kid),
          this.config.retireGracePeriodDays * 24 * 60 * 60 * 1000,
        );
      }
    }

    await this.updatePublicJWKS();
  }

  async signJwt(payload: jose.JWTPayload, kid?: string): Promise<string> {
    if (!kid) {
      kid = this.getLatestKid();
    }

    const entry = this.keys.get(kid);
    if (!entry) {
      throw new Error(`Key not found: ${kid}`);
    }

    if (entry.metadata.status === 'retired') {
      throw new Error(`Key is retired: ${kid}`);
    }

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: entry.metadata.algorithm,
        kid,
        typ: 'JWT',
      })
      .sign(entry.privateKey);

    return jwt;
  }

  async sign(payload: jose.JWTPayload, kid?: string): Promise<string> {
    if (!kid) {
      kid = this.getLatestActiveKid();
    }

    const entry = this.keys.get(kid);
    if (!entry) {
      throw new Error(`Key not found: ${kid}`);
    }

    if (entry.metadata.status === 'retired') {
      throw new Error(`Key is retired: ${kid}`);
    }

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({
        alg: entry.metadata.algorithm,
        kid,
        typ: 'JWT',
      })
      .sign(entry.privateKey);

    return jwt;
  }

  async getSigningKey(kid?: string): Promise<jose.KeyLike> {
    if (!kid) {
      kid = this.getLatestActiveKid();
    }
    const entry = this.keys.get(kid);
    if (!entry) {
      throw new Error(`Key not found: ${kid}`);
    }
    return entry.privateKey;
  }

  getLatestKid(): string {
    return this.getLatestActiveKid();
  }

  async verifyJwt(token: string, opts?: jose.JWTVerifyOptions): Promise<jose.JWTVerifyResult> {
    const { jwks } = await this.getPublicJWKS();
    const keySet = jose.createLocalJWKSet(jwks);
    return jose.jwtVerify(token, keySet, opts);
  }

  async verifyJws(
    compactDetached: string,
    payloadBytes: Uint8Array,
  ): Promise<jose.CompactVerifyResult> {
    const [hdr, , sig] = compactDetached.split('..');
    const full = `${hdr}.${jose.base64url.encode(payloadBytes)}.${sig}`;
    const { jwks } = await this.getPublicJWKS();
    const keySet = jose.createLocalJWKSet(jwks);
    return jose.compactVerify(full, keySet);
  }

  async verify(jws: string, detachedPayload?: Uint8Array): Promise<jose.JWTVerifyResult> {
    const jwks = await this.getPublicJWKS();
    const keySet = jose.createLocalJWKSet(jwks.jwks);

    if (detachedPayload) {
      const [header, , signature] = jws.split('.');
      const payload = jose.base64url.encode(detachedPayload);
      const fullJWS = `${header}.${payload}.${signature}`;
      return await jose.jwtVerify(fullJWS, keySet);
    }

    return await jose.jwtVerify(jws, keySet);
  }

  async getPublicJWKS(): Promise<{ jwks: jose.JSONWebKeySet; etag: string }> {
    const now = Date.now();

    if (this.publicJWKSCache && now - this.publicJWKSCache.generated < 300000) {
      return this.publicJWKSCache;
    }

    const keys: jose.JWK[] = [];

    for (const [kid, entry] of this.keys.entries()) {
      if (entry.metadata.status !== 'retired') {
        const publicKey = await jose.exportJWK(entry.publicKey);
        publicKey.kid = kid;
        publicKey.use = 'sig';
        publicKey.key_ops = ['verify'];
        publicKey.alg = entry.metadata.algorithm;
        keys.push(publicKey);
      }
    }

    const jwks = { keys };
    const content = JSON.stringify(jwks);
    const etag = `"${crypto.createHash('sha256').update(content).digest('hex')}"`;

    this.publicJWKSCache = { jwks, etag, generated: now };

    return { jwks, etag };
  }

  async handleJWKSRequest(
    req: { headers: Record<string, string | string[] | undefined> },
    res: {
      set(headers: Record<string, string>): void;
      status(code: number): { end(): void };
      json(data: unknown): void;
    },
  ): Promise<void> {
    const { jwks, etag } = await this.getPublicJWKS();

    res.set({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });

    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.json(jwks);
  }

  private getLatestActiveKid(): string {
    let latest: { kid: string; created_at: number } | null = null;

    for (const [kid, entry] of this.keys.entries()) {
      if (entry.metadata.status === 'active') {
        if (!latest || entry.metadata.created_at > latest.created_at) {
          latest = { kid, created_at: entry.metadata.created_at };
        }
      }
    }

    if (!latest) {
      throw new Error('No active keys available');
    }

    return latest.kid;
  }

  private async retireKey(kid: string): Promise<void> {
    const entry = this.keys.get(kid);
    if (entry) {
      entry.metadata.status = 'retired';
      entry.metadata.retired_at = Date.now();
      logger.info({ kid }, 'Key retired');

      setTimeout(
        () => {
          this.keys.delete(kid);
          logger.info({ kid }, 'Key deleted');
        },
        this.config.retireGracePeriodDays * 24 * 60 * 60 * 1000,
      );
    }
  }

  private async storeKey(
    kid: string,
    privateKey: jose.KeyLike,
    publicKey: jose.KeyLike,
    metadata: KeyMetadata,
  ): Promise<void> {
    this.keys.set(kid, { privateKey, publicKey, metadata });

    if (this.config.keyStorePath.startsWith('kms://')) {
      // KMS implementation for production
    } else {
      // File storage for development only
      if (process.env.NODE_ENV === 'development') {
        const data = {
          kid,
          metadata,
          privateKey: await jose.exportJWK(privateKey),
          publicKey: await jose.exportJWK(publicKey),
        };
        await fs.writeFile(
          `${this.config.keyStorePath}/${kid}.json`,
          JSON.stringify(data, null, 2),
        );
      }
    }
  }

  private async loadOrGenerateKeys(): Promise<void> {
    if (this.config.keyStorePath.startsWith('kms://')) {
      // Load from KMS
    } else if (process.env.NODE_ENV === 'development') {
      try {
        const files = await fs.readdir(this.config.keyStorePath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const data = JSON.parse(
              await fs.readFile(`${this.config.keyStorePath}/${file}`, 'utf-8'),
            );
            if (data.privateKey && data.publicKey) {
              const privateKey = (await jose.importJWK(data.privateKey)) as jose.KeyLike;
              const publicKey = (await jose.importJWK(data.publicKey)) as jose.KeyLike;
              this.keys.set(data.kid, { privateKey, publicKey, metadata: data.metadata });
            }
          }
        }
      } catch (err) {
        logger.warn({ err }, 'No existing keys found, will generate new ones');
      }
    }

    if (this.keys.size === 0) {
      await this.generateKey(this.config.preferredAlgorithm);
    }
  }

  private scheduleRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(() => this.rotateKeys(), 24 * 60 * 60 * 1000);
  }

  private async watchKeyStore(): Promise<void> {
    if (
      typeof this.config.keyStorePath === 'string' &&
      !this.config.keyStorePath.startsWith('kms://')
    ) {
      try {
        const chokidar = await import('chokidar');
        const watcher = chokidar.watch(this.config.keyStorePath, {
          ignored: /(^|[/\\])\../,
          persistent: true,
        });

        watcher.on('change', async (path) => {
          logger.info({ path }, 'Key file changed, reloading');
          await this.loadOrGenerateKeys();
          await this.updatePublicJWKS();
        });
      } catch (err) {
        logger.warn('chokidar not available, key store watching disabled');
      }
    }
  }

  private async updatePublicJWKS(): Promise<void> {
    this.publicJWKSCache = null;
    await this.getPublicJWKS();
  }
}
