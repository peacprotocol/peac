/**
 * SHA-256 boundary-contract golden lock.
 *
 * PEAC computes SHA-256 digests in two places by necessity:
 *
 *  - `@peac/crypto` `sha256Hex` (Layer 2) is the canonical bare-hex SHA-256
 *    helper. It returns BARE lowercase hex; the `sha256:` reference prefix is
 *    applied only at the digest-reference boundary.
 *  - `@peac/schema` `computeReceiptRef` (Layer 1) reimplements SHA-256 directly
 *    via `crypto.subtle` and returns `sha256:<hex>`. It CANNOT import
 *    `@peac/crypto` without an up-layer dependency violation (schema depends
 *    only on `@peac/kernel`), so the two implementations are deliberately
 *    separate.
 *
 * This test is the regression gate that locks the two implementations together:
 * `computeReceiptRef(jws)` MUST be byte-identical to
 * `'sha256:' + (await sha256Hex(jws))`. Tests are not layer-constrained, so this
 * is the one place both can be imported and compared. If this ever diverges,
 * receipt_ref values stop matching across boundaries and "verify across
 * boundaries" breaks. It is a consistency lock, not a format change: Wire 0.2
 * and every committed receipt_ref stay byte-identical.
 *
 * The bundle-vector digest content lock (content_hash / file hashes /
 * receipt_hash / report_hash) lives in `packages/audit/tests/bundle-vectors.test.ts`,
 * which verifies the committed vectors through the real verifier; the bundle
 * generator (`scripts/generate-bundle-vectors.ts`) follows the same
 * bare-hex + boundary-prefix contract via its local `digestRef` helper.
 */

import { describe, it, expect } from 'vitest';

import { sha256Hex } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';

// Inputs intentionally include compact-JWS-shaped strings and non-JWS strings.
// This parity test only requires byte-identical SHA-256 input handling across
// the schema and crypto digest paths.
const INPUTS = [
  'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJkaWQ6a2V5OnoxMjMifQ.c2lnbmF0dXJl',
  'eyJ.eyJ.different',
  '',
  'a',
  'unicode-éü✓-payload',
  'x'.repeat(4096),
];

describe('SHA-256 boundary contract: computeReceiptRef matches crypto.sha256Hex', () => {
  it.each(INPUTS)(
    'computeReceiptRef(input) === "sha256:" + sha256Hex(input) [len %#]',
    async (input) => {
      const viaSchema = await computeReceiptRef(input);
      const viaCrypto = `sha256:${await sha256Hex(input)}`;
      expect(viaSchema).toBe(viaCrypto);
    }
  );

  it('computeReceiptRef applies the sha256: prefix exactly once over bare hex', async () => {
    const ref = await computeReceiptRef(INPUTS[0]);
    expect(ref).toMatch(/^sha256:[0-9a-f]{64}$/);
    // The hex body must be the bare crypto digest (prefix is a boundary concern).
    expect(ref.slice('sha256:'.length)).toBe(await sha256Hex(INPUTS[0]));
  });

  it('sha256Hex itself never carries the reference prefix', async () => {
    expect((await sha256Hex(INPUTS[0])).startsWith('sha256:')).toBe(false);
  });
});
