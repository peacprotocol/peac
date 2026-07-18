/**
 * CI smoke test for examples/gateway-decision-evidence.
 *
 * Thin: confirms the example runs end-to-end and that a trust failure is
 * detected. The comprehensive assertion battery lives in the example itself
 * (gateway-decision-evidence.test.ts, run via
 * `pnpm --filter @peac/example-gateway-decision-evidence test`).
 */

import { describe, it, expect } from 'vitest';
import {
  runDemo,
  issueAccessDecision,
  verifyGatewayDecision,
  GATEWAY_ISSUER,
  GATEWAY_KID,
} from '../../examples/gateway-decision-evidence/demo.js';
import { generateKeypair } from '@peac/crypto';

describe('gateway-decision-evidence example (smoke)', () => {
  it('runDemo issues three verified terminal decisions and abstains for the rest', async () => {
    const r = await runDemo();
    expect(r.issued.length).toBe(3);
    expect(r.issued.every((i) => i.verified && i.kid === GATEWAY_KID)).toBe(true);
    expect(r.abstained.length).toBe(7);
  });

  it('rejects a valid record from a signer the relying party does not accept', async () => {
    const gateway = await generateKeypair();
    const attacker = await generateKeypair();
    const impersonation = await issueAccessDecision({
      issuer: GATEWAY_ISSUER,
      privateKey: attacker.privateKey,
      kid: GATEWAY_KID,
      access: { resource: 'https://x', action: 'records.read', decision: 'allow' },
    });
    const v = await verifyGatewayDecision(impersonation, {
      expectedIssuer: GATEWAY_ISSUER,
      acceptedPublicKey: gateway.publicKey,
      expectedKid: GATEWAY_KID,
    });
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('E_INVALID_SIGNATURE');
  });
});
