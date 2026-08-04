/**
 * Deterministic test fixtures built with the REAL issuing API.
 *
 * Hand-rolled claim objects do not survive PEAC validation, so fixtures use `issue()` from
 * @peac/protocol. Tests run in Node, so importing the protocol barrel here is fine; the browser
 * boundary gate scans src/ only.
 *
 * No private key material is committed: keypairs are generated per run.
 */
import { base64urlEncode, computeJwkThumbprint, generateKeypair } from '@peac/crypto';
import { issue } from '../../../../packages/protocol/src/index.js';

/**
 * `issue()` derives `iat` from the wall clock with no override hook, so a hardcoded evaluation time
 * makes every fixture "not yet valid". Each fixture therefore carries the evaluation time to use;
 * it is fixed for the lifetime of the fixture, which is what determinism tests need.
 */
export const NOW = Math.floor(Date.now() / 1000);
export const ISSUER = 'https://issuer.example';
/** Unregistered on purpose: a registered type would drag in extension-group requirements. */
export const RECORD_TYPE = 'org.example/verifier-fixture';

export interface Fixture {
  readonly record: string;
  readonly publicJwk: Record<string, unknown>;
  readonly keyDocument: string;
  readonly thumbprint: string;
  readonly issuer: string;
  readonly recordType: string;
  readonly kid: string;
  readonly publicKey: Uint8Array;
  /** Use this as evaluationTimeUnixSeconds; the record's iat is clock-derived. */
  readonly evaluationTime: number;
}

export async function makeFixture(
  kid = 'k1',
  overrides: Record<string, unknown> = {}
): Promise<Fixture> {
  const { privateKey, publicKey } = await generateKeypair();
  const evaluationTime = Math.floor(Date.now() / 1000);
  const issued = await issue({
    iss: ISSUER,
    kind: 'evidence',
    type: RECORD_TYPE,
    kid,
    jti: '01940000-0000-7000-8000-000000000001',
    occurred_at: '2026-04-01T00:00:00Z',
    purpose_declared: 'verifier-fixture',
    pillars: ['safety'],
    privateKey,
    ...overrides,
  } as never);
  const x = base64urlEncode(publicKey);
  const publicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid };
  return {
    record: (issued as { jws: string }).jws,
    publicJwk,
    keyDocument: JSON.stringify(publicJwk),
    thumbprint: await computeJwkThumbprint({ kty: 'OKP', crv: 'Ed25519', x }),
    issuer: ISSUER,
    recordType: RECORD_TYPE,
    kid,
    publicKey,
    evaluationTime,
  };
}

/** A second, unrelated valid keypair -- for the wrong-key case. */
export async function makeUnrelatedKeyDocument(kid = 'other'): Promise<string> {
  const { publicKey } = await generateKeypair();
  return JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(publicKey), kid });
}

/**
 * Flip one character in the MIDDLE of the signature segment, preserving length.
 *
 * Deliberately not the last character: the final base64url character of a 64-byte signature encodes
 * only padding bits, so several values decode to identical bytes and the "tamper" would verify.
 */
export function tamperSignature(record: string): string {
  const [h, p, s] = record.split('.');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const i = Math.floor(s.length / 2);
  const next = chars[(chars.indexOf(s[i]) + 1) % chars.length];
  return `${h}.${p}.${s.slice(0, i)}${next}${s.slice(i + 1)}`;
}

/** Replace the protected header, keeping the original payload and signature segments. */
export function withProtectedHeader(record: string, header: Record<string, unknown>): string {
  const [, p, s] = record.split('.');
  return `${base64urlEncode(new TextEncoder().encode(JSON.stringify(header)))}.${p}.${s}`;
}

/** Replace the protected header with raw text (for malformed-JSON and duplicate-member cases). */
export function withRawProtectedHeader(record: string, raw: string): string {
  const [, p, s] = record.split('.');
  return `${base64urlEncode(new TextEncoder().encode(raw))}.${p}.${s}`;
}

export const BASE_HEADER: Record<string, unknown> = {
  alg: 'EdDSA',
  typ: 'application/peac-interaction-record+jwt',
  kid: 'k1',
};
