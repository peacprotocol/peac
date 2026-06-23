/**
 * Runtime smoke test for examples/commerce-evidence-bundle.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here, not just its types. This imports the demo's exported runDemo()
 * in-process (vitest aliases @peac/* to source, so no build or example install
 * is required) and asserts:
 *   - the in-memory commerce evidence bundle composes (rails, timeline, refs)
 *   - the signed dispute bundle of the same evidence verifies offline with only
 *     the bundled public key (every receipt valid, recommendation "valid")
 *   - a tampered receipt is detected: the bundle still reads, but offline
 *     verification flags it invalid and the recommendation is no longer "valid"
 *
 * No network, no subprocess.
 */

import { describe, it, expect } from 'vitest';
import { runDemo } from '../../examples/commerce-evidence-bundle/demo';

describe('commerce-evidence-bundle example', () => {
  it('composes a non-aggregating commerce evidence bundle', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.commerce.railsObserved.length).toBeGreaterThan(0);
    expect(r.commerce.railsObserved).toContain('paymentauth');
    expect(r.commerce.railsObserved).toContain('stripe');
    expect(r.commerce.timelineLength).toBeGreaterThan(0);
    expect(r.commerce.receiptsLength).toBeGreaterThan(0);
    expect(r.commerce.serializedLength).toBeGreaterThan(0);
  });

  it('packs the evidence into a dispute bundle that verifies offline', async () => {
    const r = await runDemo({ quiet: true });
    expect(r.verify.verified).toBe(true);
    expect(r.verify.bundleSignatureValid).toBe(true);
    expect(r.verify.totalReceipts).toBeGreaterThan(0);
    expect(r.verify.totalReceipts).toBe(r.commerce.receiptsLength);
    expect(r.verify.valid).toBe(r.verify.totalReceipts);
    expect(r.verify.invalid).toBe(0);
    expect(r.verify.recommendation).toBe('valid');
    expect(r.ok).toBe(true);
  });

  it('detects a tampered receipt while the bundle signature stays valid', async () => {
    const r = await runDemo({ tamper: true, quiet: true });
    // The bundle containing the tampered receipt is internally consistent, so reading it succeeds...
    expect(r.tamper?.bundleReadOk).toBe(true);
    // ...and the bundle's own signature is unaffected (only a receipt changed)...
    expect(r.tamper?.bundleSignatureValid).toBe(true);
    // ...but recomputing the Ed25519 signatures flags the tampered receipt.
    expect(r.tamper?.invalid).toBeGreaterThanOrEqual(1);
    expect(r.tamper?.recommendation).not.toBe('valid');
  });

  it('reports an overall ok verdict with the tamper check enabled', async () => {
    const r = await runDemo({ tamper: true, quiet: true });
    expect(r.ok).toBe(true);
  });
});
