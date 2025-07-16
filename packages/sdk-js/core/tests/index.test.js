const nock = require('nock');
const {
  fetchPricing,
  checkAccess,
  handlePayment,
  signRequest,
  getTermsHash,
  validateAttribution,
  validateTiers,
} = require('../index.js');

describe('PEAC SDK Tests', () => {
  test('expired session denies access', () => {
    const terms = { valid_until: '2024-01-01T00:00:00Z' };
    expect(checkAccess(terms, {}, {}).access).toBe(false);
  });

  test('expires_in duration denies access if expired', () => {
    const terms = { expires_in: '1h', created_at: Date.now() - 7200000 };
    expect(checkAccess(terms, {}, {}).access).toBe(false);
  });

  test('attribution required vs not', () => {
    const terms = { attribution_required: true };
    expect(validateAttribution({}, terms)).toBe(false);
    expect(validateAttribution({ 'X-PEAC-Attribution-Consent': true }, terms)).toBe(true);
  });

  test('stripe stub', () => {
    const result = handlePayment({ method: 'stripe' });
    expect(result.pricing_proof).toBe('stub-uri');
  });

  test('terms hash consistent', () => {
    const terms = { protocol: 'peac' };
    const h1 = getTermsHash(terms);
    const h2 = getTermsHash(terms);
    expect(h1).toBe(h2);
  });

  test('EIP-712 valid/invalid sig', async () => {
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const request = {
      agent_id: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      user_id: 'test',
      agent_type: 'research',
    };
    const sig = await signRequest(request, privateKey);
    const headers = {
      'X-PEAC-Signature': sig,
      'X-PEAC-Agent-ID': request.agent_id,
    };
    expect(checkAccess({ agent_type: 'research' }, headers, {}).access).toBe(true);
    headers['X-PEAC-Signature'] = 'invalid';
    expect(checkAccess({ agent_type: 'research' }, headers, {}).access).toBe(false);
  });

  test('discovery fallbacks', async () => {
    nock.cleanAll();
    nock('https://example.com')
      .get('/.well-known/pricing.txt')
      .reply(200, 'protocol: peac\nversion: 0.9\n', {
        'Content-Type': 'text/plain',
      });

    const terms = await fetchPricing('https://example.com');
    expect(terms.protocol).toBe('peac');
  });

  test('research agent requires consent', () => {
    const terms = { agent_type: 'research' };
    expect(validateAttribution({}, terms)).toBe(false);
    expect(validateAttribution({ 'X-PEAC-Attribution-Consent': true }, terms)).toBe(true);
  });

  test('metadata deal_id enforcement', () => {
    const terms = { metadata: { deal_id: '123' } };
    expect(checkAccess(terms, { 'X-PEAC-Deal-ID': '123' }, {}).access).toBe(true);
    expect(checkAccess(terms, { 'X-PEAC-Deal-ID': '456' }, {}).access).toBe(false);
  });

  test('pricing_proof in payment', () => {
    const result = handlePayment({ method: 'stripe' });
    expect(result.pricing_proof).toBeDefined();
  });

  test('tiers validation', () => {
    const terms = { tiers: [{ allowed_paths: ['/api/*'] }] };
    expect(validateTiers({ path: '/api/test' }, terms)).toBe(true);
    expect(validateTiers({ path: '/premium/test' }, terms)).toBe(false);
  });

  test('x402 agent type', () => {
    const terms = { agent_type: 'x402' };
    const result = checkAccess(terms, {}, {});
    expect(result.access).toBe(false);
    expect(result.reason).toBe('payment required');
  });
});
