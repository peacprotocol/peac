/**
 * Negative tests for the runtime-observation merge step.
 *
 * Each invariant is exercised with input that violates it. A positive control runs first, so a
 * rejection cannot pass because the document was malformed for another reason.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CRYPTO_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(CRYPTO_ROOT, '..', '..');
const TOOL = join(CRYPTO_ROOT, 'tests', 'tools', 'merge-ed25519-observations.mjs');
const CORPUS_DIR = join(REPO_ROOT, 'specs', 'conformance', 'parity-corpus', 'ed25519-peac-profile');

const corpus = JSON.parse(readFileSync(join(CORPUS_DIR, 'vectors.json'), 'utf8')) as {
  vectors: { id: string }[];
};

/** A well-formed single-environment document covering every vector. */
function wellFormed(): Record<string, unknown> {
  return {
    observed_on: '2026-08-06',
    measurement_source_revision: 'a'.repeat(40),
    environments: {
      'probe-1': {
        implementation: 'probe:primitive',
        version: '1.0.0',
        platform: 'darwin/arm64',
        harness: 'packages/crypto/tests/tools/merge-ed25519-observations.mjs',
        harness_sha256: 'a'.repeat(64),
        corpus_sha256: 'b'.repeat(64),
        lockfile_sha256: 'c'.repeat(64),
      },
    },
    observations: corpus.vectors.map((v, index) => ({
      vector_id: v.id,
      environment_id: 'probe-1',
      // The merge requires at least one accepted and one rejected observation.
      outcome: index === 0 ? 'accept' : 'reject',
    })),
  };
}

/** Writes one document and passes its path to the merge twice. */
function mergeSameFileTwice(doc: Record<string, unknown>): { status: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'peac-merge-dup-'));
  try {
    const path = join(dir, 'input.json');
    writeFileSync(path, JSON.stringify(doc, null, 2));
    const run = spawnSync(process.execPath, [TOOL, path, path, '--out', join(dir, 'out.json')], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function merge(documents: Record<string, unknown>[]): { status: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'peac-merge-'));
  try {
    const inputs = documents.map((doc, i) => {
      const path = join(dir, `input-${i}.json`);
      writeFileSync(path, JSON.stringify(doc, null, 2));
      return path;
    });
    const out = join(dir, 'merged.json');
    const run = spawnSync(process.execPath, [TOOL, ...inputs, '--out', out], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the observation merge refuses evidence it cannot stand behind', () => {
  it('accepts a well-formed document', () => {
    const result = merge([wellFormed()]);
    expect(result.status, result.output).toBe(0);
  });

  it('rejects a missing source revision', () => {
    const doc = wellFormed();
    delete doc.measurement_source_revision;
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/measurement_source_revision/);
  });

  it.each(['not-a-sha', 'A'.repeat(40), 'a'.repeat(39), ''])(
    'rejects the malformed source revision %s',
    (value) => {
      const doc = wellFormed();
      doc.measurement_source_revision = value;
      const result = merge([doc]);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/measurement_source_revision/);
    }
  );

  it('rejects inputs naming different source revisions', () => {
    const a = wellFormed();
    const b = wellFormed();
    // A distinct environment id, so the revision check is reached.
    const envs = b.environments as Record<string, unknown>;
    envs['probe-2'] = envs['probe-1'];
    delete envs['probe-1'];
    for (const o of b.observations as { environment_id: string }[]) o.environment_id = 'probe-2';
    b.measurement_source_revision = 'b'.repeat(40);
    const result = merge([a, b]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/source revisions/);
  });

  it('rejects an exact duplicate observation identity', () => {
    const doc = wellFormed();
    const observations = doc.observations as { vector_id: string; environment_id: string }[];
    observations.push({ ...observations[1] });
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/duplicate observation/);
  });

  it('rejects the same input file supplied twice', () => {
    const doc = wellFormed();
    const first = merge([doc]);
    expect(first.status, first.output).toBe(0);
    const twice = mergeSameFileTwice(doc);
    expect(twice.status).not.toBe(0);
    expect(twice.output).toMatch(/supplied more than once/);
  });

  it('rejects an identical duplicate environment definition', () => {
    const a = wellFormed();
    const b = wellFormed();
    // Same id, same metadata: still two measurements of one environment.
    (b.observations as unknown[]).length = 0;
    const result = merge([a, b]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/defined twice with identical values/);
  });

  it('rejects conflicting outcomes for the same vector and environment', () => {
    // Reachable within one document; a repeated environment id across documents is rejected first.
    const doc = wellFormed();
    const observations = doc.observations as { outcome: string }[];
    observations.push({ ...observations[1], outcome: 'accept' });
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/conflicting outcomes/);
  });

  it('rejects an environment that does not cover every vector', () => {
    const doc = wellFormed();
    doc.observations = (doc.observations as unknown[]).slice(0, -1);
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/missing vectors/);
  });

  it('rejects an observation naming an undefined environment', () => {
    const doc = wellFormed();
    (doc.observations as { environment_id: string }[])[0].environment_id = 'absent';
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/undefined environment/);
  });

  it('rejects an unknown vector', () => {
    const doc = wellFormed();
    (doc.observations as { vector_id: string }[])[0].vector_id = 'not-a-vector';
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/unknown vector/);
  });

  it('rejects an outcome outside the enumeration', () => {
    const doc = wellFormed();
    (doc.observations as { outcome: string }[])[0].outcome = 'maybe';
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/invalid outcome/);
  });

  it('rejects one environment id described two different ways', () => {
    const a = wellFormed();
    const b = wellFormed();
    (b.environments as Record<string, { version: string }>)['probe-1'].version = '2.0.0';
    const result = merge([a, b]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/defined twice/);
  });

  it('rejects a set with no rejected observation', () => {
    const doc = wellFormed();
    for (const o of doc.observations as { outcome: string }[]) o.outcome = 'accept';
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/no rejected observation/);
  });

  it('rejects an environment missing its harness hash', () => {
    const doc = wellFormed();
    delete (doc.environments as Record<string, Record<string, unknown>>)['probe-1'].harness_sha256;
    const result = merge([doc]);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/missing harness_sha256/);
  });

  it.each(['August 2026', '2026-99-99', '2026-02-30', '2026-13-01', ''])(
    'rejects the observation date %s',
    (value) => {
      // A shape check alone accepts 2026-99-99, so the value must be a real calendar date.
      const doc = wellFormed();
      doc.observed_on = value;
      const result = merge([doc]);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/observed_on/);
    }
  );
});
