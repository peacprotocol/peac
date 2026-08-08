/**
 * Integrity of the committed runtime-observation artifact.
 *
 * Validates it against its own schema and recomputes every recorded provenance digest, so the
 * evidence stays bound to the inputs it names.
 */
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CORPUS_PATH,
  LOCKFILE_PATH,
  PRODUCTION_SOURCES,
  fileAtRevision,
  fileDigest,
  observationDependencyProblems,
  productionSourceManifestDigest,
  readRepositoryFile,
  sha256,
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

  // The lockfile digest is provenance of the measurement event; current-tree applicability is
  // bound to the measurement-relevant dependencies, not to the whole lockfile.
  it('records one well-formed lockfile digest across all environments', () => {
    const digests = new Set(
      Object.values(document.environments).map((environment) => environment.lockfile_sha256)
    );
    expect([...digests], 'all environments were measured from one lockfile').toHaveLength(1);
    expect([...digests][0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the recorded lockfile digest matches the lockfile at the measurement revision', () => {
    const revision = document.measurement_source_revision;
    const historical = fileAtRevision(REPO_ROOT, revision, LOCKFILE_PATH);
    if (historical === null) {
      // Shallow clones and source archives cannot resolve the recorded revision.
      expect(
        process.env.PEAC_REQUIRE_PROVENANCE_HISTORY,
        `revision ${revision} is not resolvable here; audit the lockfile digest from a full-history checkout`
      ).toBeUndefined();
      return;
    }
    const expected = sha256(historical);
    for (const [id, environment] of Object.entries(document.environments)) {
      expect(environment.lockfile_sha256, `${id}: lockfile digest at ${revision}`).toBe(expected);
    }
  });

  it('the current lockfile resolves every measurement dependency to its measured version', () => {
    const lockfile = readRepositoryFile(REPO_ROOT, LOCKFILE_PATH).toString('utf8');
    const problems = observationDependencyProblems(document.environments, lockfile);
    expect(problems, 'measurement-relevant dependencies match the lockfile').toEqual([]);
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

  it('treats the measured artifact digest as historical provenance, not a current-tree lock', () => {
    // measured_artifact_sha256 records the complete built package artifact that existed at the
    // measurement revision. Unrelated package code (for example the JWS layer) legitimately changes
    // the built crypto bundle without changing the measured Ed25519 decision surface, so this digest
    // is provenance and is not asserted against the current build. Current applicability is governed
    // by the production source manifest and measurement dependencies checked above.
    const wrappers = Object.entries(document.environments).filter(
      ([, e]) => e.surface === 'peac-wrapper'
    );
    expect(wrappers.length, 'wrapper environments are present').toBeGreaterThan(0);
    for (const [id, environment] of wrappers) {
      expect(environment.measured_artifact_sha256, `${id}: measured artifact provenance`).toMatch(
        /^[0-9a-f]{64}$/
      );
    }
  });

  it('scopes current applicability to the measured Ed25519 surface', () => {
    // The measured surface is the Ed25519 verification decision, not the whole crypto package.
    expect(PRODUCTION_SOURCES).toContain('packages/crypto/src/ed25519.ts');
    expect(PRODUCTION_SOURCES).toContain('packages/crypto/src/internal/ed25519-admissibility.ts');
    // The JWS/signing layer is outside the measured surface: a change there must not invalidate
    // Ed25519 applicability, and it is not a named production source.
    expect(PRODUCTION_SOURCES).not.toContain('packages/crypto/src/jws.ts');

    const base = productionSourceManifestDigest(REPO_ROOT, PRODUCTION_SOURCES);
    // Every named production source binds: dropping one changes the manifest, so an ed25519.ts or
    // admissibility.ts change does invalidate applicability.
    for (let i = 0; i < PRODUCTION_SOURCES.length; i++) {
      const without = PRODUCTION_SOURCES.filter((_, j) => j !== i);
      expect(
        productionSourceManifestDigest(REPO_ROOT, without),
        `dropping ${PRODUCTION_SOURCES[i]} must change the manifest`
      ).not.toBe(base);
    }
    // A file outside the measured surface would change the manifest only if it were named; its
    // exclusion is what keeps unrelated package changes from invalidating the evidence.
    expect(
      productionSourceManifestDigest(REPO_ROOT, [
        ...PRODUCTION_SOURCES,
        'packages/crypto/src/jws.ts',
      ])
    ).not.toBe(base);
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
