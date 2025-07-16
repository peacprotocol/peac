const nock = require('nock');

const const {
  fetchPricing,
  checkAccess,
  handlePayment,
  handlePaymentReal,
  signRequest,
  getTermsHash,
  validateAttribution,
  validateTiers
} = require('../index.js');

describe('PEAC SDK Tests', () => {
  test('expired session denies access', () => {
    const terms = { valid_until: '2024-01-01T00:00:00Z' };
    expect(checkAccess(terms, {}, {}).access).toBe(false);
    expect(checkAccess(terms, {}, {}).reason).toBe('session expired');
  });

  test('expires_in duration denies access if expired', () => {
    const terms = { expires_in: '1h', created_at: Date.now() - 7200000 }; // 2h ago
    expect(checkAccess(terms, {}, {}).access).toBe(false);
  });

  test('attribution required vs not', () => {
    const termsRequired = { attribution_required: true };
    expect(validateAttribution({}, termsRequired)).toBe(false);
    expect(validateAttribution({ 'X-PEAC-Attribution-Consent': true }, termsRequired)).toBe(true);
  });

  test('stripe stub', () => {
    const result = handlePayment({ method: 'stripe' });
    expect(result.pricing_proof).toBe('stub-uri');
  });

  test('terms hash consistent', () => {
    const terms = { protocol: 'peac' };
    const hash1 = getTermsHash(terms);
    const hash2 = getTermsHash(terms);
    expect(hash1).toBe(hash2);
  });

  test('EIP-712 valid/invalid sig', async () => {
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const request = { agent_id: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', user_id: 'test', agent_type: 'research' };
    const sig = await signRequest(request, privateKey);
    const headers = { 'X-PEAC-Signature': sig, 'X-PEAC-Agent-ID': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' };
    expect(checkAccess({ agent_type: 'research' }, headers, {}).access).toBe(true);
    headers['X-PEAC-Signature'] = 'invalid';
    expect(checkAccess({ agent_type: 'research' }, headers, {}).access).toBe(false);
  });

  test('discovery fallbacks', async () => {
    nock('https://example.com')
      .get('/pricing.txt').reply(404)
      .get('/.well-known/peac.yaml').reply(404)
      .get('/.well-known/peac.json').reply(200, '{"protocol": "peac", "version": "0.9"}', { 'content-type': 'application/json' });
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
    expect(checkAccess(terms, {}, {}).access).toBe(false);
    expect(checkAccess(terms, {}, {}).reason).toBe('payment required');
  });
});
