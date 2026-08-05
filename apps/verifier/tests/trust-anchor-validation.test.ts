/**
 * Trust-anchor and build-identifier validation.
 *
 * A supplied JWK thumbprint is the ONLY independent trust anchor in this verifier, so its syntax is
 * checked canonically rather than by shape. The build identifier is recorded verbatim in every
 * deterministic report, so it is validated exactly and never normalized.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { parseVerificationContext } from '../src/lib/context.js';
import { initializeLocalVerifier } from '../src/verify.js';

/** RFC 7638 thumbprint form: SHA-256 over the canonical JWK, unpadded base64url. */
function thumbprintOf(seed: string): string {
  return createHash('sha256').update(seed).digest('base64url');
}

async function contextAccepts(thumbprint: string): Promise<boolean> {
  try {
    await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', trust: { trustedJwkThumbprints: [thumbprint] } })
    );
    return true;
  } catch {
    return false;
  }
}

async function contextRejectionCode(thumbprint: string): Promise<string | undefined> {
  try {
    await parseVerificationContext(
      JSON.stringify({ contextVersion: '1', trust: { trustedJwkThumbprints: [thumbprint] } })
    );
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe('trusted JWK thumbprints are validated canonically', () => {
  it('accepts a genuine SHA-256 base64url thumbprint', async () => {
    for (const seed of ['a', 'key-one', 'another key', '']) {
      const tp = thumbprintOf(seed);
      expect(tp).toHaveLength(43);
      expect(await contextAccepts(tp)).toBe(true);
    }
  });

  it('rejects a value outside the base64url alphabet', async () => {
    for (const bad of [
      'A'.repeat(42) + '+',
      'A'.repeat(42) + '/',
      'A'.repeat(42) + '=',
      'A'.repeat(42) + ' ',
    ]) {
      expect(await contextAccepts(bad)).toBe(false);
      expect(await contextRejectionCode(bad)).toBe('E_VERIFIER_CONTEXT_INVALID');
    }
  });

  it('rejects a value of the wrong length', async () => {
    for (const bad of ['A'.repeat(42), 'A'.repeat(44), 'A', '']) {
      expect(await contextAccepts(bad)).toBe(false);
    }
  });

  it('rejects a NON-CANONICAL alias whose unused trailing bits are non-zero', async () => {
    // 43 base64url characters carry 258 bits, but a SHA-256 digest is 256. The final character's
    // low two bits are unused, so several distinct 43-character strings decode to the SAME 32 bytes.
    // Only the spelling with those bits zeroed is canonical; the aliases must be rejected, because
    // accepting one would let a caller supply a trust anchor that never equals the computed value
    // and read the resulting mismatch as "key not trusted" rather than as malformed input.
    const canonical = thumbprintOf('alias-probe');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const lastIndex = alphabet.indexOf(canonical[42]);
    expect(lastIndex).toBeGreaterThanOrEqual(0);

    const aliases: string[] = [];
    for (let bits = 1; bits < 4; bits++) {
      const candidate = canonical.slice(0, 42) + alphabet[(lastIndex & ~0b11) | bits];
      if (candidate !== canonical) aliases.push(candidate);
    }
    expect(aliases.length).toBeGreaterThan(0);

    // Every alias decodes to the same 32 bytes as the canonical spelling.
    const decode = (s: string) => Buffer.from(s, 'base64url');
    for (const alias of aliases) {
      expect(decode(alias).equals(decode(canonical))).toBe(true);
      expect(await contextAccepts(alias)).toBe(false);
      expect(await contextRejectionCode(alias)).toBe('E_VERIFIER_CONTEXT_INVALID');
    }

    expect(await contextAccepts(canonical)).toBe(true);
  });

  it('rejects a well-formed base64url value that decodes to the wrong length', async () => {
    // 43 characters is the only length that yields 32 bytes, so this is covered by the length test;
    // asserted separately so the reason is explicit rather than incidental.
    const thirtyOneBytes = createHash('sha256').update('x').digest().subarray(0, 31);
    const encoded = thirtyOneBytes.toString('base64url');
    expect(encoded.length).not.toBe(43);
    expect(await contextAccepts(encoded)).toBe(false);
  });
});

describe('the build identifier is validated exactly, never normalized', () => {
  const accept = async (build: string) => {
    await initializeLocalVerifier({ verifierBuild: build });
    return true;
  };
  const rejectionCode = async (build: string) => {
    try {
      await initializeLocalVerifier({ verifierBuild: build });
      return undefined;
    } catch (e) {
      return (e as { code?: string }).code;
    }
  };

  it.each([
    'abc123',
    'v0.16.4',
    'sha256:deadbeef',
    'refs/tags/v1',
    '05e59be6f13e6783499b8025cca1123d758601d8',
    '05e59be6-dirty.a605cef542d4ef8918d64bbb0b541134',
    'a'.repeat(128),
  ])('accepts %s', async (build) => {
    expect(await accept(build)).toBe(true);
  });

  it.each([
    ['leading space', ' release-1'],
    ['trailing space', 'release-1 '],
    ['interior space', 'release 1'],
    ['newline', 'release-1\n'],
    ['carriage return', 'release-1\r'],
    ['tab', 'release\t1'],
    ['quote', 'release"1'],
    ['backtick', 'release`1'],
    ['unpaired high surrogate', 'release\uD83D'],
    ['unpaired low surrogate', 'release\uDC00'],
    ['astral code point', 'release\u{1F600}'],
    ['empty', ''],
    ['129 characters', 'a'.repeat(129)],
  ])('rejects %s with E_VERIFIER_BUILD_INVALID', async (_label, build) => {
    expect(await rejectionCode(build)).toBe('E_VERIFIER_BUILD_INVALID');
  });

  it('does not trim: a padded value is rejected rather than silently accepted as its trimmed form', async () => {
    expect(await rejectionCode(' release-1 ')).toBe('E_VERIFIER_BUILD_INVALID');
    expect(await accept('release-1')).toBe(true);
  });
});
