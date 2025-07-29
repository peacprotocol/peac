/**
 * PEAC Protocol v0.9.1
 * Lite Mode Token - Node.js
 * Apache-2.0 License
 */
const issuedTokens = new Set();
function generateToken(agentId) {
  const token = Buffer.from(`${agentId}:${Date.now()}`).toString('base64');
  issuedTokens.add(token);
  return token;
}
function validateToken(token) {
  return issuedTokens.has(token);
}
module.exports = { generateToken, validateToken };
