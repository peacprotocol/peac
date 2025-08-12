import { mintSession, verifySession } from '../../src/core/session';

describe('Session Management', () => {
  it('should mint RS256 session', async () => {
    const session = await mintSession('agent-123');
    expect(session).toBeDefined();
    expect(session.split('.')).toHaveLength(3);
  });
  
  it('should include cnf.jkt when JWK provided', async () => {
    const jwk = { kty: 'RSA', n: 'test', e: 'AQAB' };
    const session = await mintSession('agent-123', jwk);
    const payload = await verifySession(session);
    expect(payload.cnf?.jkt).toBeDefined();
  });
});
