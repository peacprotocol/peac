const parseDuration = require('./parseDuration');
const { validateAttribution } = require('./attribution');
const { validateTiers } = require('./tiers');
const { verifySignature } = require('./signer');

/**
 * Looks up and merges the applicable agent_rule for this request.
 */
function getEffectiveTerms(terms, headers, request = {}) {
  // Get agent_type from request, header, or top-level terms
  const reqType =
    (request && request.agent_type) || headers['X-PEAC-Agent-Type'] || terms.agent_type;

  if (terms.agent_rules && Array.isArray(terms.agent_rules)) {
    const rule = terms.agent_rules.find((r) => r.agent_type === reqType);
    if (rule) {
      // Merge rule fields into the base terms (rule wins if duplicate)
      return { ...terms, ...rule };
    }
  }
  return { ...terms, agent_type: reqType }; // fallback
}

function checkAccess(terms, headers, request = {}) {
  const now = Date.now();

  // Use agent_rules if present
  const effectiveTerms = getEffectiveTerms(terms, headers, request);

  // Session expiry
  if (effectiveTerms.valid_until && Date.parse(effectiveTerms.valid_until) < now) {
    return { access: false, reason: 'session expired' };
  }

  if (effectiveTerms.expires_in && effectiveTerms.created_at) {
    const duration = parseDuration(effectiveTerms.expires_in);
    if (effectiveTerms.created_at + duration < now) {
      return { access: false, reason: 'session expired' };
    }
  }

  // Attribution (unified)
  if (!validateAttribution(headers, effectiveTerms)) {
    return { access: false, reason: 'attribution consent missing' };
  }

  // x402 fallback — now checks both agent_type and header
  if (
    effectiveTerms.agent_type === 'x402' ||
    headers['X-402-Payment-Required'] === true ||
    headers['X-402-Payment-Required'] === 'true'
  ) {
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
    effectiveTerms.metadata?.deal_id &&
    headers['X-PEAC-Deal-ID'] !== effectiveTerms.metadata.deal_id
  ) {
    return { access: false, reason: 'deal ID mismatch' };
  }

  // Tiered path
  if (!validateTiers(request, effectiveTerms)) {
    return { access: false, reason: 'tier access denied' };
  }

  return { access: true };
}

module.exports = { checkAccess };
