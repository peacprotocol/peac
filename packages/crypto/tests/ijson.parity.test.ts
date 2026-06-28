/**
 * I-JSON (RFC 7493) raw-input parity tests against the shared corpus at
 * specs/conformance/parity-corpus/ijson-raw-input/.
 *
 * The corpus is the single source of truth for the cross-language accept/reject
 * contract; the Go implementation in sdks/go/ijson_parity_test.go runs the same
 * vectors and must reach identical decisions with identical public codes.
 *
 * assertIJson throws an internal CryptoError with a CRYPTO_IJSON_* code (or
 * CRYPTO_INVALID_JWS_FORMAT for a generic syntax error). The corpus stores the
 * canonical public E_IJSON_* code; the 1:1 mapping is "replace CRYPTO_ with E_".
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { assertIJson } from '../src/ijson.js';
import { CryptoError, isFormatError } from '../src/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(
  __dirname,
  '../../../specs/conformance/parity-corpus/ijson-raw-input/vectors.json'
);

interface Vector {
  id: string;
  description: string;
  input_b64: string;
  expected: { accepted: boolean; code?: string };
}

interface Corpus {
  family: string;
  version: string;
  vectors: Vector[];
}

const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus;

/** base64url decode to raw bytes (Node Buffer supports 'base64url'). */
function decodeB64Url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

/** Map an internal CRYPTO_* code to the canonical public E_* code. */
function toPublicCode(code: string): string {
  return code.replace(/^CRYPTO_/, 'E_');
}

describe('ijson-raw-input parity corpus (TypeScript assertIJson)', () => {
  it('corpus is the expected family and non-empty', () => {
    expect(corpus.family).toBe('ijson-raw-input');
    expect(corpus.vectors.length).toBeGreaterThan(0);
  });

  it('vector ids are unique', () => {
    const ids = corpus.vectors.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const v of corpus.vectors) {
    it(`${v.id}: ${v.description}`, () => {
      const bytes = decodeB64Url(v.input_b64);
      if (v.expected.accepted) {
        expect(() => assertIJson(bytes)).not.toThrow();
      } else {
        let thrown: unknown;
        try {
          assertIJson(bytes);
        } catch (e) {
          thrown = e;
        }
        expect(thrown).toBeInstanceOf(CryptoError);
        const code = toPublicCode((thrown as CryptoError).code);
        expect(code).toBe(v.expected.code);
      }
    });
  }

  it('covers all three I-JSON reject codes', () => {
    const codes = new Set(
      corpus.vectors.filter((v) => !v.expected.accepted).map((v) => v.expected.code)
    );
    expect(codes.has('E_IJSON_DUPLICATE_MEMBER_NAME')).toBe(true);
    expect(codes.has('E_IJSON_NUMBER_OUT_OF_RANGE')).toBe(true);
    expect(codes.has('E_IJSON_INVALID_STRING')).toBe(true);
  });

  it('classifies CRYPTO_IJSON_* codes as format errors', () => {
    expect(isFormatError('CRYPTO_IJSON_DUPLICATE_MEMBER_NAME')).toBe(true);
    expect(isFormatError('CRYPTO_IJSON_NUMBER_OUT_OF_RANGE')).toBe(true);
    expect(isFormatError('CRYPTO_IJSON_INVALID_STRING')).toBe(true);
  });
});
