/**
 * normalize: INERT identity passthrough invariant.
 *
 * The corrected v0.13.1 contract: normalize() returns the SAME object
 * reference. Tests assert this via `expect(...).toBe(...)` (Vitest `toBe`
 * uses `Object.is`: referential identity, NOT deep equality).
 *
 * Deep-equality (`toEqual`) would silently pass on a clone-and-reorder;
 * the corrected `toBe` assertion catches any clone or mutation.
 */

import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/_internal/record-core/normalize.js';
import type { Wire02Claims } from '@peac/schema';

const FIXTURE_CLAIMS: ReadonlyArray<Wire02Claims> = [
  {
    peac_version: '0.2',
    iss: 'https://issuer.example/.well-known/peac-issuer',
    aud: 'https://aud.example/agent',
    type: 'https://peacprotocol.org/types/agent-action',
    iat: 1735689600,
    jti: '01940000-0000-7000-8000-000000000001',
  } as unknown as Wire02Claims,
  {
    peac_version: '0.2',
    iss: 'https://issuer.example/.well-known/peac-issuer',
    aud: 'https://aud.example/agent',
    type: 'https://peacprotocol.org/types/agent-action',
    iat: 1735689600,
    jti: '01940000-0000-7000-8000-000000000002',
    occurred_at: '2026-04-01T00:00:00Z',
    ext: { 'org.peacprotocol/identity': { actor: 'agent-x' } },
  } as unknown as Wire02Claims,
];

describe('normalize: referential identity (Object.is via toBe)', () => {
  it.each(FIXTURE_CLAIMS.map((c, i) => ({ id: `fixture-${i}`, claims: c })))(
    '$id: returns the same object reference',
    ({ claims }) => {
      // expect(...).toBe(...) is Vitest's referential-identity matcher
      // (uses Object.is). Deep-equality (toEqual) would pass even if
      // normalize() cloned-and-reordered; the toBe assertion catches
      // any clone or mutation.
      expect(normalize(claims)).toBe(claims);
    }
  );

  it('does not mutate the input object', () => {
    const claims = { ...FIXTURE_CLAIMS[0] } as Wire02Claims;
    const before = JSON.stringify(claims);
    normalize(claims);
    const after = JSON.stringify(claims);
    expect(after).toBe(before);
  });

  it('does not add or remove keys', () => {
    const claims = FIXTURE_CLAIMS[1];
    const beforeKeys = Object.keys(claims as Record<string, unknown>).sort();
    const result = normalize(claims);
    const afterKeys = Object.keys(result as Record<string, unknown>).sort();
    expect(afterKeys).toEqual(beforeKeys);
  });
});
