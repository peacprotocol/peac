import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

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
}

export interface ReceiptOptions {
  issuer: string;
  subject: string;
  tier: Tier;
  method: string;
  path: string;
  policyHash: string;
  attribution?: string;
  privateKey: Uint8Array;
  keyId?: string;
}

export function createReceipt(options: ReceiptOptions): Promise<string> {
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

  return new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({
      alg: 'EdDSA',
      typ: 'application/peac-receipt',
      ...(options.keyId && { kid: options.keyId }),
    })
    .sign(options.privateKey);
}

export async function verifyReceipt(jws: string, publicKey: Uint8Array): Promise<ReceiptClaims> {
  const { payload } = await jwtVerify(jws, publicKey, {
    typ: 'application/peac-receipt',
  });

  return payload as unknown as ReceiptClaims;
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
