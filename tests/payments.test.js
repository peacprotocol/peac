// tests/payments.test.js
const Payments = require('../sdk/payments');
test('Payments module loads', () => {
  expect(typeof Payments).toBe('function' || 'object');
});
