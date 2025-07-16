const { verifySignature } = require('./signer');

function checkAccess(terms = {}, headers = {}, context = {}) {
  const now = Date.now();

  if (terms.valid_until && Date.parse(terms.valid_until) < now) {
    return { access: false, reason: 'session expired' };
  }

  if (terms.expires_in && terms.created_at) {
    const created = Number(terms.created_at);
    const durationMs = parseExpiresIn(terms.expires_in);
    if (created + durationMs < now) {
      return { access: false, reason: 'session expired' };
    }
  }

  if (terms.metadata?.deal_id) {
    const provided = headers['X-PEAC-Deal-ID'];
    if (provided !== terms.metadata.deal_id) {
      return { access: false, reason: 'invalid deal_id' };
    }
  }

  if (terms.agent_type === 'x402') {
    return { access: false, reason: 'payment required' };
  }

  if (terms.agent_type === 'research') {
    const sig = headers['X-PEAC-Signature'];
    const agentId = headers['X-PEAC-Agent-ID'];
    const request = {
      agent_id: agentId,
      user_id: 'test',
      agent_type: 'research',
    };
    if (!verifySignature(request, sig)) {
      return { access: false, reason: 'invalid signature' };
    }
  }

  return { access: true };
}

function parseExpiresIn(str) {
  const match = /^(\d+)([smhd])$/.exec(str);
  if (!match) return 0;
  const [_, value, unit] = match;
  const n = parseInt(value);
  return (
    n *
    {
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000,
    }[unit]
  );
}

module.exports = { checkAccess };
