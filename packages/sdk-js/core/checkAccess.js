const { verifySignature } = require('./signer');
const parseDuration = require('./parseDuration');

function checkAccess(terms, headers, session = {}) {
  const now = Date.now();

  if (terms.valid_until && new Date(terms.valid_until).getTime() < now) {
    return { access: false, reason: 'session expired' };
  }

  if (terms.expires_in && terms.created_at) {
    const durationMs = parseDuration(terms.expires_in);
    if (now > terms.created_at + durationMs) {
      return { access: false, reason: 'session expired' };
    }
  }

  if (terms.metadata?.deal_id) {
    if (headers['X-PEAC-Deal-ID'] !== terms.metadata.deal_id) {
      return { access: false, reason: 'deal_id mismatch' };
    }
  }

  if (terms.agent_type === 'research') {
    const sig = headers['X-PEAC-Signature'];
    const agentId = headers['X-PEAC-Agent-ID'];
    const valid = verifySignature({
      agent_id: agentId,
      user_id: 'test-user',
      agent_type: 'research',
    }, sig, agentId);
    if (!valid) return { access: false, reason: 'invalid signature' };
  }

  if (terms.agent_type === 'x402') {
    return { access: false, reason: 'payment required' };
  }

  return { access: true };
}

module.exports = { checkAccess };
