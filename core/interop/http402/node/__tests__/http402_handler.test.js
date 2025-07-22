const { paymentRequired } = require('../handler');

test('paymentRequired sets 402 and headers', () => {
  let status, headers = {}, body;
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    end: (b) => { body = b; },
    statusCode: 0,
  };
  const pricing = { amount: '0.01', currency: 'USD' };
  paymentRequired(res, pricing);
  expect(res.statusCode).toBe(402);
  expect(headers['X-PEAC-Pricing']).toBe(JSON.stringify(pricing));
  expect(body).toContain('payment_required');
});
