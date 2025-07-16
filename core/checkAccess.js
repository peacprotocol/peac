const { validateAttribution } = require('./attribution');
const { validateTiers } = require('./tiers');

function checkAccess(terms, headers = {}, context = {}) {
  const now = Date.now();

  if (terms.valid_until && new Date(terms.valid_until).getTime() < now)
    return { access: false, reason: 'session expired' };

  if (terms.expires_in && terms.created_at && (terms.created_at + parseDuration(terms.expires_in)) < now)
    return { access: false, reason: 'session expired' };

  if (!validateAttribution(headers, terms))
    return { access: false, reason: 'attribution required' };

  if (!validateTiers(context, terms))
    return { access: false, reason: 'unauthorized path' };

  return { access: true };
}

function parseDuration(str) {
  const match = str.match(/^([0-9]+)([smhd])$/);
  if (!match) return 0;
  const [ , value, unit ] = match;
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit] || 0;
  return parseInt(value) * multiplier * 1000;
}

module.exports = { checkAccess };