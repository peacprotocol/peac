/**
 * Extended JCS (RFC 8785) parity tests against the shared corpus at
 * specs/conformance/parity-corpus/jcs-extended/.
 *
 * The corpus is the single source of truth for the cross-language
 * canonicalization contract; the Go implementation in
 * sdks/go/jcs_parity_extended_test.go runs the same vectors and
 * must produce byte-identical output.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { canonicalize } from '../src/jcs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(
  __dirname,
  '../../../specs/conformance/parity-corpus/jcs-extended/vectors.json'
);

interface Vector {
  id: string;
  description: string;
  input: unknown;
  canonical: string;
}

interface Corpus {
  description: string;
  generator: string;
  vectors: Vector[];
}

const corpus: Corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));

describe('JCS extended parity corpus (TypeScript side)', () => {
  it('corpus has the expected six vectors', () => {
    expect(corpus.vectors.map((v) => v.id).sort()).toEqual([
      'escape-sequences',
      'integer-vs-float-same-value',
      'nested-depth-5',
      'numeric-zero-and-neg-zero',
      'unicode-nfc-nfd',
      'utf16-surrogate-pair',
    ]);
  });

  for (const vector of corpus.vectors) {
    it(`vector "${vector.id}" canonicalizes byte-identically to the corpus`, () => {
      const got = canonicalize(vector.input);
      expect(got).toBe(vector.canonical);
    });
  }
});
