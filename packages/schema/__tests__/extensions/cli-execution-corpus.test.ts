/**
 * cli-execution parity-corpus validity test.
 *
 * Asserts that every vector in
 * `specs/conformance/parity-corpus/cli-execution/vectors.json` is
 * INTERNALLY VALID against `CliExecutionSchema`. This pins the
 * "positive-only deterministic floor" semantics of the corpus:
 * negative/semantic-rejection cases live in cli-execution.test.ts,
 * not in the parity corpus.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CliExecutionSchema,
  CLI_EXECUTION_EXTENSION_KEY,
} from '../../src/extensions/cli-execution';

interface ParityVector {
  id: string;
  description: string;
  input: { payload: Record<string, unknown> };
  expected: { accepted: boolean };
}

interface ParityCorpus {
  family: string;
  description: string;
  version: string;
  generator?: string;
  vectors: ParityVector[];
}

const CORPUS_PATH = resolve(
  __dirname,
  '../../../../specs/conformance/parity-corpus/cli-execution/vectors.json'
);

const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as ParityCorpus;

describe('cli-execution parity corpus is positive-only and schema-valid', () => {
  it('declares family = cli-execution and at least 6 vectors', () => {
    expect(corpus.family).toBe('cli-execution');
    expect(corpus.vectors.length).toBeGreaterThanOrEqual(6);
  });

  it('every vector declares expected.accepted = true (Option A: positive-only corpus)', () => {
    for (const v of corpus.vectors) {
      expect(
        v.expected.accepted,
        `vector ${v.id} declared expected.accepted = false; the cli-execution corpus is positive-only`
      ).toBe(true);
    }
  });

  for (const v of corpus.vectors) {
    it(`${v.id}: extension payload validates against CliExecutionSchema`, () => {
      // Vectors are full Wire 0.2 envelope payloads carrying the CLI
      // observation under extensions[CLI_EXECUTION_EXTENSION_KEY] (mirrors
      // the live record-command JWS payload shape). The corpus test
      // extracts the observation and validates it against CliExecutionSchema.
      const extensions = (v.input.payload as Record<string, unknown>).extensions as Record<
        string,
        unknown
      >;
      expect(extensions, `vector ${v.id} has no extensions block`).toBeDefined();
      const observation = extensions[CLI_EXECUTION_EXTENSION_KEY];
      expect(
        observation,
        `vector ${v.id} has no observation under ${CLI_EXECUTION_EXTENSION_KEY}`
      ).toBeDefined();
      const result = CliExecutionSchema.safeParse(observation);
      if (!result.success) {
        throw new Error(
          `vector ${v.id} failed CliExecutionSchema: ${JSON.stringify(result.error.issues, null, 2)}`
        );
      }
    });
  }
});
