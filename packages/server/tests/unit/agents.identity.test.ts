import { generateKeyPair, exportJWK, CompactSign } from 'jose';
import { verifyAgentDescriptor } from '../../src/agents/identity';
import { canonicalize } from '../../src/crypto/jcs';

function buildDescriptor(base: any, payloadJws: string) {
  return { ...base, signature: payloadJws };
}

test('JWS-over-JCS happy path (inline jwk)', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const desc = { id: 'agent-1', name: 'Agent', purposes: ['policy:read'], jwk };

  const jcs = canonicalize(desc);
  const jws = await new CompactSign(new TextEncoder().encode(jcs))
    .setProtectedHeader({ alg: 'RS256' })
    .sign(privateKey);

  const verified = await verifyAgentDescriptor(buildDescriptor(desc, jws));
  expect(verified.jwk.kty).toBe(jwk.kty);
});

test('payload mismatch -> agent_invalid', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const desc = { id: 'agent-1', name: 'Agent', purposes: ['policy:read'], jwk };

  const jcs = canonicalize(desc);
  const jws = await new CompactSign(new TextEncoder().encode(jcs))
    .setProtectedHeader({ alg: 'RS256' })
    .sign(privateKey);

  const tampered = { ...desc, name: 'Agent 2' };
  await expect(verifyAgentDescriptor(buildDescriptor(tampered, jws))).rejects.toThrow('agent_invalid');
});
