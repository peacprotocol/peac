/**
 * Internal codec strategy types.
 *
 * @internal
 *
 * These types MUST NOT be re-exported from packages/protocol/src/index.ts.
 * The dist-leak gate (Tier 2) asserts that these names never appear in
 * @peac/protocol's public root declaration (dist/index.d.ts) or any
 * subpath in @peac/protocol/package.json `exports`.
 *
 * The canonical implementation of these types lives at
 * packages/protocol/src/_internal/record-core/codec/jws-jwt.ts and is
 * imported via RELATIVE paths from issue.ts / verify-local.ts.
 */

import type { VerifyResult } from '@peac/crypto';

/**
 * Header view returned by codec.peekHeader().
 *
 * @internal
 */
export interface CodecHeader {
  /** JOSE typ value. Required at peek time; not defaulted. */
  readonly typ: string;
  /** Algorithm identifier. JWS string (e.g., 'EdDSA'). */
  readonly alg: string;
  /** Key identifier (when present). */
  readonly kid?: string;
  /** Full raw protected-header object for downstream policy inspection. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/**
 * Codec error with a structured code.
 *
 * @internal
 */
export class CodecError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CodecError';
  }
}

/**
 * Internal codec strategy. v0.13.1 ships exactly one implementation:
 * jws-jwt. Signature mirrors @peac/crypto.signWire02 / verify exactly;
 * concrete Uint8Array keys (Ed25519 at this layer); parametric only on
 * the optional payload type T of VerifyResult<T>. Future codecs with
 * different key shapes register a different interface; they MAY NOT
 * shoehorn into this interface via parametric generics.
 *
 * @internal
 */
export interface RecordCodec {
  /** Codec name. Used for registry lookup. */
  readonly name: string;

  /**
   * Sign and serialize. Pure pass-through to the underlying signer; never
   * accepts a typ override (the signer hardcodes typ per the wire format).
   */
  encode(payload: unknown, privateKey: Uint8Array, kid: string): Promise<string>;

  /**
   * Verify and decode. Returns the underlying crypto verifier's result
   * unchanged. Throws structured CodecError on malformed input;
   * propagates the underlying CryptoError on signature mismatch.
   */
  decode<T = unknown>(serialized: string, publicKey: Uint8Array): Promise<VerifyResult<T>>;

  /**
   * Header-only decode. Structural strictness only: throws CodecError on
   * missing typ, missing alg, malformed protected header JSON, or
   * malformed compact JWS (must be exactly three non-empty
   * dot-separated segments). Does NOT enforce policy on crit / zip /
   * b64 / unsupported alg; those rejections are downstream JOSE-hardening
   * responsibilities and are surfaced via the raw header for inspection.
   *
   * Note: this codec is JWS/JWT string-based. The `serialized` parameter
   * is typed as `string` for that reason. Future codecs that operate on
   * binary inputs (e.g., COSE/CBOR over `Uint8Array`) MUST register a
   * different interface; do not generalize this one to imply binary
   * support that the JWS codec does not provide.
   */
  peekHeader(serialized: string): CodecHeader;
}
