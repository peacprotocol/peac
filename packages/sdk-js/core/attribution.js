function validateAttribution(headers, terms) {
  if (!terms.attribution_required) return true;
  return headers['X-PEAC-Attribution-Consent'] === true || headers['X-PEAC-Attribution-Consent'] === 'true';
}

module.exports = { validateAttribution };