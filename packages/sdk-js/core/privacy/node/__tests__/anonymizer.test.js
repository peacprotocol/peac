const { anonymizeId, logRequest } = require('../anonymizer');

describe('Privacy Anonymizer', () => {
  it('hashes agent IDs securely', () => {
    const h1 = anonymizeId('bot123');
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    const h2 = anonymizeId('bot123');
    expect(h1).toBe(h2);
  });

  it('logs requests unless do_not_log is true', () => {
    const log = logRequest({ agentId: 'abc', path: '/foo', do_not_log: false });
    expect(log).toHaveProperty('timestamp');
    expect(log.agent).toBe(anonymizeId('abc'));
    expect(log.path).toBe('/foo');
    expect(log.privacy).toBe('normal');
    // If do_not_log: true, returns null
    expect(logRequest({ agentId: 'abc', path: '/foo', do_not_log: true })).toBeNull();
  });
});
