/**
 * Document binding tests (v0.12.14).
 *
 * Covers:
 *   - computeJsonDocumentDigestJcs (RFC 8785 JCS + SHA-256, sha256:<64 hex>)
 *   - computeTextDocumentDigestUtf8 (UTF-8 + minimal canonicalization)
 *   - computeDocumentDigest (umbrella dispatcher; uri returns 'unavailable'
 *     without bytes)
 *   - checkDocumentBinding three-state semantics
 *   - cross-representation comparison is `failed`
 *   - text canonicalization rule locks (CRLF -> \n, NFC, but trailing
 *     whitespace / blank lines / case preserved)
 *   - publisher-supplied canonical_digest semantics
 *   - byte-identical equivalence: computePolicyDigestJcs ===
 *     computeJsonDocumentDigestJcs
 */

import { describe, it, expect } from 'vitest';
import {
  computeJsonDocumentDigestJcs,
  computeTextDocumentDigestUtf8,
  computeDocumentDigest,
  checkDocumentBinding,
  computePolicyDigestJcs,
  checkPolicyBinding,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEX_RE = /^sha256:[0-9a-f]{64}$/;

function expectHash(s: string | 'unavailable'): asserts s is string {
  expect(typeof s).toBe('string');
  expect(s).toMatch(HEX_RE);
}

// ---------------------------------------------------------------------------
// JSON helper
// ---------------------------------------------------------------------------

describe('computeJsonDocumentDigestJcs', () => {
  it('returns sha256:<64 hex> for a simple object', async () => {
    const d = await computeJsonDocumentDigestJcs({ a: 1, b: 'x' });
    expectHash(d);
  });

  it('is invariant under JCS key reordering', async () => {
    const a = await computeJsonDocumentDigestJcs({ a: 1, b: 2 });
    const b = await computeJsonDocumentDigestJcs({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('changes when JSON values change', async () => {
    const a = await computeJsonDocumentDigestJcs({ a: 1 });
    const b = await computeJsonDocumentDigestJcs({ a: 2 });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Text helper
// ---------------------------------------------------------------------------

describe('computeTextDocumentDigestUtf8', () => {
  it('returns sha256:<64 hex> for a markdown body', async () => {
    const d = await computeTextDocumentDigestUtf8('# Hello\n', 'markdown');
    expectHash(d);
  });

  it('returns sha256:<64 hex> for a plaintext body', async () => {
    const d = await computeTextDocumentDigestUtf8('hello\n', 'plaintext');
    expectHash(d);
  });

  it('treats the same bytes identically across markdown and plaintext tags', async () => {
    // The representation tag is recorded for callers; the digest itself
    // is currently scheme-equivalent for the two text types.
    const m = await computeTextDocumentDigestUtf8('hello\n', 'markdown');
    const p = await computeTextDocumentDigestUtf8('hello\n', 'plaintext');
    expect(m).toBe(p);
  });
});

// ---------------------------------------------------------------------------
// Text canonicalization rule (DD-266 lock)
// ---------------------------------------------------------------------------

describe('text canonicalization rule', () => {
  it('normalizes CRLF to LF', async () => {
    const lf = await computeTextDocumentDigestUtf8('line one\nline two\n', 'plaintext');
    const crlf = await computeTextDocumentDigestUtf8('line one\r\nline two\r\n', 'plaintext');
    expect(lf).toBe(crlf);
  });

  it('normalizes lone CR to LF', async () => {
    const lf = await computeTextDocumentDigestUtf8('a\nb\n', 'plaintext');
    const cr = await computeTextDocumentDigestUtf8('a\rb\r', 'plaintext');
    expect(lf).toBe(cr);
  });

  it('normalizes NFC vs NFD Unicode forms', async () => {
    const nfc = await computeTextDocumentDigestUtf8('\u00e9', 'plaintext'); // é precomposed
    const nfd = await computeTextDocumentDigestUtf8('e\u0301', 'plaintext'); // e + combining acute
    expect(nfc).toBe(nfd);
  });

  it('PRESERVES trailing whitespace (lock against accidental stripping)', async () => {
    const a = await computeTextDocumentDigestUtf8('hello\n', 'plaintext');
    const b = await computeTextDocumentDigestUtf8('hello   \n', 'plaintext');
    expect(a).not.toBe(b);
  });

  it('PRESERVES blank lines (lock against accidental collapsing)', async () => {
    const a = await computeTextDocumentDigestUtf8('a\n\nb\n', 'plaintext');
    const b = await computeTextDocumentDigestUtf8('a\nb\n', 'plaintext');
    expect(a).not.toBe(b);
  });

  it('PRESERVES letter case (lock against accidental case folding)', async () => {
    const a = await computeTextDocumentDigestUtf8('Hello\n', 'plaintext');
    const b = await computeTextDocumentDigestUtf8('hello\n', 'plaintext');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Umbrella dispatcher
// ---------------------------------------------------------------------------

describe('computeDocumentDigest dispatcher', () => {
  it('routes json input to the JSON helper', async () => {
    const a = await computeDocumentDigest({ representation: 'json', value: { a: 1 } });
    const b = await computeJsonDocumentDigestJcs({ a: 1 });
    expect(a).toBe(b);
  });

  it('routes markdown input to the text helper', async () => {
    const a = await computeDocumentDigest({ representation: 'markdown', bytes: '# hi\n' });
    const b = await computeTextDocumentDigestUtf8('# hi\n', 'markdown');
    expect(a).toBe(b);
  });

  it('routes plaintext input to the text helper', async () => {
    const a = await computeDocumentDigest({ representation: 'plaintext', bytes: 'hi\n' });
    const b = await computeTextDocumentDigestUtf8('hi\n', 'plaintext');
    expect(a).toBe(b);
  });

  it('returns "unavailable" for uri without bytes', async () => {
    const r = await computeDocumentDigest({
      representation: 'uri',
      uri: 'https://example.com/terms.txt',
    });
    expect(r).toBe('unavailable');
  });

  it('hashes uri-supplied bytes via the text helper', async () => {
    const a = await computeDocumentDigest({
      representation: 'uri',
      uri: 'https://example.com/terms.txt',
      bytes: 'hi\n',
    });
    const b = await computeTextDocumentDigestUtf8('hi\n', 'plaintext');
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Cross-representation: failed by design
// ---------------------------------------------------------------------------

describe('cross-representation comparison', () => {
  it('json vs plaintext envelopes of nominally-equivalent data are NOT equal', async () => {
    const json = await computeJsonDocumentDigestJcs({ greeting: 'hi' });
    const text = await computeTextDocumentDigestUtf8('greeting=hi\n', 'plaintext');
    expect(json).not.toBe(text);
    // checkDocumentBinding therefore reports 'failed' when callers try to
    // compare them directly.
    expect(checkDocumentBinding(json, text)).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// checkDocumentBinding three-state
// ---------------------------------------------------------------------------

describe('checkDocumentBinding', () => {
  it('returns unavailable when receipt digest is missing', () => {
    expect(checkDocumentBinding(undefined, 'sha256:' + 'a'.repeat(64))).toBe('unavailable');
  });

  it('returns unavailable when local digest is missing', () => {
    expect(checkDocumentBinding('sha256:' + 'a'.repeat(64), undefined)).toBe('unavailable');
  });

  it('returns verified when both digests match exactly', async () => {
    const d = await computeJsonDocumentDigestJcs({ a: 1 });
    expect(checkDocumentBinding(d, d)).toBe('verified');
  });

  it('returns failed when both digests are present but differ', async () => {
    const a = await computeJsonDocumentDigestJcs({ a: 1 });
    const b = await computeJsonDocumentDigestJcs({ a: 2 });
    expect(checkDocumentBinding(a, b)).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// Byte equivalence with the legacy policy-binding API
// ---------------------------------------------------------------------------

describe('policy-binding compatibility shim', () => {
  it('computePolicyDigestJcs output is byte-identical to computeJsonDocumentDigestJcs', async () => {
    const samples: unknown[] = [
      { version: 'peac-policy/0.1' },
      { a: 1, b: [1, 2, 3], c: { nested: true } },
      [1, 2, 3, { x: 'y' }],
      'a string',
      42,
      true,
      null,
    ];
    for (const s of samples) {
      const v = s as Parameters<typeof computeJsonDocumentDigestJcs>[0];
      const legacy = await computePolicyDigestJcs(v);
      const generic = await computeJsonDocumentDigestJcs(v);
      expect(legacy).toBe(generic);
    }
  });

  it('checkPolicyBinding output is byte-identical to checkDocumentBinding', () => {
    const a = 'sha256:' + 'a'.repeat(64);
    const b = 'sha256:' + 'b'.repeat(64);
    for (const [r, l] of [
      [undefined, undefined],
      [a, undefined],
      [undefined, a],
      [a, a],
      [a, b],
    ] as const) {
      expect(checkPolicyBinding(r, l)).toBe(checkDocumentBinding(r, l));
    }
  });
});
