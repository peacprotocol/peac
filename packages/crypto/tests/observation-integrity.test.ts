/**
 * Integrity of the committed runtime-observation artifact.
 *
 * Validates it against its own schema, and binds every environment to the exact harness source that
 * produced it. Without the second check a harness could be edited after measurement and the
 * committed evidence would silently describe a program that no longer exists.
 */
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CRYPTO_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(CRYPTO_ROOT, '..', '..');
const CORPUS_DIR = join(REPO_ROOT, 'specs', 'conformance', 'parity-corpus', 'ed25519-peac-profile');

interface Environment {
  implementation: string;
  version: string;
  platform: string;
  harness: string;
  harness_sha256: string;
  runtime_version?: string;
  bundler_version?: string;
}

const document = JSON.parse(
  readFileSync(join(CORPUS_DIR, 'runtime-observations.json'), 'utf8')
) as {
  observed_on: string;
  environments: Record<string, Environment>;
  observations: { vector_id: string; environment_id: string; outcome: string }[];
};
const schema = JSON.parse(
  readFileSync(join(CORPUS_DIR, 'runtime-observations.schema.json'), 'utf8')
);
const vectors = JSON.parse(readFileSync(join(CORPUS_DIR, 'vectors.json'), 'utf8')) as {
  vectors: { id: string }[];
};

describe('the committed runtime observations', () => {
  it('validate against their schema', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const valid = validate(document);
    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('the schema rejects a document it should not accept', () => {
    // A schema that accepts everything would make the assertion above meaningless.
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const broken = structuredClone(document);
    broken.observations[0].outcome = 'maybe';
    expect(validate(broken)).toBe(false);
  });

  it('each environment names a harness whose current source hashes to the recorded digest', () => {
    const digests = new Map<string, string>();
    for (const [id, environment] of Object.entries(document.environments)) {
      expect(environment.harness, `${id} declares its harness`).toBeTruthy();
      if (!digests.has(environment.harness)) {
        const source = readFileSync(join(REPO_ROOT, environment.harness));
        digests.set(environment.harness, createHash('sha256').update(source).digest('hex'));
      }
      expect(
        environment.harness_sha256,
        `${id} was measured by a different revision of ${environment.harness}; regenerate the observations`
      ).toBe(digests.get(environment.harness));
    }
    expect(digests.size, 'observations come from more than one harness').toBeGreaterThan(1);
  });

  it('records an exact version for every runtime and bundler it names', () => {
    for (const [id, environment] of Object.entries(document.environments)) {
      for (const field of ['version', 'runtime_version', 'bundler_version'] as const) {
        const value = environment[field];
        if (value === undefined) continue;
        expect(value, `${id}.${field}`).not.toBe('unknown');
        expect(value.length, `${id}.${field}`).toBeGreaterThan(0);
      }
    }
  });

  it('covers every vector in every environment exactly once', () => {
    const seen = new Set<string>();
    for (const o of document.observations) {
      const identity = `${o.vector_id} ${o.environment_id}`;
      expect(seen.has(identity), `duplicate ${identity}`).toBe(false);
      seen.add(identity);
    }
    for (const environmentId of Object.keys(document.environments)) {
      for (const vector of vectors.vectors) {
        expect(seen.has(`${vector.id} ${environmentId}`), `${vector.id} in ${environmentId}`).toBe(
          true
        );
      }
    }
  });
});
