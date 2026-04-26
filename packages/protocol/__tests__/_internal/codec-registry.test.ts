/**
 * Codec registry invariants.
 *
 * v0.13.1 ships exactly one codec: jws-jwt. Any other name throws
 * CodecError('CODEC_UNKNOWN', ...). COSE/CBOR is hook-only in v0.13.1;
 * no implementation.
 */

import { describe, expect, it } from 'vitest';
import {
  defaultCodec,
  getCodec,
  CodecError,
  _registeredCodecNames,
} from '../../src/_internal/record-core/codec/index.js';

describe('codec registry', () => {
  it('contains exactly one codec: jws-jwt', () => {
    expect(_registeredCodecNames()).toEqual(['jws-jwt']);
  });

  it('getCodec("jws-jwt") returns defaultCodec', () => {
    expect(getCodec('jws-jwt')).toBe(defaultCodec);
  });

  it('getCodec("cose-sign1") throws CodecError("CODEC_UNKNOWN", ...)', () => {
    let caught: unknown;
    try {
      getCodec('cose-sign1');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_UNKNOWN');
    expect((caught as CodecError).message).toMatch(/cose-sign1/);
  });

  it('getCodec for any other name throws CodecError("CODEC_UNKNOWN", ...)', () => {
    for (const name of ['', 'unknown', 'jws', 'JWS-JWT']) {
      expect(() => getCodec(name)).toThrow(CodecError);
    }
  });

  it('defaultCodec.name === "jws-jwt"', () => {
    expect(defaultCodec.name).toBe('jws-jwt');
  });
});
