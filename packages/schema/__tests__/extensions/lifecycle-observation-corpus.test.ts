/**
 * lifecycle-observation parity-corpus validity test.
 *
 * Asserts that every vector in
 * `specs/conformance/parity-corpus/lifecycle-observation/vectors.json`
 * is INTERNALLY VALID against `LifecycleObservationSchema`. Per the
 * parity-corpus convention established by runtime-governance vector
 * `rg-007` and reused by `a2a-handoff` and `cli-execution`, every
 * vector here is positive (envelope-accepted); semantic-rejection
 * cases for the extension content live in the schema validator tests
 * at `lifecycle-observation.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LIFECYCLE_OBSERVATION_EXTENSION_KEY,
  LifecycleObservationSchema,
} from '../../src/extensions/lifecycle-observation';

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
  '../../../../specs/conformance/parity-corpus/lifecycle-observation/vectors.json'
);

const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8')) as ParityCorpus;

describe('lifecycle-observation parity corpus shape and counts', () => {
  it('declares family = lifecycle-observation', () => {
    expect(corpus.family).toBe('lifecycle-observation');
  });

  it('contains at least 11 vectors', () => {
    expect(corpus.vectors.length).toBeGreaterThanOrEqual(11);
  });

  it('every vector declares expected.accepted = true (envelope-accepted convention)', () => {
    for (const v of corpus.vectors) {
      expect(
        v.expected.accepted,
        `vector ${v.id} declared expected.accepted = false; the lifecycle-observation corpus is positive-only at the envelope layer`
      ).toBe(true);
    }
  });

  it('covers all 9 event_kind values across the vectors', () => {
    const eventKinds = new Set<string>();
    for (const v of corpus.vectors) {
      const ek = (
        ((v.input.payload as Record<string, unknown>).extensions as Record<string, unknown>)[
          LIFECYCLE_OBSERVATION_EXTENSION_KEY
        ] as Record<string, unknown>
      ).event_kind as string;
      eventKinds.add(ek);
    }
    expect(eventKinds.size).toBe(9);
  });
});

describe('lifecycle-observation parity corpus: every vector validates', () => {
  for (const v of corpus.vectors) {
    it(`${v.id}: extension payload validates against LifecycleObservationSchema`, () => {
      const extensions = (v.input.payload as Record<string, unknown>).extensions as Record<
        string,
        unknown
      >;
      expect(extensions, `vector ${v.id} has no extensions block`).toBeDefined();
      const observation = extensions[LIFECYCLE_OBSERVATION_EXTENSION_KEY];
      expect(observation, `vector ${v.id} has no observation`).toBeDefined();
      const result = LifecycleObservationSchema.safeParse(observation);
      if (!result.success) {
        throw new Error(
          `vector ${v.id} failed LifecycleObservationSchema: ${JSON.stringify(result.error.issues, null, 2)}`
        );
      }
    });
  }
});
