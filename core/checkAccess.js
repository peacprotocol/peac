const parseDuration = require('./parseDuration');
const { validateAttribution } = require('./validateAttribution');
const { validateTiers } = require('./validateTiers');
const { verifySignature } = require('./signer');

function checkAccess(terms, headers, request = {}) {
  const now = Date.now();

  // Session expiry
  if (terms.valid_until && Date.parse(terms.valid_until) < now) {
    return { access: false, reason: 'session expired' };
  }

  if (terms.expires_in && terms.created_at) {
    const duration = parseDuration(terms.expires_in);
    if (terms.created_at + duration < now) {
      return { access: false, reason: 'session expired' };
    }
  }

  // Attribution (unified)
  if (!validateAttribution(headers, terms)) {
    return { access: false, reason: 'attribution consent missing' };
  }

  // x402 fallback
  if (terms.agent_type === 'x402') {
    return { access: false, reason: 'payment required' };
  }

// EIP-712 Signature
const sig = headers['X-PEAC-Signature'];
if (sig) {
  // Use the full request object (as signed!)
  const verified = verifySignature(request, sig);
  if (!verified) {
    return { access: false, reason: 'signature invalid' };
  }
}

  // Metadata deal ID
  if (
    terms.metadata?.deal_id &&
    headers['X-PEAC-Deal-ID'] !== terms.metadata.deal_id
  ) {
    return { access: false, reason: 'deal ID mismatch' };
  }

  // Tiered path
  if (!validateTiers(request, terms)) {
    return { access: false, reason: 'tier access denied' };
  }

  return { access: true };
}

module.exports = { checkAccess };