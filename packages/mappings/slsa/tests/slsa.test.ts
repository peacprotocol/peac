import { describe, it, expect } from 'vitest';
import { toPeacFromSlsa, fromPeacToSlsa, SLSA_PROVENANCE_PREDICATE_TYPE } from '../src/index.js';
import type { SlsaProvenance } from '../src/types.js';

const VALID_PROVENANCE: SlsaProvenance = {
  buildDefinition: {
    buildType: 'https://github.com/actions/runner',
    externalParameters: { workflow: '.github/workflows/build.yml' },
    resolvedDependencies: [
      {
        uri: 'git+https://github.com/example/repo@refs/heads/main',
        digest: { sha256: 'abc123def456' },
      },
    ],
  },
  runDetails: {
    builder: { id: 'https://github.com/actions/runner/v2' },
    metadata: {
      invocationId: 'run-12345',
      startedOn: '2026-03-31T10:00:00Z',
      finishedOn: '2026-03-31T10:05:00Z',
    },
  },
};

const NO_SOURCE_PROVENANCE: SlsaProvenance = {
  buildDefinition: {
    buildType: 'https://github.com/actions/runner',
  },
  runDetails: {
    builder: { id: 'https://github.com/actions/runner/v2' },
  },
};

describe('SLSA_PROVENANCE_PREDICATE_TYPE', () => {
  it('is the correct SLSA v1 predicate URI', () => {
    expect(SLSA_PROVENANCE_PREDICATE_TYPE).toBe('https://slsa.dev/provenance/v1');
  });
});

describe('toPeacFromSlsa()', () => {
  it('derives source_ref from resolvedDependencies URI', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 3 });
    expect(extension.source_ref).toBe('git+https://github.com/example/repo@refs/heads/main');
  });

  it('omits source_ref when no resolvedDependencies', () => {
    const { extension } = toPeacFromSlsa(NO_SOURCE_PROVENANCE, { level: 1 });
    expect(extension.source_ref).toBeUndefined();
  });

  it('maps builder.id to verification_method', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 2 });
    expect(extension.verification_method).toBe('https://github.com/actions/runner/v2');
  });

  it('populates slsa field with track, level, and version', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 3, track: 'build' });
    expect(extension.slsa).toEqual({ track: 'build', level: 3, version: '1.2' });
  });

  it('defaults track to build', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 1 });
    expect(extension.slsa!.track).toBe('build');
  });

  it('sets version to 1.2', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 0 });
    expect(extension.slsa!.version).toBe('1.2');
  });

  it('sets source_type to derived', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 2 });
    expect(extension.source_type).toBe('derived');
  });

  it('uses provenance extension key', () => {
    const { extensionKey } = toPeacFromSlsa(VALID_PROVENANCE, { level: 1 });
    expect(extensionKey).toBe('org.peacprotocol/provenance');
  });

  it('supports source track', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 2, track: 'source' });
    expect(extension.slsa!.track).toBe('source');
  });

  it('falls back to digest when dependency has no URI', () => {
    const prov: SlsaProvenance = {
      buildDefinition: {
        buildType: 'test',
        resolvedDependencies: [{ digest: { sha256: 'deadbeef' } }],
      },
      runDetails: { builder: { id: 'builder-1' } },
    };
    const { extension } = toPeacFromSlsa(prov, { level: 1 });
    expect(extension.source_ref).toBe('sha256:deadbeef');
  });

  it('prefers sha256 digest over other algorithms', () => {
    const prov: SlsaProvenance = {
      buildDefinition: {
        buildType: 'test',
        resolvedDependencies: [{ digest: { sha512: 'xyz', sha256: 'abc' } }],
      },
      runDetails: { builder: { id: 'builder-1' } },
    };
    const { extension } = toPeacFromSlsa(prov, { level: 1 });
    expect(extension.source_ref).toBe('sha256:abc');
  });

  it('uses lexicographically first digest when sha256 absent', () => {
    const prov: SlsaProvenance = {
      buildDefinition: {
        buildType: 'test',
        resolvedDependencies: [{ digest: { sha512: 'xyz', md5: 'abc' } }],
      },
      runDetails: { builder: { id: 'builder-1' } },
    };
    const { extension } = toPeacFromSlsa(prov, { level: 1 });
    expect(extension.source_ref).toBe('md5:abc');
  });
});

describe('fromPeacToSlsa()', () => {
  it('maps source_ref to resolvedDependencies', () => {
    const result = fromPeacToSlsa({
      source_type: 'derived',
      source_ref: 'git+https://github.com/example/repo',
    });
    expect(result.buildDefinition.resolvedDependencies).toEqual([
      { uri: 'git+https://github.com/example/repo' },
    ]);
  });

  it('maps verification_method to builder.id', () => {
    const result = fromPeacToSlsa({
      source_type: 'derived',
      verification_method: 'https://builder.example.com',
    });
    expect(result.runDetails.builder.id).toBe('https://builder.example.com');
  });

  it('omits resolvedDependencies when source_ref absent', () => {
    const result = fromPeacToSlsa({ source_type: 'original' });
    expect(result.buildDefinition.resolvedDependencies).toBeUndefined();
  });

  it('defaults builder.id to unknown when verification_method absent', () => {
    const result = fromPeacToSlsa({ source_type: 'original' });
    expect(result.runDetails.builder.id).toBe('unknown');
  });

  it('sets buildType to unknown (not source_ref)', () => {
    const result = fromPeacToSlsa({
      source_type: 'derived',
      source_ref: 'https://example.com/src',
    });
    expect(result.buildDefinition.buildType).toBe('unknown');
  });
});

describe('round-trip fidelity', () => {
  it('source_ref and builder.id survive round-trip', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 3 });
    const roundTripped = fromPeacToSlsa(extension);

    expect(roundTripped.buildDefinition.resolvedDependencies).toEqual([
      { uri: 'git+https://github.com/example/repo@refs/heads/main' },
    ]);
    expect(roundTripped.runDetails.builder.id).toBe('https://github.com/actions/runner/v2');
  });

  it('SLSA metadata is preserved in extension', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 4, track: 'build' });
    expect(extension.slsa).toEqual({ track: 'build', level: 4, version: '1.2' });
  });
});

describe('field preservation', () => {
  it('preserves level 0', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 0 });
    expect(extension.slsa!.level).toBe(0);
  });

  it('preserves level 4', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 4 });
    expect(extension.slsa!.level).toBe(4);
  });

  it('preserves custom track names', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 1, track: 'custom-track' });
    expect(extension.slsa!.track).toBe('custom-track');
  });
});

describe('deferred field exclusion', () => {
  it('does not map externalParameters', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 2 });
    expect(Object.keys(extension)).not.toContain('externalParameters');
  });

  it('does not map build metadata timestamps', () => {
    const { extension } = toPeacFromSlsa(VALID_PROVENANCE, { level: 2 });
    expect(Object.keys(extension)).not.toContain('startedOn');
  });
});
