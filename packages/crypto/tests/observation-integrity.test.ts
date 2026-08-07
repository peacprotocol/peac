/**
 * Integrity of the committed runtime-observation artifact.
 *
 * Validates it against its own schema and recomputes every recorded provenance digest, so the
 * evidence stays bound to the inputs it names.
 */
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CORPUS_PATH,
  LOCKFILE_PATH,
  MEASURED_ARTIFACT_PATH,
  PRODUCTION_SOURCES,
  fileDigest,
  productionSourceManifestDigest,
} from './tools/evidence-provenance.mjs';

const CRYPTO_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(CRYPTO_ROOT, '..', '..');
const CORPUS_DIR = join(REPO_ROOT, 'specs', 'conformance', 'parity-corpus', 'ed25519-peac-profile');

interface Environment {
  implementation: string;
  version: string;
  platform: string;
  harness: string;
  harness_sha256: string;
  corpus_sha256: string;
  lockfile_sha256: string;
  surface?: string;
  measured_artifact_sha256?: string;
  wrapper_bundle_sha256?: string;
  production_source_manifest_sha256?: string;
  runtime_version?: string;
  bundler_version?: string;
}

const document = JSON.parse(
  readFileSync(join(CORPUS_DIR, 'runtime-observations.json'), 'utf8')
) as {
  observed_on: string;
  measurement_source_revision: string;
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
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const broken = structuredClone(document);
    broken.observations[0].outcome = 'maybe';
    expect(validate(broken)).toBe(false);
  });

  it('records a source revision that is a single lowercase commit SHA', () => {
    expect(document.measurement_source_revision, 'measurement_source_revision').toMatch(
      /^[0-9a-f]{40}$/
    );
  });

  it('each environment names a harness whose current source hashes to the recorded digest', () => {
    const digests = new Map<string, string>();
    for (const [id, environment] of Object.entries(document.environments)) {
      expect(environment.harness, `${id} declares its harness`).toBeTruthy();
      if (!digests.has(environment.harness)) {
        digests.set(environment.harness, fileDigest(REPO_ROOT, environment.harness));
      }
      expect(
        environment.harness_sha256,
        `${id} was measured by a different revision of ${environment.harness}; regenerate the observations`
      ).toBe(digests.get(environment.harness));
    }
    expect(digests.size, 'observations come from more than one harness').toBeGreaterThan(1);
  });

  // Recomputed, not shape-checked: a well-formed but wrong digest passes the schema.
  it('recomputes the corpus digest from the normative vectors', () => {
    const expected = fileDigest(REPO_ROOT, CORPUS_PATH);
    for (const [id, environment] of Object.entries(document.environments)) {
      expect(environment.corpus_sha256, `${id}: corpus digest`).toBe(expected);
    }
  });

  it('recomputes the lockfile digest', () => {
    const expected = fileDigest(REPO_ROOT, LOCKFILE_PATH);
    for (const [id, environment] of Object.entries(document.environments)) {
      expect(environment.lockfile_sha256, `${id}: lockfile digest`).toBe(expected);
    }
  });

  it('recomputes the production source manifest for every wrapper surface', () => {
    const expected = productionSourceManifestDigest(REPO_ROOT, PRODUCTION_SOURCES);
    const wrappers = Object.entries(document.environments).filter(
      ([, e]) => e.surface === 'peac-wrapper'
    );
    expect(wrappers.length, 'wrapper environments are present').toBeGreaterThan(0);
    for (const [id, environment] of wrappers) {
      expect(environment.production_source_manifest_sha256, `${id}: source manifest`).toBe(
        expected
      );
    }
  });

  it('recomputes the measured artifact digest when the package has been built', () => {
    // The artifact exists only after a build; its absence is reported rather than passing.
    const artifact = join(REPO_ROOT, MEASURED_ARTIFACT_PATH);
    const wrappers = Object.entries(document.environments).filter(
      ([, e]) => e.surface === 'peac-wrapper'
    );
    if (!existsSync(artifact)) {
      expect(
        process.env.PEAC_REQUIRE_BUILT_ARTIFACT,
        `${MEASURED_ARTIFACT_PATH} is absent; run the build before asserting the artifact digest`
      ).toBeUndefined();
      return;
    }
    const expected = fileDigest(REPO_ROOT, MEASURED_ARTIFACT_PATH);
    for (const [id, environment] of wrappers) {
      expect(environment.measured_artifact_sha256, `${id}: measured artifact`).toBe(expected);
    }
  });

  it('does not claim to recompute the wrapper bundle', () => {
    // Produced and verified in the browser-evidence workflow, which ordinary unit CI does not run.
    for (const [id, environment] of Object.entries(document.environments)) {
      if (environment.surface !== 'peac-wrapper') continue;
      expect(environment.wrapper_bundle_sha256, `${id}: bundle digest recorded`).toMatch(
        /^[0-9a-f]{64}$/
      );
    }
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

describe('the schema rejects what it must', () => {
  const compile = () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    return ajv.compile(schema);
  };

  /** A minimal valid document, so each case differs from it by exactly one defect. */
  const minimal = (): Record<string, unknown> =>
    structuredClone(document) as Record<string, unknown>;

  const browserEnvironmentId = (): string =>
    Object.entries(document.environments).find(([, e]) => e.surface === 'peac-wrapper')![0];

  it.each([
    [
      'an unknown environment field',
      (d: Record<string, unknown>) => {
        const envs = d.environments as Record<string, Record<string, unknown>>;
        envs[Object.keys(envs)[0]].unexpected_field = 'x';
      },
    ],
    [
      'a misspelled known field',
      (d: Record<string, unknown>) => {
        const envs = d.environments as Record<string, Record<string, unknown>>;
        const first = envs[Object.keys(envs)[0]];
        first.open_ssl = first.openssl ?? '3.0.0';
        delete first.openssl;
      },
    ],
    [
      'a wrapper environment without its measured artifact',
      (d: Record<string, unknown>) => {
        const envs = d.environments as Record<string, Record<string, unknown>>;
        delete envs[browserEnvironmentId()].measured_artifact_sha256;
      },
    ],
    [
      'a browser environment without bundler metadata',
      (d: Record<string, unknown>) => {
        const envs = d.environments as Record<string, Record<string, unknown>>;
        delete envs[browserEnvironmentId()].bundler_version;
      },
    ],
    [
      'a harness path that escapes the repository',
      (d: Record<string, unknown>) => {
        const envs = d.environments as Record<string, Record<string, unknown>>;
        envs[Object.keys(envs)[0]].harness = '../outside/harness.mjs';
      },
    ],
    [
      'a wrong $schema value',
      (d: Record<string, unknown>) => {
        d.$schema = 'https://example.invalid/other.json';
      },
    ],
    [
      'an uppercase digest',
      (d: Record<string, unknown>) => {
        const envs = d.environments as Record<string, Record<string, unknown>>;
        const first = envs[Object.keys(envs)[0]];
        first.corpus_sha256 = String(first.corpus_sha256).toUpperCase();
      },
    ],
  ])('rejects %s', (_label, breakIt) => {
    const validate = compile();
    const broken = minimal();
    breakIt(broken);
    expect(validate(broken), 'schema accepted a document it must reject').toBe(false);
  });

  it('accepts the committed document, so the cases above fail for their own reason', () => {
    expect(compile()(minimal())).toBe(true);
  });
});

describe('the observation date is a real calendar date', () => {
  // A pattern alone accepts 2026-99-99, so validity is checked programmatically.
  it('parses back to itself', () => {
    const [year, month, day] = document.observed_on.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    expect(parsed.getUTCFullYear()).toBe(year);
    expect(parsed.getUTCMonth() + 1).toBe(month);
    expect(parsed.getUTCDate()).toBe(day);
  });
});
