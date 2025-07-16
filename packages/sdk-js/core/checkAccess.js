const { getTermsHash } = require('./hash');
const { validateAttribution } = require('./validateAttribution');
const { validateTiers } = require('./tiers');
const { verifySignature } = require('./signer');

function checkAccess(terms, headers = {}, options = {}) {
  // Expiry enforcement
  if (terms.expires_in || terms.valid_until) {
    const now = Date.now();
    if (terms.valid_until && new Date(terms.valid_until).getTime() < now) {
      return { access: false, reason: 'terms expired' };
    }
    if (terms.expires_in && terms.created_at && now > (terms.created_at + terms.expires_in * 60 * 1000)) {
      return { access: false, reason: 'terms expired (duration)' };
    }
  }

  // Attribution enforcement
  if (!validateAttribution(headers, terms)) {
    return { access: false, reason: 'missing attribution' };
  }

  // Signature enforcement (if required)
  if (terms.require_signature || headers['X-PEAC-Signature']) {
    const request = {
      agent_id: headers['X-PEAC-Agent-ID'],
      user_id: headers['X-PEAC-User-ID'],
      agent_type: headers['X-PEAC-Agent-Type']
    };
    const sig = headers['X-PEAC-Signature'];
    const valid = verifySignature(request, sig);
    if (!valid) {
      return { access: false, reason: 'invalid signature' };
    }
  }

  // Metadata enforcement
  if (terms.metadata?.deal_id && headers['X-PEAC-Deal-ID'] !== terms.metadata.deal_id) {
    return { access: false, reason: 'deal_id mismatch' };
  }

  // Agent type enforcement: block x402 unless payment provided
  if (terms.agent_type === 'x402') {
    return { access: false, reason: 'payment required' };
  }

  // Tiers (optional)
  if (!validateTiers(headers, terms)) {
    return { access: false, reason: 'tier mismatch' };
  }

  return { access: true };
}

module.exports = { checkAccess };
