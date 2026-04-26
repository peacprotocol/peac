/**
 * Internal codec registry.
 *
 * @internal
 *
 * v0.13.1 ships exactly one codec: jws-jwt. Future codecs (e.g.,
 * cose-sign1 per RFC 9052) register here. COSE/CBOR is hook-only in
 * v0.13.1; no implementation.
 */

import { CodecError, type CodecHeader, type RecordCodec } from './types.js';
import { defaultCodec } from './jws-jwt.js';

const codecRegistry = new Map<string, RecordCodec>();
codecRegistry.set('jws-jwt', defaultCodec);

/**
 * Internal codec registry lookup. v0.13.1 has only `jws-jwt` registered;
 * any other name throws `CodecError('CODEC_UNKNOWN', ...)`.
 *
 * @internal
 */
export function getCodec(name: string): RecordCodec {
  const codec = codecRegistry.get(name);
  if (!codec) {
    throw new CodecError('CODEC_UNKNOWN', `Codec "${name}" not registered`);
  }
  return codec;
}

/**
 * Test-only registry view. Returns the registry's keys snapshot.
 *
 * @internal
 */
export function _registeredCodecNames(): readonly string[] {
  return [...codecRegistry.keys()];
}

export { defaultCodec, CodecError };
export type { CodecHeader, RecordCodec };
