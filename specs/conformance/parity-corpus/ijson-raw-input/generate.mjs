/**
 * Deterministic generator for the ijson-raw-input parity corpus.
 *
 * Each vector's `input_b64` is the base64url (RFC 4648 Section 5, no padding) of
 * the RAW JSON document bytes. A raw-bytes corpus is required because a
 * parsed-object corpus physically cannot represent a duplicate member name (the
 * parser collapses it before any test sees it) or a precision-losing number.
 *
 * Regenerate: `node specs/conformance/parity-corpus/ijson-raw-input/generate.mjs`
 * (writes vectors.json next to this file). Deterministic: no clock, no randomness.
 *
 * Codes are the canonical public PEAC error codes (E_IJSON_*). The TypeScript
 * gate throws internal CRYPTO_IJSON_* codes that map 1:1 by replacing the
 * CRYPTO_ prefix with E_; the Go gate returns the E_IJSON_* code directly.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const fromText = (s) => b64url(Buffer.from(s, 'utf8'));

/** Build raw bytes from a template where `0xFF` injects a literal invalid UTF-8 byte. */
const withRawByte = (prefix, byte, suffix) =>
  b64url(
    Buffer.concat([Buffer.from(prefix, 'utf8'), Buffer.from([byte]), Buffer.from(suffix, 'utf8')])
  );

/**
 * Build raw bytes from a template, injecting `bytes` (a byte array) verbatim
 * between prefix and suffix. Used so source files never contain a literal Unicode
 * noncharacter; the noncharacter is expressed only as its raw UTF-8 byte sequence.
 */
const withRawBytes = (prefix, bytes, suffix) =>
  b64url(
    Buffer.concat([Buffer.from(prefix, 'utf8'), Buffer.from(bytes), Buffer.from(suffix, 'utf8')])
  );

const reject = (id, description, code, input_b64) => ({
  id,
  description,
  input_b64,
  expected: { accepted: false, code },
});
const accept = (id, description, input_b64) => ({
  id,
  description,
  input_b64,
  expected: { accepted: true },
});

const DUP = 'E_IJSON_DUPLICATE_MEMBER_NAME';
const NUM = 'E_IJSON_NUMBER_OUT_OF_RANGE';
const STR = 'E_IJSON_INVALID_STRING';

const vectors = [
  // --- REJECT: duplicate member name ---
  reject(
    'duplicate-member-name-payload',
    'two members named "a" in the same object',
    DUP,
    fromText('{"a":1,"a":2}')
  ),
  reject(
    'duplicate-member-name-nested',
    'duplicate member name inside a nested object',
    DUP,
    fromText('{"x":{"a":1,"a":2}}')
  ),
  reject(
    'duplicate-member-name-header',
    'duplicate "alg" in a JWS-header-shaped object',
    DUP,
    fromText('{"alg":"EdDSA","alg":"none","typ":"interaction-record+jwt","kid":"k"}')
  ),
  reject(
    'duplicate-member-name-escaped-equivalent',
    'member names equal only AFTER escape processing ("a\\/b" decodes to "a/b"); proves duplicate detection is post-unescape, not raw-substring',
    DUP,
    fromText('{"a\\/b":1,"a/b":2}')
  ),

  // --- REJECT: number (non-finite or magnitude > 2^53-1, incl. large finite floats) ---
  reject(
    'integer-max-safe-plus-one',
    '2^53 (= MAX_SAFE_INTEGER + 1)',
    NUM,
    fromText('{"n":9007199254740992}')
  ),
  reject('integer-2pow53-plus-one', '2^53 + 1', NUM, fromText('{"n":9007199254740993}')),
  reject('integer-min-safe-minus-one', '-(2^53)', NUM, fromText('{"n":-9007199254740992}')),
  reject('large-exponent', '1e400 (overflows binary64)', NUM, fromText('{"n":1e400}')),
  reject(
    'large-integer-exponent',
    '9007199254740993e0 (integer-valued via exponent)',
    NUM,
    fromText('{"n":9007199254740993e0}')
  ),
  reject(
    'fraction-over-safe-range',
    '9007199254740991.5 (rounds to 2^53)',
    NUM,
    fromText('{"n":9007199254740991.5}')
  ),
  reject(
    'fraction-just-over-safe-range',
    '9007199254740991.1 (exact magnitude > bound; binary64 would round to bound)',
    NUM,
    fromText('{"n":9007199254740991.1}')
  ),
  reject(
    'negative-fraction-just-over-safe',
    '-9007199254740991.1 (exact magnitude > bound)',
    NUM,
    fromText('{"n":-9007199254740991.1}')
  ),
  reject('large-finite-float', '1e16 (finite float > 2^53-1)', NUM, fromText('{"n":1e16}')),
  reject(
    'large-negative-finite-float',
    '-1e16 (finite float < -(2^53-1))',
    NUM,
    fromText('{"n":-1e16}')
  ),
  reject(
    'huge-positive-exponent-digits',
    '1e999999999999999999999999 (exponent overflows int; must reject)',
    NUM,
    fromText('{"n":1e999999999999999999999999}')
  ),

  // --- REJECT: string (lone surrogate / invalid escape / invalid UTF-8 / unterminated) ---
  reject(
    'lone-high-surrogate',
    'lone high surrogate in a \\u escape (U+D800)',
    STR,
    fromText('{"s":"\\uD800"}')
  ),
  reject(
    'lone-low-surrogate',
    'lone low surrogate in a \\u escape (U+DC00)',
    STR,
    fromText('{"s":"\\uDC00"}')
  ),
  reject(
    'invalid-utf8-byte',
    'raw 0xFF byte inside a string (invalid UTF-8)',
    STR,
    withRawByte('{"s":"', 0xff, '"}')
  ),
  reject('invalid-escape', 'invalid escape sequence \\x', STR, fromText('{"s":"\\x"}')),
  reject(
    'bad-unicode-escape',
    'non-hex digits in a \\u escape (\\uZZZZ)',
    STR,
    fromText('{"s":"\\uZZZZ"}')
  ),
  reject('unterminated-string', 'string with no closing quote', STR, fromText('{"s":"abc}')),

  // --- REJECT: Unicode noncharacters (RFC 7493; escaped + raw, in values + member names) ---
  reject(
    'noncharacter-string-fdd0-escaped',
    'noncharacter U+FDD0 in a \\u escape',
    STR,
    fromText('{"s":"\\uFDD0"}')
  ),
  reject(
    'noncharacter-string-fdef-escaped',
    'noncharacter U+FDEF in a \\u escape',
    STR,
    fromText('{"s":"\\uFDEF"}')
  ),
  reject(
    'noncharacter-string-ffff-escaped',
    'noncharacter U+FFFF in a \\u escape',
    STR,
    fromText('{"s":"\\uFFFF"}')
  ),
  reject(
    'noncharacter-string-plane-fffe-escaped',
    'astral noncharacter U+1FFFE via surrogate pair \\uD83F\\uDFFE',
    STR,
    fromText('{"s":"\\uD83F\\uDFFE"}')
  ),
  reject(
    'noncharacter-member-name-escaped',
    'noncharacter U+FDD0 in a member name',
    STR,
    fromText('{"\\uFDD0":1}')
  ),
  reject(
    'noncharacter-string-fdd0-raw',
    'noncharacter U+FDD0 as raw UTF-8 bytes (ef b7 90) inside a string',
    STR,
    withRawBytes('{"s":"', [0xef, 0xb7, 0x90], '"}')
  ),

  // --- ACCEPT: boundary integers, exponents, fractions ---
  accept(
    'integer-max-safe-ACCEPTED',
    '9007199254740991 (= MAX_SAFE_INTEGER)',
    fromText('{"n":9007199254740991}')
  ),
  accept('integer-min-safe-ACCEPTED', '-9007199254740991', fromText('{"n":-9007199254740991}')),
  accept('integer-via-exponent-ACCEPTED', '1e3 (= 1000)', fromText('{"n":1e3}')),
  accept('fraction-in-range-ACCEPTED', '1.5', fromText('{"n":1.5}')),
  accept('small-decimal-ACCEPTED', '0.0001', fromText('{"n":0.0001}')),
  accept(
    'safe-fraction-near-bound-ACCEPTED',
    '9007199254740990.5 (< bound; has a fractional part)',
    fromText('{"n":9007199254740990.5}')
  ),
  accept(
    'tiny-negative-exponent-ACCEPTED',
    '1e-999999 (magnitude far below 1; exponent must not overflow)',
    fromText('{"n":1e-999999}')
  ),
  accept(
    'leading-zero-exponent-zero-ACCEPTED',
    '1e0000000000 (== 1e0 == 1; zero-padded exponent must not be treated as huge)',
    fromText('{"n":1e0000000000}')
  ),
  accept(
    'leading-zero-exponent-positive-ACCEPTED',
    '1e0000000003 (== 1e3 == 1000; zero-padded exponent)',
    fromText('{"n":1e0000000003}')
  ),

  // --- ACCEPT: string escapes that are valid I-JSON ---
  accept('escaped-quote-ACCEPTED', 'escaped double quote \\"', fromText('{"u":"a\\"b"}')),
  accept('escaped-backslash-ACCEPTED', 'escaped backslash \\\\', fromText('{"u":"a\\\\b"}')),
  accept(
    'escaped-solidus-ACCEPTED',
    'escaped solidus \\/ (valid I-JSON, MUST accept)',
    fromText('{"u":"http:\\/\\/x"}')
  ),
  accept('escaped-newline-ACCEPTED', 'escaped newline \\n', fromText('{"u":"a\\nb"}')),
  accept(
    'escaped-carriage-return-ACCEPTED',
    'escaped carriage return \\r',
    fromText('{"u":"a\\rb"}')
  ),
  accept('escaped-tab-ACCEPTED', 'escaped tab \\t', fromText('{"u":"a\\tb"}')),
  accept('escaped-backspace-ACCEPTED', 'escaped backspace \\b', fromText('{"u":"a\\bb"}')),
  accept('escaped-formfeed-ACCEPTED', 'escaped form feed \\f', fromText('{"u":"a\\fb"}')),
  accept(
    'valid-surrogate-pair-ACCEPTED',
    'valid surrogate pair \\uD83D\\uDE00 (U+1F600)',
    fromText('{"s":"\\uD83D\\uDE00"}')
  ),

  // --- ACCEPT: string-encoded large integer (the canonical PEAC representation) ---
  accept(
    'string-typed-large-number-ACCEPTED',
    'large integer encoded as a string',
    fromText('{"amount_minor":"9007199254740993"}')
  ),

  // --- ACCEPT: a realistic PEAC JWS protected header ---
  accept(
    'valid-peac-header-payload-ACCEPTED',
    'a normal PEAC protected header object',
    fromText('{"alg":"EdDSA","typ":"interaction-record+jwt","kid":"2026-01-01T00:00:00Z"}')
  ),
];

const corpus = {
  family: 'ijson-raw-input',
  description:
    'Raw-bytes I-JSON (RFC 7493) rejection/acceptance vectors proving the TypeScript and Go reference gates reach the same decision before JSON parsing. Inputs are base64url of the raw JSON document bytes.',
  version: '1',
  status: 'Informative',
  vectors,
};

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'vectors.json'), JSON.stringify(corpus, null, 2) + '\n');
console.log(`wrote vectors.json: ${vectors.length} vectors`);
