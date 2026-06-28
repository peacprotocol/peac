/**
 * RFC 7493 (I-JSON) raw-bytes gate.
 *
 * Runs on the UTF-8 bytes of a JSON document BEFORE JSON.parse, because platform
 * JSON parsers can collapse duplicate object member names, round or overflow
 * numeric values, or substitute invalid string data before higher-level
 * validation sees the original bytes. The gate also classifies string-level
 * syntax failures consistently at the raw boundary. It rejects, per I-JSON
 * (RFC 7493):
 *
 *   - duplicate object member names  -> collapsed by JSON.parse (last wins)
 *     => CRYPTO_IJSON_DUPLICATE_MEMBER_NAME
 *   - numbers that are non-finite OR whose absolute magnitude exceeds 2^53-1
 *     (incl. large finite floats) -> rounded/overflowed by JSON.parse
 *     => CRYPTO_IJSON_NUMBER_OUT_OF_RANGE
 *   - invalid string content: lone surrogates or noncharacters (directly encoded
 *     or in \u escapes), invalid escape sequences, or invalid UTF-8 bytes
 *     inside a string => CRYPTO_IJSON_INVALID_STRING
 *
 * Escaped solidus ("\/") is valid I-JSON and MUST be accepted. String-encoded
 * large integers (inside quotes) are accepted. Valid surrogate PAIRS are
 * accepted. The numeric bound is exactly 9007199254740991 (= MAX_SAFE_INTEGER).
 *
 * This is a strict single-pass JSON parser operating on the RAW BYTES (it does
 * NOT pre-decode the whole document, so it can distinguish invalid UTF-8 INSIDE
 * a string -- an I-JSON pathology -> CRYPTO_IJSON_INVALID_STRING -- from bytes
 * that are not valid JSON at all -> the existing CRYPTO_INVALID_JWS_FORMAT code,
 * the same outcome JSON.parse would have produced). It does NOT build a value
 * tree (the existing JSON.parse does that next, on the same decoded bytes). Only
 * the three I-JSON pathologies get the new CRYPTO_IJSON_* codes.
 *
 * No BigInt is used for the numeric range check; range decisions are made by
 * bounded decimal-string comparison.
 *
 * @packageDocumentation
 */

import { CryptoError } from './errors';

/** 2^53 - 1 = Number.MAX_SAFE_INTEGER, as a digit string for magnitude compare. */
const MAX_SAFE_DIGITS = '9007199254740991';

/** Reused fatal UTF-8 decoder for validating raw byte runs inside strings. */
const FATAL_UTF8 = new TextDecoder('utf-8', { fatal: true });

// Byte constants (ASCII).
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const SPACE = 0x20;
const QUOTE = 0x22;
const PLUS = 0x2b;
const MINUS = 0x2d;
const DOT = 0x2e;
const ZERO = 0x30;
const NINE = 0x39;
const COLON = 0x3a;
const BACKSLASH = 0x5c;
const LBRACE = 0x7b;
const RBRACE = 0x7d;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;
const COMMA = 0x2c;

/**
 * Enforce I-JSON (RFC 7493) on the raw UTF-8 bytes of a JSON document.
 * Throws a CryptoError if the bytes violate I-JSON; returns void otherwise.
 *
 * @param bytes - the exact wire bytes of the JSON document (e.g. a base64url-decoded
 *   JWS protected header or payload), validated BEFORE JSON.parse.
 */
export function assertIJson(bytes: Uint8Array): void {
  const scanner = new IJsonScanner(bytes);
  scanner.parseValue();
  scanner.skipWhitespace();
  if (!scanner.atEnd()) {
    throw new CryptoError('CRYPTO_INVALID_JWS_FORMAT', 'I-JSON: trailing data after JSON value');
  }
}

class IJsonScanner {
  private readonly b: Uint8Array;
  private i: number;

  constructor(bytes: Uint8Array) {
    this.b = bytes;
    this.i = 0;
  }

  atEnd(): boolean {
    return this.i >= this.b.length;
  }

  private syntax(msg: string): never {
    throw new CryptoError('CRYPTO_INVALID_JWS_FORMAT', `I-JSON: ${msg}`);
  }

  private invalidString(msg: string): never {
    throw new CryptoError('CRYPTO_IJSON_INVALID_STRING', `I-JSON: ${msg}`);
  }

  skipWhitespace(): void {
    while (this.i < this.b.length) {
      const c = this.b[this.i];
      if (c === SPACE || c === TAB || c === LF || c === CR) this.i++;
      else break;
    }
  }

  parseValue(): void {
    this.skipWhitespace();
    if (this.atEnd()) this.syntax('unexpected end of input');
    const c = this.b[this.i];
    switch (c) {
      case LBRACE:
        this.parseObject();
        return;
      case LBRACKET:
        this.parseArray();
        return;
      case QUOTE:
        this.parseString();
        return;
      case 0x74: // 't'
        this.parseLiteral('true');
        return;
      case 0x66: // 'f'
        this.parseLiteral('false');
        return;
      case 0x6e: // 'n'
        this.parseLiteral('null');
        return;
      default:
        if (c === MINUS || (c >= ZERO && c <= NINE)) {
          this.parseNumber();
          return;
        }
        this.syntax(`unexpected byte 0x${c.toString(16)}`);
    }
  }

  private parseLiteral(lit: string): void {
    for (let k = 0; k < lit.length; k++) {
      if (this.b[this.i + k] !== lit.charCodeAt(k)) {
        this.syntax(`invalid literal, expected ${lit}`);
      }
    }
    this.i += lit.length;
  }

  private parseObject(): void {
    this.i++; // consume '{'
    const names = new Set<string>();
    this.skipWhitespace();
    if (this.b[this.i] === RBRACE) {
      this.i++;
      return;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.b[this.i] !== QUOTE) this.syntax('expected string member name');
      const name = this.parseString();
      if (names.has(name)) {
        throw new CryptoError(
          'CRYPTO_IJSON_DUPLICATE_MEMBER_NAME',
          'I-JSON: duplicate object member name'
        );
      }
      names.add(name);
      this.skipWhitespace();
      if (this.b[this.i] !== COLON) this.syntax("expected ':' after member name");
      this.i++;
      this.parseValue();
      this.skipWhitespace();
      const next = this.b[this.i];
      if (next === COMMA) {
        this.i++;
        continue;
      }
      if (next === RBRACE) {
        this.i++;
        return;
      }
      this.syntax("expected ',' or '}' in object");
    }
  }

  private parseArray(): void {
    this.i++; // consume '['
    this.skipWhitespace();
    if (this.b[this.i] === RBRACKET) {
      this.i++;
      return;
    }
    for (;;) {
      this.parseValue();
      this.skipWhitespace();
      const next = this.b[this.i];
      if (next === COMMA) {
        this.i++;
        continue;
      }
      if (next === RBRACKET) {
        this.i++;
        return;
      }
      this.syntax("expected ',' or ']' in array");
    }
  }

  /**
   * Parse a JSON string from raw bytes: validate escapes + surrogate pairing,
   * validate UTF-8 of raw byte runs, and return the decoded value (used for
   * duplicate-member-name comparison after escape processing per RFC 7493).
   */
  private parseString(): string {
    this.i++; // consume opening '"'
    let decoded = '';
    let runStart = this.i;
    const flushRun = (end: number): void => {
      if (end > runStart) {
        let chunk: string;
        try {
          chunk = FATAL_UTF8.decode(this.b.subarray(runStart, end));
        } catch {
          this.invalidString('invalid UTF-8 byte in string');
        }
        // RFC 7493: reject Unicode noncharacters in directly-encoded UTF-8 too.
        for (const ch of chunk) {
          if (isUnicodeNoncharacter(ch.codePointAt(0)!)) {
            this.invalidString('noncharacter in string');
          }
        }
        decoded += chunk;
      }
    };
    for (;;) {
      if (this.atEnd()) this.invalidString('unterminated string');
      const c = this.b[this.i];
      if (c === QUOTE) {
        flushRun(this.i);
        this.i++;
        return decoded;
      }
      if (c === BACKSLASH) {
        flushRun(this.i);
        this.i++; // consume '\'
        if (this.atEnd()) this.invalidString('unterminated escape sequence');
        const e = this.b[this.i];
        switch (e) {
          case QUOTE:
            decoded += '"';
            this.i++;
            break;
          case BACKSLASH:
            decoded += '\\';
            this.i++;
            break;
          case 0x2f: // '/'
            decoded += '/';
            this.i++;
            break;
          case 0x62: // 'b'
            decoded += '\b';
            this.i++;
            break;
          case 0x66: // 'f'
            decoded += '\f';
            this.i++;
            break;
          case 0x6e: // 'n'
            decoded += '\n';
            this.i++;
            break;
          case 0x72: // 'r'
            decoded += '\r';
            this.i++;
            break;
          case 0x74: // 't'
            decoded += '\t';
            this.i++;
            break;
          case 0x75: {
            // 'u'
            this.i++;
            const hi = this.readHex4();
            if (hi >= 0xd800 && hi <= 0xdbff) {
              if (this.b[this.i] !== BACKSLASH || this.b[this.i + 1] !== 0x75) {
                this.invalidString('lone high surrogate in \\u escape');
              }
              this.i += 2; // consume "\u" of low surrogate
              const lo = this.readHex4();
              if (lo < 0xdc00 || lo > 0xdfff) {
                this.invalidString('high surrogate not followed by a low surrogate');
              }
              const cp = 0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00);
              if (isUnicodeNoncharacter(cp)) {
                this.invalidString('noncharacter in string');
              }
              decoded += String.fromCharCode(hi, lo);
            } else if (hi >= 0xdc00 && hi <= 0xdfff) {
              this.invalidString('lone low surrogate in \\u escape');
            } else {
              if (isUnicodeNoncharacter(hi)) {
                this.invalidString('noncharacter in string');
              }
              decoded += String.fromCharCode(hi);
            }
            break;
          }
          default:
            this.invalidString('invalid escape sequence');
        }
        runStart = this.i;
        continue;
      }
      if (c < 0x20) {
        // unescaped control character is not allowed in a JSON string
        this.syntax('unescaped control character in string');
      }
      // Normal byte (printable ASCII, or part of a multibyte UTF-8 sequence
      // validated together by flushRun via the fatal decoder).
      this.i++;
    }
  }

  private readHex4(): number {
    if (this.i + 4 > this.b.length) this.invalidString('truncated \\u escape');
    let v = 0;
    for (let k = 0; k < 4; k++) {
      const ch = this.b[this.i + k];
      let d: number;
      if (ch >= 0x30 && ch <= 0x39)
        d = ch - 0x30; // 0-9
      else if (ch >= 0x41 && ch <= 0x46)
        d = ch - 0x41 + 10; // A-F
      else if (ch >= 0x61 && ch <= 0x66)
        d = ch - 0x61 + 10; // a-f
      else {
        this.invalidString('invalid hex digit in \\u escape');
      }
      v = v * 16 + d;
    }
    this.i += 4;
    return v;
  }

  /** ASCII byte slice -> string (the number literal is pure ASCII). */
  private asciiSlice(start: number, end: number): string {
    let s = '';
    for (let k = start; k < end; k++) s += String.fromCharCode(this.b[k]);
    return s;
  }

  /** Parse a JSON number literal (ASCII) and enforce the I-JSON range predicate. */
  private parseNumber(): void {
    if (this.b[this.i] === MINUS) this.i++;
    // integer part
    const intStart = this.i;
    if (this.b[this.i] === ZERO) {
      this.i++;
    } else if (this.b[this.i] >= 0x31 && this.b[this.i] <= NINE) {
      while (this.b[this.i] >= ZERO && this.b[this.i] <= NINE) this.i++;
    } else {
      this.syntax('invalid number: missing integer digits');
    }
    const intDigits = this.asciiSlice(intStart, this.i);
    // fraction part
    let fracDigits = '';
    if (this.b[this.i] === DOT) {
      this.i++;
      const fracStart = this.i;
      if (!(this.b[this.i] >= ZERO && this.b[this.i] <= NINE)) {
        this.syntax('invalid number: missing fraction digits');
      }
      while (this.b[this.i] >= ZERO && this.b[this.i] <= NINE) this.i++;
      fracDigits = this.asciiSlice(fracStart, this.i);
    }
    // exponent part (kept as digits + sign; never parsed into a JS number, so a
    // huge exponent cannot overflow or trigger a large allocation)
    let expDigits = '';
    let expNegative = false;
    if (this.b[this.i] === 0x65 || this.b[this.i] === 0x45) {
      // 'e' | 'E'
      this.i++;
      if (this.b[this.i] === PLUS) this.i++;
      else if (this.b[this.i] === MINUS) {
        expNegative = true;
        this.i++;
      }
      const expStart = this.i;
      if (!(this.b[this.i] >= ZERO && this.b[this.i] <= NINE)) {
        this.syntax('invalid number: missing exponent digits');
      }
      while (this.b[this.i] >= ZERO && this.b[this.i] <= NINE) this.i++;
      expDigits = this.asciiSlice(expStart, this.i);
    }

    if (numberMagnitudeExceedsSafe(intDigits, fracDigits, expDigits, expNegative)) {
      throw new CryptoError(
        'CRYPTO_IJSON_NUMBER_OUT_OF_RANGE',
        'I-JSON: number is non-finite or exceeds the safe numeric range; encode large values as strings'
      );
    }
  }
}

/**
 * I-JSON number magnitude predicate. Returns true if the number must be REJECTED
 * because its absolute decimal magnitude is greater than 9007199254740991
 * (= 2^53 - 1). Exact for every JSON number form (integer, fraction, exponent):
 * the comparison is performed on the decimal digit string against the bound, so
 * binary64 rounding can never accept a value whose exact magnitude exceeds the
 * bound (e.g. 9007199254740991.1). No BigInt is used; range decisions are made by
 * bounded decimal-string comparison. The exponent is consumed as digits + sign
 * and clamped, so an arbitrarily large exponent cannot overflow or allocate.
 *
 * value = M * 10^decimalExp, where M is the significand digits (leading zeros
 * stripped) and decimalExp = exp - len(fracDigits). intDigitCount is the number
 * of integer digits of the magnitude.
 */
function numberMagnitudeExceedsSafe(
  intDigits: string,
  fracDigits: string,
  expDigits: string,
  expNegative: boolean
): boolean {
  const sig = stripLeadingZeros(intDigits + fracDigits);
  if (sig === '0') return false; // value is exactly 0
  const L = sig.length;

  const decimalExp = clampedExp(expDigits, expNegative) - fracDigits.length;
  const intDigitCount = L + decimalExp; // integer digits of the magnitude

  const BOUND = MAX_SAFE_DIGITS; // 16 digits
  if (intDigitCount > BOUND.length) return true; // >= 10^16 > bound
  if (intDigitCount < BOUND.length) return false; // < 10^15 < bound

  // intDigitCount === 16: compare the 16-digit integer part exactly.
  if (decimalExp >= 0) {
    // integer value: M right-padded with decimalExp zeros (total length 16).
    const intPart = sig + '0'.repeat(decimalExp);
    return intPart > BOUND;
  }
  // decimalExp < 0: integer part is the first 16 digits; remainder is fractional.
  const intPart = sig.slice(0, BOUND.length);
  if (intPart > BOUND) return true;
  if (intPart < BOUND) return false;
  // integer part == bound: any nonzero fractional digit pushes magnitude over.
  return /[1-9]/.test(sig.slice(BOUND.length));
}

/**
 * Parse an exponent digit string + sign into a JS integer, clamped so a very
 * large exponent cannot overflow. The clamp magnitude (1e9) far exceeds any
 * possible significand length for size-bounded inputs, so a clamped exponent
 * always drives intDigitCount past the decision boundary in the correct direction.
 */
function clampedExp(expDigits: string, expNegative: boolean): number {
  if (expDigits.length === 0) return 0;
  // Strip leading zeros BEFORE the length-based clamp so a zero-padded exponent
  // (e.g. 1e0000000003 == 1e3) is not mistaken for a huge exponent.
  const normalized = stripLeadingZeros(expDigits);
  if (normalized === '0') return 0;
  const mag = normalized.length > 9 ? 1_000_000_000 : Number(normalized);
  return expNegative ? -mag : mag;
}

function stripLeadingZeros(digits: string): string {
  let j = 0;
  while (j < digits.length - 1 && digits[j] === '0') j++;
  return digits.slice(j);
}

/**
 * RFC 7493: a JSON string (and member name) MUST NOT contain Unicode
 * noncharacters, in directly-encoded or escaped form. The 66 noncharacters are
 * U+FDD0..U+FDEF and the last two code points of every plane (U+xFFFE, U+xFFFF).
 */
function isUnicodeNoncharacter(cp: number): boolean {
  return (
    (cp >= 0xfdd0 && cp <= 0xfdef) ||
    (cp >= 0xfffe && cp <= 0x10ffff && ((cp & 0xffff) === 0xfffe || (cp & 0xffff) === 0xffff))
  );
}
