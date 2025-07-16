const { verifySignature } = require('./signer');
const { validateAttribution } = require('./validateAttribution.js');
const { validateTiers } = require('./validateTiers.js');

/**
 * Main access check logic for PEAC
 */
function checkAccess(terms = {}, headers = {}, request = {}) {
  // 1. Deny if session expired
  if (terms.valid_until && Date.now() > new Date(terms.valid_until).getTime()) {
    return { access: false, reason: 'session expired' };
  }

  if (terms.expires_in && terms.created_at && Date.now() > terms.created_at + parseExpiresIn(terms.expires_in)) {
    return { access: false, reason: 'session expired' };
  }

  // 2. Agent type = research/x402 may require signature
  const agentType = terms.agent_type || request.agent_type;

  if (agentType === 'x402') {
    return { access: false, reason: 'payment required' };
  }

  if (agentType === 'research') {
    const sig = headers['X-PEAC-Signature'];
    const agentId = headers['X-PEAC-Agent-ID'];
    const userId = headers['X-PEAC-User-ID'];

    if (!sig || !agentId || !userId) {
      return { access: false, reason: 'missing signature headers' };
    }

    const reconstructedRequest = {
      agent_id: agentId,
      user_id: userId,
      agent_type: 'research',
    };

    const valid = verifySignature(reconstructedRequest, sig);
    if (!valid) {
      return { access: false, reason: 'invalid signature' };
    }
  }

  // 3. Deal ID match
  if (terms.metadata?.deal_id) {
    const headerDealId = headers['X-PEAC-Deal-ID'];
    if (headerDealId !== terms.metadata.deal_id) {
      return { access: false, reason: 'invalid deal' };
    }
  }

  // 4. Attribution required
  if (!validateAttribution(headers, terms)) {
    return { access: false, reason: 'missing attribution' };
  }

  // 5. Tier validation
  if (!validateTiers(request, terms)) {
    return { access: false, reason: 'not in tier' };
  }

  return { access: true };
}

function parseExpiresIn(str) {
  const match = /^(\d+)([smhd])$/.exec(str);
  if (!match) return 0;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  return num * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
}

module.exports = { checkAccess };
