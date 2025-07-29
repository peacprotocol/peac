// core/attribution.js

/**
 * Checks if attribution consent is present and valid.
 * Accepts both string and boolean 'true'. Enforces for research agents or if attribution_required is true.
 * Returns true if consent is valid or not required, false otherwise.
 */
function validateAttribution(headers = {}, terms = {}) {
  const consent = headers['X-PEAC-Attribution-Consent'];
  const required = terms.attribution_required || terms.agent_type === 'research';
  return required ? consent === true || consent === 'true' : true;
}

module.exports = { validateAttribution };
