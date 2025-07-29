const { checkAccess } = require('../checkAccess');
const { signRequest } = require('../signer');

describe('PEAC SDK Tests', () => {
  test('expired session denies access', () => {
    const terms = { valid_until: '2024-01-01T00:00:00Z' };
    expect(checkAccess(terms, {}, {}).access).toBe(false);
  });

  test('expires_in duration denies access if expired', () => {
    const terms = {
      expires_in: '1h',
      created_at: Date.now() - 2 * 60 * 60 * 1000,
    };
    expect(checkAccess(terms, {}, {}).access).toBe(false);
  });

  test('attribution required vs not', () => {
    const terms = { attribution_required: true };
    const headers = { 'X-PEAC-Attribution-Consent': 'true' };
    expect(checkAccess(terms, headers, {}).access).toBe(true);
    expect(checkAccess(terms, {}, {}).access).toBe(false);
  });

  test('stripe stub', () => {
    const terms = { payment_method: 'stripe', pricing_proof: 'stub-uri' };
    expect(terms.payment_method).toBe('stripe');
    expect(terms.pricing_proof).toBe('stub-uri');
  });

  test('terms hash consistent', () => {
    const { getTermsHash } = require('../hash');
    const terms = { version: '0.9', default_access: 'allow' };
    const hash1 = getTermsHash(terms);
    const hash2 = getTermsHash({ default_access: 'allow', version: '0.9' });
    expect(hash1).toBe(hash2);
  });

  test('EIP-712 valid/invalid sig', () => {
    const { signRequest } = require('../signer');

    const privateKey = '0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
    const agent_id = '0xefc07321d3d6a8fa4961306c7bf555f0723f28c1'; // <- MUST match privateKey!
    const user_id = 'user-123';
    const agent_type = 'crawler';

    const request = { agent_id, user_id, agent_type };
    const signature = signRequest(request, privateKey);

    const headers = {
      'X-PEAC-Agent-ID': agent_id,
      'X-PEAC-User-ID': user_id,
      'X-PEAC-Agent-Type': agent_type,
      'X-PEAC-Signature': signature,
    };

    const terms = { agent_type };

    const resultValid = checkAccess(terms, headers, request);
    expect(resultValid.access).toBe(true);

    headers['X-PEAC-Signature'] = '0xdeadbeef';
    const resultInvalid = checkAccess(terms, headers, request);
    expect(resultInvalid.access).toBe(false);
  });

  test('discovery fallbacks', async () => {
    const nock = require('nock');
    const { fetchPricing } = require('../fetchPricing');

    const pricingTxt = `
protocol: peac
version: 0.9
default_access: allow
    `;

    nock('https://example.com')
      .get('/.well-known/pricing.txt')
      .reply(200, pricingTxt, { 'Content-Type': 'text/plain' });

    const terms = await fetchPricing('https://example.com');
    expect(terms.default_access).toBe('allow');
  });

  test('research agent requires consent', () => {
    const terms = { agent_type: 'research', attribution_required: true };
    const headers = { 'X-PEAC-Attribution-Consent': 'true' };
    expect(checkAccess(terms, headers, {}).access).toBe(true);
  });

  test('metadata deal_id enforcement', () => {
    const terms = { metadata: { deal_id: 'abc123' } };
    expect(checkAccess(terms, { 'X-PEAC-Deal-ID': 'abc123' }, {}).access).toBe(true);
    expect(checkAccess(terms, { 'X-PEAC-Deal-ID': 'wrong' }, {}).access).toBe(false);
  });

  test('pricing_proof in payment', () => {
    const terms = { payment_method: 'stripe', pricing_proof: 'stub-uri' };
    expect(terms.pricing_proof).toMatch(/^stub/);
  });

  test('tiers validation', () => {
    const { validateTiers } = require('../tiers');
    const terms = {
      tiers: [{ allowed_paths: ['/api/test'] }],
    };
    expect(validateTiers({ path: '/api/test' }, terms)).toBe(true);
    expect(validateTiers({ path: '/api/other' }, terms)).toBe(false);
  });

  test('x402 agent type', () => {
    const terms = { agent_type: 'x402' };
    const result = checkAccess(terms, {}, {});
    expect(result.access).toBe(false);
    expect(result.reason).toBe('payment required');
  });

  test('x402 header triggers payment required', () => {
    const terms = { agent_type: 'research', attribution_required: true };
    const headers = {
      'X-402-Payment-Required': 'true',
      'X-PEAC-Attribution-Consent': 'true', // ensure consent is present!
    };
    const result = checkAccess(terms, headers, {});
    expect(result.access).toBe(false);
    expect(result.reason).toBe('payment required');
  });
});
