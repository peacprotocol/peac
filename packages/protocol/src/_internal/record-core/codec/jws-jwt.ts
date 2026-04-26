/**
 * Default codec: pure pass-through to @peac/crypto.signWire02 / verify.
 *
 * @internal
 *
 * Byte-identical encode output to signWire02 is guaranteed by the
 * golden-vector test (codec-jws-jwt-byte-identical.test.ts). Decode
 * returns the underlying cryptoVerify result unchanged.
 *
 * peekHeader is structural-only: it requires typ + alg presence and a
 * structurally valid compact JWS, but does NOT enforce policy on
 * unsupported alg, crit, zip, or b64:false. Those rejections are
 * downstream responsibilities (kernel constraints, JOSE hardening).
 *
 * The canonical implementation lives here. Tests import via relative
 * paths from packages/protocol/__tests__/_internal/.
 */

import {
  signWire02,
  verify as cryptoVerify,
  base64urlDecodeString,
  type VerifyResult,
} from '@peac/crypto';
import { CodecError, type CodecHeader, type RecordCodec } from './types.js';

class JwsJwtCodec implements RecordCodec {
  readonly name = 'jws-jwt' as const;

  async encode(payload: unknown, privateKey: Uint8Array, kid: string): Promise<string> {
    return signWire02(payload, privateKey, kid);
  }

  async decode<T = unknown>(serialized: string, publicKey: Uint8Array): Promise<VerifyResult<T>> {
    return cryptoVerify<T>(serialized, publicKey);
  }

  peekHeader(serialized: string): CodecHeader {
    // Structural compact-JWS shape: exactly three non-empty
    // dot-separated segments: header.payload.signature.
    const segments = serialized.split('.');
    if (segments.length !== 3) {
      throw new CodecError(
        'CODEC_PEEK_MALFORMED',
        `jws-jwt: malformed compact JWS (expected 3 segments, got ${segments.length})`
      );
    }
    const [headerB64, payloadB64, signatureB64] = segments;
    if (headerB64.length === 0) {
      throw new CodecError(
        'CODEC_PEEK_MALFORMED',
        'jws-jwt: malformed compact JWS (empty header segment)'
      );
    }
    if (payloadB64.length === 0) {
      throw new CodecError(
        'CODEC_PEEK_MALFORMED',
        'jws-jwt: malformed compact JWS (empty payload segment)'
      );
    }
    if (signatureB64.length === 0) {
      throw new CodecError(
        'CODEC_PEEK_MALFORMED',
        'jws-jwt: malformed compact JWS (empty signature segment)'
      );
    }

    let header: Record<string, unknown>;
    try {
      // Runtime-neutral base64url -> UTF-8 string decode
      // (TextDecoder + Uint8Array via @peac/crypto.base64urlDecodeString;
      // no Node Buffer dependency: works in browser, edge worker, Deno).
      const headerJson = base64urlDecodeString(headerB64);
      header = JSON.parse(headerJson) as Record<string, unknown>;
    } catch (err) {
      throw new CodecError(
        'CODEC_PEEK_INVALID_HEADER',
        `jws-jwt: protected header JSON parse failed: ${(err as Error).message}`
      );
    }

    if (typeof header.typ !== 'string') {
      throw new CodecError(
        'CODEC_PEEK_MISSING_TYP',
        'jws-jwt: protected header missing required field "typ" (string)'
      );
    }
    if (typeof header.alg !== 'string') {
      throw new CodecError(
        'CODEC_PEEK_MISSING_ALG',
        'jws-jwt: protected header missing required field "alg" (string)'
      );
    }

    return {
      typ: header.typ,
      alg: header.alg,
      kid: typeof header.kid === 'string' ? header.kid : undefined,
      raw: header,
    };
  }
}

/**
 * Default codec instance. Internal-only.
 *
 * @internal
 */
export const defaultCodec: RecordCodec = new JwsJwtCodec();
