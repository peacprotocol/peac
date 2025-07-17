function validateAttribution(headers = {}, terms = {}) {
  // Accept both string and boolean "true"
  const consent = headers['X-PEAC-Attribution-Consent'];
  const required = terms.attribution_required || terms.agent_type === 'research';
  return required ? (consent === true || consent === 'true') : true;
}

module.exports = { validateAttribution };