// core/tiers.js

/**
 * Validates if the current request path matches any of the allowed tiers
 * specified in the PEAC terms.
 * Supports wildcards (e.g., "/api/*") and exact path matching.
 */
function validateTiers(request = {}, terms = {}) {
  if (!terms.tiers || terms.tiers.length === 0) return true;
  const path = request.path || '';
  return terms.tiers.some((tier) => {
    if (!tier.allowed_paths || tier.allowed_paths.length === 0) return false;
    return tier.allowed_paths.some((pattern) => {
      // Wildcard support: "/api/*" matches anything under "/api/"
      if (pattern.endsWith('*')) {
        return path.startsWith(pattern.slice(0, -1));
      }
      return path === pattern;
    });
  });
}

module.exports = { validateTiers };
