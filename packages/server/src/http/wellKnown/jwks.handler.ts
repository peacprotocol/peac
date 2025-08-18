import { Request, Response } from "express";
import { readFileSync, existsSync, renameSync, chmodSync, openSync, writeSync, fsyncSync, closeSync } from "fs";
import { generateKeyPairSync, createPublicKey } from "crypto";
import { randomUUID } from "crypto";
import { logger } from "../../logging";
import { metrics } from "../../metrics";
import { problemDetails } from "../problems";

interface JWK {
  kty: string;
  crv: string;
  alg: string;
  kid: string;
  use: string;
  key_ops: string[];
  x: string;
  y: string;
}

interface KeyPair {
  kid: string;
  privateKey: string;
  publicKey: string;
  createdAt: string;
  expiresAt?: string;
}

class JWKSManager {
  private keys: Map<string, KeyPair> = new Map();
  private primaryKid: string | null = null;
  private secondaryKid: string | null = null;
  private keysPath: string | null = null;
  private lastModified: string;

  constructor() {
    this.keysPath = process.env.PEAC_JWKS_PATH || null;
    this.lastModified = new Date().toUTCString();
    this.initialize();
  }

  private initialize(): void {
    if (this.keysPath && existsSync(this.keysPath)) {
      // Production: load from file
      try {
        const data = JSON.parse(readFileSync(this.keysPath, 'utf8'));
        this.keys = new Map(data.keys.map((k: KeyPair) => [k.kid, k]));
        this.primaryKid = data.primaryKid;
        this.secondaryKid = data.secondaryKid;
        this.lastModified = data.lastModified || this.lastModified;
        logger.info({ keysCount: this.keys.size }, "JWKS loaded from file");
      } catch (error) {
        logger.error({ error, path: this.keysPath }, "Failed to load JWKS from file");
        this.generateEphemeralKey();
      }
    } else {
      // Dev: ephemeral keys with warning
      if (process.env.NODE_ENV === 'production') {
        logger.warn("Production mode without PEAC_JWKS_PATH - using ephemeral keys");
      }
      this.generateEphemeralKey();
    }
  }

  private generateEphemeralKey(): void {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { 
      namedCurve: "P-256" 
    });
    
    const kid = randomUUID();
    const keyPair: KeyPair = {
      kid,
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      createdAt: new Date().toISOString(),
    };

    this.keys.set(kid, keyPair);
    this.primaryKid = kid;
    this.lastModified = new Date().toUTCString();

    if (process.env.NODE_ENV !== 'production') {
      logger.warn({ kid }, "Generated ephemeral JWKS key - will not survive restart");
    }
  }

  private pemToJWK(publicKeyPem: string, kid: string): JWK {
    const publicKey = createPublicKey(publicKeyPem);
    const jwk = publicKey.export({ format: 'jwk' }) as any;
    
    return {
      kty: jwk.kty,
      crv: jwk.crv,
      alg: "ES256",
      kid,
      use: "sig",
      key_ops: ["verify"],
      x: jwk.x,
      y: jwk.y,
    };
  }

  private persist(): void {
    if (!this.keysPath) return;

    try {
      const data = {
        keys: Array.from(this.keys.values()),
        primaryKid: this.primaryKid,
        secondaryKid: this.secondaryKid,
        lastModified: this.lastModified,
      };
      
      // Atomic write with fsync: write to temp file, sync, then rename
      const tempPath = `${this.keysPath}.tmp`;
      const jsonData = JSON.stringify(data, null, 2);
      
      const fd = openSync(tempPath, "w", 0o600);
      writeSync(fd, Buffer.from(jsonData, "utf8"));
      fsyncSync(fd);
      closeSync(fd);
      
      renameSync(tempPath, this.keysPath);
      
      // Ensure proper permissions on final file
      chmodSync(this.keysPath, 0o600);
      
      logger.info({ path: this.keysPath }, "JWKS persisted atomically to file");
    } catch (error) {
      logger.error({ error, path: this.keysPath }, "Failed to persist JWKS");
    }
  }

  getJWKS(): { keys: JWK[] } {
    const keys: JWK[] = [];
    
    // Add primary key
    if (this.primaryKid && this.keys.has(this.primaryKid)) {
      const keyPair = this.keys.get(this.primaryKid)!;
      keys.push(this.pemToJWK(keyPair.publicKey, keyPair.kid));
    }
    
    // Add secondary key if different
    if (this.secondaryKid && this.secondaryKid !== this.primaryKid && this.keys.has(this.secondaryKid)) {
      const keyPair = this.keys.get(this.secondaryKid)!;
      keys.push(this.pemToJWK(keyPair.publicKey, keyPair.kid));
    }

    return { keys };
  }

  rotateKey(): string {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { 
      namedCurve: "P-256" 
    });
    
    const kid = randomUUID();
    
    // Check for kid collision (should be extremely rare)
    if (this.keys.has(kid)) {
      logger.warn({ kid }, "JWKS kid collision detected - regenerating");
      return this.rotateKey(); // Recursive retry
    }
    
    const keyPair: KeyPair = {
      kid,
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      createdAt: new Date().toISOString(),
    };

    // Rotate: current primary becomes secondary, new key becomes primary
    this.secondaryKid = this.primaryKid;
    this.primaryKid = kid;
    this.keys.set(kid, keyPair);
    this.lastModified = new Date().toUTCString();

    this.persist();
    logger.info({ newKid: kid, oldKid: this.secondaryKid }, "JWKS key rotated");
    
    return kid;
  }

  getETag(): string {
    return `"jwks-${this.primaryKid}-${this.secondaryKid || 'none'}"`;
  }

  getLastModified(): string {
    return this.lastModified;
  }
}

// Singleton instance
const jwksManager = new JWKSManager();

export async function handleJWKS(req: Request, res: Response): Promise<void> {
  const timer = metrics.httpRequestDuration.startTimer({
    method: "GET",
    route: "/.well-known/jwks.json",
  });

  try {
    const etag = jwksManager.getETag();
    const lastModified = jwksManager.getLastModified();
    
    // Handle conditional requests
    if (req.headers["if-none-match"] === etag || 
        req.headers["if-modified-since"] === lastModified) {
      timer({ status: 304 });
      res.status(304).end();
      return;
    }

    const jwks = jwksManager.getJWKS();

    res.set({
      "Content-Type": "application/jwk-set+json",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      "ETag": etag,
      "Last-Modified": lastModified,
    });

    timer({ status: 200 });
    res.status(200).json(jwks);

    logger.info({ keyCount: jwks.keys.length }, "JWKS served successfully");
  } catch (error) {
    timer({ status: 500 });
    logger.error({ error }, "Failed to serve JWKS");
    problemDetails.send(res, "internal_error", {
      detail: "Failed to retrieve JWKS",
    });
  }
}

// Export for rotation endpoint (future use)
export { jwksManager };