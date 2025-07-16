function validateAttribution(headers = {}, terms = {}) {
  const consent = headers['X-PEAC-Attribution-Consent'];
  const required = terms.attribution_required || terms.agent_type === 'research';
  return required ? consent === true : true;
}

module.exports = { validateAttribution };
