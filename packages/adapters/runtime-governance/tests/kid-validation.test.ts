/**
 * Runtime-governance issuance `kid` semantics: option validation accepts exactly the PEAC JWS
 * `kid` domain (non-empty, well-formed Unicode, at most 256 UTF-8 bytes). RFC 7515 leaves the
 * structure of `kid` unspecified; these constraints are PEAC application-level requirements.
 *
 * A parity suite runs the same vectors through the adapter-private predicate and the `@peac/crypto`
 * implementation (imported by source path: `isValidKid` is not part of the crypto public surface),
 * so a divergence between the two fails here. A behavioural suite confirms option validation
 * rejects at the adapter boundary, in UTF-8 bytes, what UTF-16 code-unit counting used to admit.
 *
 * Non-ASCII and control-character literals are expressed with explicit escapes so their intended
 * code points do not depend on source-file rendering or encoding.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeypair } from '@peac/protocol';
import {
  issueRuntimeGovernanceRecord,
  type RuntimeGovernanceEvent,
  type IssueOptions,
} from '../src/index.js';
import {
  MAX_KID_UTF8_BYTES,
  isValidKid,
  isWellFormedUnicode,
  utf8ByteLength,
} from '../src/internal/kid';
import {
  MAX_KID_UTF8_BYTES as CRYPTO_MAX,
  isValidKid as cryptoIsValidKid,
  utf8ByteLength as cryptoUtf8ByteLength,
} from '../../../crypto/src/kid';

const encoder = new TextEncoder();

// One code point of each UTF-8 encoded width, by escape so the byte count is unambiguous.
const CHAR = { 1: 'a', 2: '\u00e9', 3: '\u20ac', 4: '\u{1F600}' } as const;

/** A string of exactly `n` UTF-8 bytes built from code points of the given encoded width. */
function kidOfBytes(n: number, width: 1 | 2 | 3 | 4): string {
  const ch = CHAR[width];
  const whole = Math.floor(n / width);
  const s = ch.repeat(whole) + 'a'.repeat(n - whole * width);
  expect(encoder.encode(s).length).toBe(n);
  return s;
}

const vectors: string[] = [
  'test-key-1',
  'a',
  'Key',
  'key',
  '\u00e9', // precomposed e-acute, 2 bytes
  'e\u0301', // decomposed e-acute, 3 bytes; kept distinct, never normalized
  '  padded  ',
  ' ',
  '\u0000',
  'a\u0000b',
  '\u043a\u043b\u044e\u0447', // Cyrillic
  '\u200b', // zero-width space
  '\ufeff', // BOM as content
  kidOfBytes(255, 1),
  kidOfBytes(256, 1),
  kidOfBytes(257, 1),
  kidOfBytes(255, 2),
  kidOfBytes(256, 2),
  kidOfBytes(257, 2),
  kidOfBytes(255, 3),
  kidOfBytes(256, 3),
  kidOfBytes(257, 3),
  kidOfBytes(255, 4),
  kidOfBytes(256, 4),
  kidOfBytes(257, 4),
  '',
  '\u{1F600}'.repeat(64),
  '\u{1F600}'.repeat(64) + 'a',
  '\ud800', // lone high surrogate
  '\udc00', // lone low surrogate
  'a\ud800z',
  '\u{10000}', // well-formed surrogate pair
  'ok\ud83d', // trailing lone high surrogate
];

describe('parity with the crypto implementation', () => {
  it('shares the byte bound constant', () => {
    expect(MAX_KID_UTF8_BYTES).toBe(CRYPTO_MAX);
  });

  it('accepts and rejects identically across the vector corpus', () => {
    for (const v of vectors) {
      expect(isValidKid(v), `isValidKid ${JSON.stringify(v).slice(0, 40)}`).toBe(
        cryptoIsValidKid(v)
      );
    }
  });

  it('computes identical byte lengths for well-formed vectors', () => {
    for (const v of vectors) {
      if (!isWellFormedUnicode(v)) continue;
      expect(utf8ByteLength(v)).toBe(cryptoUtf8ByteLength(v));
      expect(utf8ByteLength(v)).toBe(encoder.encode(v).length);
    }
  });
});

describe('option validation enforces the byte bound at the adapter boundary', () => {
  let privateKey: Uint8Array;
  const event: RuntimeGovernanceEvent = {
    event_name: 'policy.evaluated',
    payload: { family: 'policy_decision', action: 'allow', evaluation_ms: 1 },
    upstream: { source_system: 'test-system', source_event_type: 'ai.test.policy' },
  };
  const opts = (kid: string): IssueOptions => ({
    kid,
    issuer: 'https://test.example.com',
    sessionId: 'sess-001',
    agentId: 'agent-001',
    provider: 'test-provider',
    privateKey,
  });

  beforeAll(async () => {
    ({ privateKey } = await generateKeypair());
  });

  it('accepts a kid of exactly 256 UTF-8 bytes of multi-byte code points', async () => {
    const kid = kidOfBytes(256, 2);
    await expect(issueRuntimeGovernanceRecord(event, opts(kid))).resolves.toBeDefined();
  });

  it('rejects a kid whose UTF-16 length passes but whose UTF-8 bytes exceed 256', async () => {
    // 128 astral code points: 256 UTF-16 code units (the former max(256) admitted this), 512
    // UTF-8 bytes (the byte bound rejects it).
    const kid = '\u{1F600}'.repeat(128);
    expect(kid.length).toBe(256);
    expect(encoder.encode(kid).length).toBe(512);
    await expect(issueRuntimeGovernanceRecord(event, opts(kid))).rejects.toThrow(/256 UTF-8 bytes/);
  });

  it('rejects 257 UTF-8 bytes, the empty string, and a lone surrogate', async () => {
    for (const kid of ['a'.repeat(257), '', '\ud800']) {
      await expect(issueRuntimeGovernanceRecord(event, opts(kid))).rejects.toThrow(
        /256 UTF-8 bytes/
      );
    }
  });
});
