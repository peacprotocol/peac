const { generateToken, validateToken } = require('../token');

test('generates and validates tokens', () => {
  const agentId = 'test-agent';
  const token = generateToken(agentId);
  expect(typeof token).toBe('string');
  expect(validateToken(token)).toBe(true);
  expect(validateToken('invalid')).toBe(false);
});
