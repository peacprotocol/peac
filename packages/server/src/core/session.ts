import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  calculateJwkThumbprint,
  type JWK,
  type KeyLike,
} from 'jose';
import { getRedis } from '../utils/redis-pool';

const ALG = 'RS256';

let _privKey: KeyLike | null = null;
let _pubKey: KeyLike | null = null;

const PRIV_PEM = process.env.SESSION_PRIVATE_KEY_PEM || '';
const PUB_PEM = process.env.SESSION_PUBLIC_KEY_PEM || '';

async function getPrivateKey(): Promise<KeyLike> {
  if (_privKey) return _privKey;
  if (!PRIV_PEM) throw new Error('session_privkey_missing');
  _privKey = await importPKCS8(PRIV_PEM, ALG);
  return _privKey;
}

async function getPublicKey(): Promise<KeyLike> {
  if (_pubKey) return _pubKey;
  if (!PUB_PEM) throw new Error('session_pubkey_missing');
  _pubKey = await importSPKI(PUB_PEM, ALG);
  return _pubKey;
}

/**
 * Mint a JWT session.
 * sub: agentId
 * agentJwk: optional JWK to bind via DPoP thumbprint (cnf.jkt)
 * resource: optional resource URI
 * scope: array of purposes
 * ttlSec: expiration in seconds
 */
export async function mintSession(
  sub: string,
  agentJwk?: JWK,
  resource?: string,
  scope: string[] = [],
  ttlSec = 3600
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const sessionId = `${sub}:${now}:${Math.random().toString(36).substring(2)}`;

  const cnf = agentJwk
    ? { jkt: await calculateJwkThumbprint(agentJwk, 'sha256') }
    : undefined;

  const payload: Record<string, unknown> = {
    sub,
    sessionId,
    ...(resource ? { resource } : {}),
    ...(scope?.length ? { scope } : {}),
    ...(cnf ? { cnf } : {}),
    iat: now,
    exp: now + ttlSec,
  };

  const key = await getPrivateKey();
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .sign(key);

  // Track active session in Redis
  const redis = getRedis();
  await redis.sadd('active_sessions', sessionId);
  await redis.expire('active_sessions', ttlSec);

  return token;
}

interface SessionPayload {
  sub: string;
  sessionId?: string;
  resource?: string;
  scope?: string[];
  cnf?: { jkt: string };
  iat: number;
  exp: number;
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const key = await getPublicKey();
  const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
  
  const sessionData = payload as SessionPayload;
  
  // Check if session is revoked
  if (sessionData.sessionId) {
    const redis = getRedis();
    const isActive = await redis.sismember('active_sessions', sessionData.sessionId);
    if (!isActive) {
      throw new Error('session_revoked');
    }
  }
  
  return sessionData;
}

export async function revokeSession(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.srem('active_sessions', sessionId);
}
