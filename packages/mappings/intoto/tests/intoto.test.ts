import { describe, it, expect } from 'vitest';
import { toPeacFromInToto, fromPeacToInToto, INTOTO_STATEMENT_TYPE } from '../src/index.js';
import type { InTotoStatement } from '../src/types.js';

const VALID_STATEMENT: InTotoStatement = {
  _type: INTOTO_STATEMENT_TYPE,
  subject: [
    {
      uri: 'https://example.com/artifact.tar.gz',
      digest: { sha256: 'abc123def456' },
    },
  ],
  predicateType: 'https://slsa.dev/provenance/v1',
};

describe('toPeacFromInToto()', () => {
  it('maps subject URI to source_ref', () => {
    const { extension } = toPeacFromInToto(VALID_STATEMENT);
    expect(extension.source_ref).toBe('https://example.com/artifact.tar.gz');
  });

  it('maps predicateType to verification_method', () => {
    const { extension } = toPeacFromInToto(VALID_STATEMENT);
    expect(extension.verification_method).toBe('https://slsa.dev/provenance/v1');
  });

  it('sets source_type to derived', () => {
    const { extension } = toPeacFromInToto(VALID_STATEMENT);
    expect(extension.source_type).toBe('derived');
  });

  it('uses provenance extension key', () => {
    const { extensionKey } = toPeacFromInToto(VALID_STATEMENT);
    expect(extensionKey).toBe('org.peacprotocol/provenance');
  });

  it('falls back to digest when subject has no URI', () => {
    const statement: InTotoStatement = {
      _type: INTOTO_STATEMENT_TYPE,
      subject: [{ digest: { sha256: 'abc123' } }],
      predicateType: 'https://example.com/predicate/v1',
    };
    const { extension } = toPeacFromInToto(statement);
    expect(extension.source_ref).toBe('sha256:abc123');
  });

  it('throws for non-v1.0 _type', () => {
    const bad = { ...VALID_STATEMENT, _type: 'https://in-toto.io/Statement/v2' as never };
    expect(() => toPeacFromInToto(bad)).toThrow(/Expected in-toto v1.0/);
  });

  it('throws for empty subject array', () => {
    const bad = { ...VALID_STATEMENT, subject: [] };
    expect(() => toPeacFromInToto(bad)).toThrow(/at least one subject/);
  });
});

describe('fromPeacToInToto()', () => {
  it('produces v1.0 Statement with correct _type', () => {
    const statement = fromPeacToInToto({ source_type: 'derived', source_ref: 'commit-abc' });
    expect(statement._type).toBe(INTOTO_STATEMENT_TYPE);
  });

  it('maps source_ref as URI to subject', () => {
    const statement = fromPeacToInToto({
      source_type: 'derived',
      source_ref: 'https://example.com/artifact',
    });
    expect(statement.subject[0].uri).toBe('https://example.com/artifact');
  });

  it('maps digest-format source_ref to subject digest', () => {
    const statement = fromPeacToInToto({ source_type: 'derived', source_ref: 'sha256:abc123' });
    expect(statement.subject[0].digest).toEqual({ sha256: 'abc123' });
  });

  it('maps verification_method to predicateType', () => {
    const statement = fromPeacToInToto({
      source_type: 'derived',
      verification_method: 'https://slsa.dev/provenance/v1',
    });
    expect(statement.predicateType).toBe('https://slsa.dev/provenance/v1');
  });

  it('uses default predicateType when verification_method absent', () => {
    const statement = fromPeacToInToto({ source_type: 'original' });
    expect(statement.predicateType).toBe('https://in-toto.io/attestation/v1');
  });
});

describe('round-trip fidelity', () => {
  it('URI-based subject survives round-trip', () => {
    const { extension } = toPeacFromInToto(VALID_STATEMENT);
    const roundTripped = fromPeacToInToto(extension);

    expect(roundTripped._type).toBe(INTOTO_STATEMENT_TYPE);
    expect(roundTripped.subject[0].uri).toBe('https://example.com/artifact.tar.gz');
    expect(roundTripped.predicateType).toBe('https://slsa.dev/provenance/v1');
  });

  it('digest-based subject survives round-trip', () => {
    const statement: InTotoStatement = {
      _type: INTOTO_STATEMENT_TYPE,
      subject: [{ digest: { sha256: 'deadbeef' } }],
      predicateType: 'https://example.com/custom/v1',
    };
    const { extension } = toPeacFromInToto(statement);
    const roundTripped = fromPeacToInToto(extension);

    expect(roundTripped.subject[0].digest).toEqual({ sha256: 'deadbeef' });
  });

  it('predicateType survives round-trip', () => {
    const { extension } = toPeacFromInToto(VALID_STATEMENT);
    const roundTripped = fromPeacToInToto(extension);
    expect(roundTripped.predicateType).toBe(VALID_STATEMENT.predicateType);
  });
});

describe('multi-subject handling', () => {
  it('uses first subject when multiple subjects present (first-subject-wins)', () => {
    const statement: InTotoStatement = {
      _type: INTOTO_STATEMENT_TYPE,
      subject: [
        { uri: 'https://example.com/first.tar.gz' },
        { uri: 'https://example.com/second.tar.gz' },
      ],
      predicateType: 'test',
    };
    const { extension } = toPeacFromInToto(statement);
    expect(extension.source_ref).toBe('https://example.com/first.tar.gz');
  });

  it('uses first subject digest when first has no URI', () => {
    const statement: InTotoStatement = {
      _type: INTOTO_STATEMENT_TYPE,
      subject: [
        { digest: { sha256: 'first-digest' } },
        { uri: 'https://example.com/second.tar.gz' },
      ],
      predicateType: 'test',
    };
    const { extension } = toPeacFromInToto(statement);
    expect(extension.source_ref).toBe('sha256:first-digest');
  });
});

describe('multi-digest handling', () => {
  it('prefers sha256 over other digest algorithms', () => {
    const statement: InTotoStatement = {
      _type: INTOTO_STATEMENT_TYPE,
      subject: [{ digest: { sha512: 'xyz', sha256: 'abc' } }],
      predicateType: 'test',
    };
    const { extension } = toPeacFromInToto(statement);
    expect(extension.source_ref).toBe('sha256:abc');
  });

  it('uses lexicographically first algorithm when sha256 absent', () => {
    const statement: InTotoStatement = {
      _type: INTOTO_STATEMENT_TYPE,
      subject: [{ digest: { sha512: 'xyz', md5: 'abc' } }],
      predicateType: 'test',
    };
    const { extension } = toPeacFromInToto(statement);
    expect(extension.source_ref).toBe('md5:abc');
  });
});

describe('hash normalization', () => {
  it('normalizes sha256 digest from in-toto format to colon-separated', () => {
    const statement: InTotoStatement = {
      _type: INTOTO_STATEMENT_TYPE,
      subject: [{ digest: { sha256: 'abc123' } }],
      predicateType: 'test',
    };
    const { extension } = toPeacFromInToto(statement);
    expect(extension.source_ref).toBe('sha256:abc123');
  });

  it('reverse-normalizes colon-separated digest back to in-toto format', () => {
    const statement = fromPeacToInToto({ source_type: 'derived', source_ref: 'sha512:xyz789' });
    expect(statement.subject[0].digest).toEqual({ sha512: 'xyz789' });
  });
});
