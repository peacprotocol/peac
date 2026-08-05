/** I-JSON boundary: duplicate members, BOM, surrogates and UTF-8 handling. */
import { describe, it, expect } from 'vitest';
import {
  decodeFileBytesStrict,
  parseStrictJsonText,
  utf8ByteLength,
} from '../src/lib/strict-json.js';

const bad = (text: string, code: string) => {
  try {
    parseStrictJsonText(text, 'E_VERIFIER_KEY_JSON_INVALID');
  } catch (e) {
    expect((e as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe('I-JSON classification is preserved, not collapsed', () => {
  it('duplicate member name', () => bad('{"a":1,"a":2}', 'E_IJSON_DUPLICATE_MEMBER_NAME'));
  it('escaped-equivalent duplicate', () =>
    bad('{"kid":"a","\\u006b\\u0069\\u0064":"b"}', 'E_IJSON_DUPLICATE_MEMBER_NAME'));
  it('number out of range', () => bad('{"n":9007199254740993}', 'E_IJSON_NUMBER_OUT_OF_RANGE'));
  it('lone surrogate escape', () => bad('{"s":"\\ud800"}', 'E_IJSON_INVALID_STRING'));
});

describe('encoding hygiene', () => {
  it('rejects a leading BOM', () => bad('\uFEFF{"a":1}', 'E_VERIFIER_KEY_JSON_INVALID'));
  it('rejects an unpaired surrogate in the JS string', () =>
    bad('{"a":"\uD800"}', 'E_VERIFIER_KEY_JSON_INVALID'));
  it('accepts a valid surrogate pair', () => {
    expect(parseStrictJsonText('{"a":"😀"}', 'E_VERIFIER_KEY_JSON_INVALID')).toEqual({ a: '😀' });
  });
  it('accepts an escaped solidus', () => {
    expect(parseStrictJsonText('{"a":"\\/"}', 'E_VERIFIER_KEY_JSON_INVALID')).toEqual({ a: '/' });
  });
  it('rejects malformed UTF-8 file bytes with a fatal decoder', () => {
    const bytes = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    expect(() => decodeFileBytesStrict(bytes, 'E_VERIFIER_RECORD_MALFORMED')).toThrowError(/UTF-8/);
  });
  it('rejects overlong UTF-8', () => {
    const bytes = new Uint8Array([0xc0, 0x80]);
    expect(() => decodeFileBytesStrict(bytes, 'E_VERIFIER_RECORD_MALFORMED')).toThrowError(/UTF-8/);
  });
  it('counts UTF-8 bytes, not code units', () => {
    expect(utf8ByteLength('😀')).toBe(4);
  });
});
