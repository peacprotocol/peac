import { SignJWT, jwtVerify, JWTPayload, importJWK } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { SiteKey, siteKeyToJWK } from './keys';

export type Tier = 'anonymous' | 'attributed' | 'verified';

export interface ReceiptClaims {
  iss: string;
  sub: string;
  iat: number;
  jti: string;
  tier: Tier;
  req: {
    m: 'G' | 'P' | 'H' | 'D' | 'O' | 'T' | 'C';
    p: string;
  };
  ph: string;
  attr?: string;
  wba?: string;
}

export interface ReceiptOptions {
  issuer: string;
  subject: string;
  tier: Tier;
  method: string;
  path: string;
  policyHash: string;
  attribution?: string;
  verifiedThumbprint?: string;
  key: SiteKey;
}

export async function createReceipt(options: ReceiptOptions): Promise<string> {
  const methodInitial = getMethodInitial(options.method);
  const pathHash = crypto
    .createHash('sha256')
    .update(options.path, 'utf8')
    .digest('hex')
    .substring(0, 40);

  const claims: ReceiptClaims = {
    iss: options.issuer,
    sub: options.subject,
    iat: Math.floor(Date.now() / 1000),
    jti: uuidv4(),
    tier: options.tier,
    req: {
      m: methodInitial,
      p: pathHash,
    },
    ph: options.policyHash,
  };

  if (options.attribution) {
    claims.attr = options.attribution;
  }

  if (options.verifiedThumbprint) {
    claims.wba = options.verifiedThumbprint;
  }

  if (!options.key.privateKey) {
    throw new Error('Private key required for signing');
  }

  const privateKeyJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    d: Buffer.from(options.key.privateKey).toString('base64url'),
    x: Buffer.from(options.key.publicKey).toString('base64url'),
  };

  const privateKey = await importJWK(privateKeyJwk, 'EdDSA');

  return new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({
      alg: 'EdDSA',
      typ: 'application/peac-receipt',
      kid: options.key.kid,
    })
    .sign(privateKey);
}

export async function verifyReceipt(
  jws: string,
  keys: SiteKey[]
): Promise<
  { ok: true; claims: ReceiptClaims; kid: string; alg: 'EdDSA' } | { ok: false; error: string }
> {
  try {
    // Parse header to get kid
    const [headerB64] = jws.split('.');
    if (!headerB64) {
      return { ok: false, error: 'invalid_format' };
    }

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    if (header.alg !== 'EdDSA') {
      return { ok: false, error: 'alg_unsupported' };
    }

    if (!header.kid) {
      return { ok: false, error: 'kid_missing' };
    }

    // Find matching key
    const key = keys.find((k) => k.kid === header.kid);
    if (!key) {
      return { ok: false, error: 'kid_unknown' };
    }

    // Create public key for verification
    const publicKeyJwk = siteKeyToJWK(key);
    const publicKey = await importJWK(publicKeyJwk, 'EdDSA');

    // Verify JWT
    const { payload } = await jwtVerify(jws, publicKey, {
      typ: 'application/peac-receipt',
    });

    // Additional claim validation
    const claims = payload as unknown as ReceiptClaims;
    const now = Math.floor(Date.now() / 1000);

    if (claims.iat > now + 60) {
      return { ok: false, error: 'nbf_violation' };
    }

    // Check expiry (receipts valid for 30 days)
    if (claims.iat < now - 30 * 24 * 3600) {
      return { ok: false, error: 'expired' };
    }

    return {
      ok: true,
      claims,
      kid: header.kid,
      alg: 'EdDSA',
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('signature')) {
        return { ok: false, error: 'signature_invalid' };
      }
      if (error.message.includes('expired')) {
        return { ok: false, error: 'expired' };
      }
      if (error.message.includes('audience')) {
        return { ok: false, error: 'aud_mismatch' };
      }
    }
    return { ok: false, error: 'invalid_format' };
  }
}

export function policyHash(policy: Record<string, unknown>): string {
  const canonical = JSON.stringify(policy, Object.keys(policy).sort());
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').substring(0, 40);
}

function getMethodInitial(method: string): 'G' | 'P' | 'H' | 'D' | 'O' | 'T' | 'C' {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'G';
    case 'POST':
      return 'P';
    case 'HEAD':
      return 'H';
    case 'DELETE':
      return 'D';
    case 'OPTIONS':
      return 'O';
    case 'TRACE':
      return 'T';
    case 'CONNECT':
      return 'C';
    default:
      return 'P';
  }
}

export function encodeReceiptForHeader(jws: string): string {
  const base64url = Buffer.from(jws, 'utf8').toString('base64url');
  return `:${base64url}:`;
}

export function decodeReceiptFromHeader(headerValue: string): string | null {
  if (!headerValue.startsWith(':') || !headerValue.endsWith(':')) {
    return null;
  }

  const base64url = headerValue.slice(1, -1);
  try {
    return Buffer.from(base64url, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}
