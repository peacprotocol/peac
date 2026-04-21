/**
 * x402 PR #1986 terms digest helper tests (v0.12.14).
 *
 * Asserts:
 *   - computeX402TermsDigest produces sha256:<64 hex> for json / markdown / plaintext
 *   - uri without bytes returns 'unavailable'
 *   - uri with bytes hashes via the text helper
 *   - cross-representation envelope digests differ (each envelope is its
 *     own binding identity)
 *   - byte equivalence with the canonical @peac/protocol document-binding
 *     helpers (this package only re-exports / dispatches; never invents)
 */

import { describe, it, expect } from 'vitest';
import {
  computeX402TermsDigest,
  computeJsonDocumentDigestJcs as x402Json,
  computeTextDocumentDigestUtf8 as x402Text,
} from '../src/terms.js';
import { computeJsonDocumentDigestJcs, computeTextDocumentDigestUtf8 } from '@peac/protocol';

const HEX_RE = /^sha256:[0-9a-f]{64}$/;

describe('computeX402TermsDigest', () => {
  it('hashes json terms via the canonical JCS helper', async () => {
    const d = await computeX402TermsDigest({
      representation: 'json',
      value: { id: 'terms-1', price: { amount: '1000', currency: 'USDC' } },
    });
    expect(typeof d).toBe('string');
    expect(d as string).toMatch(HEX_RE);

    const direct = await computeJsonDocumentDigestJcs({
      id: 'terms-1',
      price: { amount: '1000', currency: 'USDC' },
    });
    expect(d).toBe(direct);
  });

  it('hashes markdown terms via the text helper', async () => {
    const md = '# Terms\n\nUse permitted for inference.\n';
    const d = await computeX402TermsDigest({ representation: 'markdown', bytes: md });
    expect(d as string).toMatch(HEX_RE);
    expect(d).toBe(await computeTextDocumentDigestUtf8(md, 'markdown'));
  });

  it('hashes plaintext terms via the text helper', async () => {
    const txt = 'Use permitted for inference.\n';
    const d = await computeX402TermsDigest({ representation: 'plaintext', bytes: txt });
    expect(d as string).toMatch(HEX_RE);
    expect(d).toBe(await computeTextDocumentDigestUtf8(txt, 'plaintext'));
  });

  it('returns "unavailable" for uri without bytes', async () => {
    const d = await computeX402TermsDigest({
      representation: 'uri',
      uri: 'https://example.com/terms.txt',
    });
    expect(d).toBe('unavailable');
  });

  it('hashes uri-supplied bytes via the text helper (treated as plaintext)', async () => {
    const bytes = 'Use permitted for inference.\n';
    const d = await computeX402TermsDigest({
      representation: 'uri',
      uri: 'https://example.com/terms.txt',
      bytes,
    });
    expect(d).toBe(await computeTextDocumentDigestUtf8(bytes, 'plaintext'));
  });

  it('json vs plaintext envelopes of nominally-equivalent data differ', async () => {
    const a = await computeX402TermsDigest({
      representation: 'json',
      value: { msg: 'hi' },
    });
    const b = await computeX402TermsDigest({
      representation: 'plaintext',
      bytes: 'msg=hi\n',
    });
    expect(a).not.toBe(b);
  });

  it('re-exports of helper names are byte-stable with @peac/protocol', async () => {
    const v = { a: 1 };
    expect(await x402Json(v)).toBe(await computeJsonDocumentDigestJcs(v));
    expect(await x402Text('hi\n', 'plaintext')).toBe(
      await computeTextDocumentDigestUtf8('hi\n', 'plaintext')
    );
  });
});
