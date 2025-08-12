import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { verifyDPoP } from '../../src/crypto/dpop';

describe('DPoP verification', () => {
  it('verifies exact htm and htu', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const dpop = await new SignJWT({ htm: 'POST', htu: 'http://example.com/verify' })
      .setProtectedHeader({ typ: 'dpop+jwt', alg: 'RS256' })
      .sign(privateKey);
    const jwk = await exportJWK(publicKey);
    await expect(verifyDPoP(dpop, jwk as any, { htm: 'POST', htu: 'http://example.com/verify' })).resolves.toBeUndefined();
  });
});
