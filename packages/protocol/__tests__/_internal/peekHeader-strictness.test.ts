/**
 * peekHeader structural strictness.
 *
 * 8 cases pin the codec-vs-policy split:
 *   - 4 codec rejections: missing typ, missing alg, malformed header
 *     JSON, malformed compact JWS;
 *   - 4 surfaced-in-raw: unsupported alg, crit, zip, b64:false. These
 *     are downstream JOSE-hardening responsibilities, NOT codec
 *     responsibilities.
 */

import { describe, expect, it } from 'vitest';
import { base64urlEncodeString } from '@peac/crypto';
import { defaultCodec, CodecError } from '../../src/_internal/record-core/codec/index.js';

// Runtime-neutral base64url helper. Mirrors how production codec code
// decodes (no Node Buffer dependency).
function b64url(obj: unknown): string {
  return base64urlEncodeString(JSON.stringify(obj));
}

function fakeJws(headerObj: unknown): string {
  const header = b64url(headerObj);
  const payload = b64url({ msg: 'hi' });
  // Fixed signature segment (does NOT validate; peekHeader does no
  // signature verification - it is a header-only diagnostic).
  return `${header}.${payload}.AAAA`;
}

describe('peekHeader: codec rejections (4 cases)', () => {
  it('throws CODEC_PEEK_MISSING_TYP when typ is absent', () => {
    let caught: unknown;
    try {
      defaultCodec.peekHeader(fakeJws({ alg: 'EdDSA', kid: 'k1' }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_MISSING_TYP');
  });

  it('throws CODEC_PEEK_MISSING_ALG when alg is absent', () => {
    let caught: unknown;
    try {
      defaultCodec.peekHeader(fakeJws({ typ: 'interaction-record+jwt', kid: 'k1' }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_MISSING_ALG');
  });

  it('throws CODEC_PEEK_INVALID_HEADER when header is non-JSON', () => {
    const invalidHeaderB64 = base64urlEncodeString('not-json');
    const jws = `${invalidHeaderB64}.${b64url({})}.AAAA`;
    let caught: unknown;
    try {
      defaultCodec.peekHeader(jws);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_INVALID_HEADER');
  });

  it('throws CODEC_PEEK_MALFORMED with no dots (1 segment)', () => {
    let caught: unknown;
    try {
      defaultCodec.peekHeader('singlesegment');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_MALFORMED');
  });

  it('throws CODEC_PEEK_MALFORMED with one dot (2 segments)', () => {
    let caught: unknown;
    try {
      defaultCodec.peekHeader('aaa.bbb');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_MALFORMED');
  });

  it('throws CODEC_PEEK_MALFORMED with three dots (4 segments)', () => {
    let caught: unknown;
    try {
      defaultCodec.peekHeader('a.b.c.d');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_MALFORMED');
  });

  it('throws CODEC_PEEK_MALFORMED when header segment is empty', () => {
    let caught: unknown;
    try {
      defaultCodec.peekHeader('.payload.sig');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_MALFORMED');
  });

  it('throws CODEC_PEEK_MALFORMED when payload segment is empty', () => {
    let caught: unknown;
    try {
      defaultCodec.peekHeader('header..sig');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_MALFORMED');
  });

  it('throws CODEC_PEEK_MALFORMED when signature segment is empty', () => {
    let caught: unknown;
    try {
      defaultCodec.peekHeader('header.payload.');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CodecError);
    expect((caught as CodecError).code).toBe('CODEC_PEEK_MALFORMED');
  });
});

describe('peekHeader: surfaced-in-raw (4 cases; downstream policy)', () => {
  it('accepts unsupported alg and surfaces it in raw.alg', () => {
    const jws = fakeJws({ typ: 'interaction-record+jwt', alg: 'RS256', kid: 'k1' });
    const header = defaultCodec.peekHeader(jws);
    expect(header.alg).toBe('RS256');
    expect(header.raw.alg).toBe('RS256');
  });

  it('accepts crit and surfaces it in raw.crit', () => {
    const jws = fakeJws({
      typ: 'interaction-record+jwt',
      alg: 'EdDSA',
      kid: 'k1',
      crit: ['exp'],
    });
    const header = defaultCodec.peekHeader(jws);
    expect(header.raw.crit).toEqual(['exp']);
  });

  it('accepts zip and surfaces it in raw.zip', () => {
    const jws = fakeJws({
      typ: 'interaction-record+jwt',
      alg: 'EdDSA',
      kid: 'k1',
      zip: 'DEF',
    });
    const header = defaultCodec.peekHeader(jws);
    expect(header.raw.zip).toBe('DEF');
  });

  it('accepts b64:false and surfaces it in raw.b64', () => {
    const jws = fakeJws({
      typ: 'interaction-record+jwt',
      alg: 'EdDSA',
      kid: 'k1',
      b64: false,
    });
    const header = defaultCodec.peekHeader(jws);
    expect(header.raw.b64).toBe(false);
  });
});

describe('peekHeader: happy path', () => {
  it('returns typ, alg, kid, and full raw header for a valid Wire 0.2 JWS', () => {
    const jws = fakeJws({ typ: 'interaction-record+jwt', alg: 'EdDSA', kid: 'k1' });
    const header = defaultCodec.peekHeader(jws);
    expect(header.typ).toBe('interaction-record+jwt');
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe('k1');
    expect(header.raw).toEqual({
      typ: 'interaction-record+jwt',
      alg: 'EdDSA',
      kid: 'k1',
    });
  });
});
