function validateAttribution(headers = {}, terms = {}) {
  const consent = headers['X-PEAC-Attribution-Consent'];
  if (terms.attribution_required || terms.agent_type === 'research') {
    return consent === 'true' || consent === true;
  }
  return true;
}

module.exports = { validateAttribution };
