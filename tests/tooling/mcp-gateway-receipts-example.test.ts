/**
 * Runtime smoke test for examples/mcp-gateway-receipts.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here, not just its types. This imports the demo's exported
 * runGatewayDemo() in-process (vitest aliases @peac/* to source, so no build
 * or example install is required) and asserts the verification outcomes the
 * demo prints on stage:
 *   - the per-call record verifies and its content digest binds
 *   - the tool-definition reference resolves to the published manifest record
 *   - a denied call produces a verifiable deny record
 *   - tampering is detected two independent ways (content-digest mismatch with
 *     a still-valid signature, and an invalid Ed25519 signature)
 *   - no PII reaches the hashed payload
 *
 * No network, no subprocess.
 */

import { describe, it, expect } from 'vitest';
import { runGatewayDemo } from '../../examples/mcp-gateway-receipts/demo';

describe('mcp-gateway-receipts example', () => {
  it('issues, carries, and verifies a gateway tool-call record offline', async () => {
    const r = await runGatewayDemo({ quiet: true });
    expect(r.call.signatureValid).toBe(true);
    expect(r.call.decision).toBe('allow');
    expect(r.call.redactionApplied).toBe('true');
    expect(r.call.digestMatches).toBe(true);
    expect(r.call.defRefMatches).toBe(true);
    expect(r.piiLeak).toBe(false);
  });

  it('records a denied call as verifiable evidence', async () => {
    const r = await runGatewayDemo({ quiet: true });
    expect(r.deny.decision).toBe('deny');
    expect(r.deny.verified).toBe(true);
  });

  it('preserves the unregistered extension groups with a warning', async () => {
    const r = await runGatewayDemo({ quiet: true });
    expect(r.call.warnings).toContain('unknown_extension_preserved');
  });

  it('detects tampering two independent ways', async () => {
    const r = await runGatewayDemo({ tamper: true, quiet: true });
    // Content tamper: the signature still verifies, but the bound digest does not match.
    expect(r.tamper?.signatureStillValid).toBe(true);
    expect(r.tamper?.digestMatchesAfterTamper).toBe(false);
    // Record tamper: the signature fails.
    expect(r.tamper?.payloadTamperValid).toBe(false);
    expect(r.tamper?.payloadTamperCode).toBe('E_INVALID_SIGNATURE');
  });

  it('reports an overall ok verdict with tamper checks enabled', async () => {
    const r = await runGatewayDemo({ tamper: true, quiet: true });
    expect(r.ok).toBe(true);
  });
});
