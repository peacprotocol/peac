import { describe, it, expect } from 'vitest';
import { parseSignatureInput, parseSignatureHeader, parseSignature } from '../src/parser.js';
import { HttpSignatureError, ErrorCodes } from '../src/errors.js';

describe('parseSignatureInput', () => {
  it('parses basic signature input', () => {
    const input = 'sig1=("@method" "@path");created=1618884473;keyid="test-key";alg="ed25519"';
    const result = parseSignatureInput(input);

    expect(result.size).toBe(1);
    expect(result.has('sig1')).toBe(true);

    const params = result.get('sig1')!;
    expect(params.coveredComponents).toEqual(['@method', '@path']);
    expect(params.created).toBe(1618884473);
    expect(params.keyid).toBe('test-key');
    expect(params.alg).toBe('ed25519');
  });

  it('parses signature input with optional parameters', () => {
    const input =
      'sig1=("@method");created=1618884473;expires=1618884533;nonce="abc123";keyid="key1";alg="ed25519";tag="agent-browser-auth"';
    const result = parseSignatureInput(input);

    const params = result.get('sig1')!;
    expect(params.expires).toBe(1618884533);
    expect(params.nonce).toBe('abc123');
    expect(params.tag).toBe('agent-browser-auth');
  });

  it('parses multiple signatures', () => {
    const input =
      'sig1=("@method");created=1;keyid="k1";alg="ed25519", sig2=("@path");created=2;keyid="k2";alg="ed25519"';
    const result = parseSignatureInput(input);

    expect(result.size).toBe(2);
    expect(result.has('sig1')).toBe(true);
    expect(result.has('sig2')).toBe(true);
  });

  it('parses empty input', () => {
    const result = parseSignatureInput('');
    expect(result.size).toBe(0);
  });
});

describe('parseSignatureHeader', () => {
  it('parses signature header', () => {
    const header = 'sig1=:dGVzdA==:';
    const result = parseSignatureHeader(header);

    expect(result.size).toBe(1);
    expect(result.has('sig1')).toBe(true);

    const sig = result.get('sig1')!;
    expect(sig.base64).toBe('dGVzdA==');
    expect(sig.bytes).toEqual(new Uint8Array([116, 101, 115, 116])); // "test"
  });

  it('parses multiple signatures', () => {
    const header = 'sig1=:YWJj:, sig2=:ZGVm:';
    const result = parseSignatureHeader(header);

    expect(result.size).toBe(2);
    expect(result.get('sig1')!.bytes).toEqual(new Uint8Array([97, 98, 99])); // "abc"
    expect(result.get('sig2')!.bytes).toEqual(new Uint8Array([100, 101, 102])); // "def"
  });

  // The Signature value is a Structured Field Byte Sequence: the RFC 4648
  // Section 4 base64 alphabet (RFC 9651 Section 3.3.5), NOT base64url. Per
  // RFC 9651 parsing, absent padding is synthesized on decode, so valid
  // unpadded standard base64 is accepted.
  it('accepts valid standard base64, padded or unpadded', () => {
    expect(parseSignatureHeader('sig1=:AAEC/w==:').get('sig1')!.bytes).toEqual(
      new Uint8Array([0, 1, 2, 255])
    );
    expect(parseSignatureHeader('sig1=:YWJj:').get('sig1')!.bytes).toEqual(
      new Uint8Array([97, 98, 99]) // "abc"
    );
    expect(parseSignatureHeader('sig1=:YWI:').get('sig1')!.bytes).toEqual(
      new Uint8Array([97, 98]) // "ab", unpadded (RFC 9651 synthesizes padding)
    );
    expect(parseSignatureHeader('sig1=:YQ:').get('sig1')!.bytes).toEqual(
      new Uint8Array([97]) // "a", unpadded
    );
  });

  it('rejects base64url ("-" and "_") in the Signature value', () => {
    for (const header of ['sig1=:ab-d:', 'sig1=:ab_d:']) {
      expect(() => parseSignatureHeader(header)).toThrow(HttpSignatureError);
    }
  });

  it('rejects malformed padding / length in the Signature value', () => {
    const bad = [
      'sig1=:YW==YWI=:', // padding in the middle
      'sig1=:YQ===:', // too much padding
      'sig1=:YWJjZ:', // length % 4 === 1 (unrepairable by synthesized padding)
      'sig1=:Y:', // length % 4 === 1 (single char)
      'sig1=:YW Jj:', // whitespace inside the byte sequence
      'sig1=::', // empty byte sequence (no behavior widening)
    ];
    for (const header of bad) {
      expect(() => parseSignatureHeader(header)).toThrow(HttpSignatureError);
    }
  });
});

describe('parseSignature', () => {
  it('throws on missing signature-input', () => {
    expect(() => parseSignature('', 'sig1=:dGVzdA==:')).toThrow(HttpSignatureError);
  });

  it('throws on missing signature', () => {
    const input = 'sig1=("@method");created=1;keyid="k";alg="ed25519"';
    expect(() => parseSignature(input, '')).toThrow(HttpSignatureError);
  });

  it('throws on missing keyid', () => {
    const input = 'sig1=("@method");created=1;alg="ed25519"';
    try {
      parseSignature(input, 'sig1=:dGVzdA==:');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpSignatureError);
      expect((e as HttpSignatureError).code).toBe(ErrorCodes.SIGNATURE_PARAM_MISSING);
    }
  });

  it('parses complete signature', () => {
    const input = 'sig1=("@method" "@path");created=1618884473;keyid="test-key";alg="ed25519"';
    const sig = 'sig1=:dGVzdA==:';

    const result = parseSignature(input, sig);

    expect(result.label).toBe('sig1');
    expect(result.params.keyid).toBe('test-key');
    expect(result.params.alg).toBe('ed25519');
    expect(result.params.created).toBe(1618884473);
    expect(result.params.coveredComponents).toEqual(['@method', '@path']);
    expect(result.signatureBase64).toBe('dGVzdA==');
  });
});
