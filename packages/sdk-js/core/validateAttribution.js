function validateAttribution(headers = {}, terms = {}) {
  if (terms.agent_type === 'research') {
    return headers['X-PEAC-Attribution-Consent'] === 'true';
  }
  return true;
}

module.exports = { validateAttribution };
