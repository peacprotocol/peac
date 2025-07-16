function validateTiers(request, terms) {
  if (terms.tiers && Array.isArray(terms.tiers) && request.path) {
    for (const tier of terms.tiers) {
      const paths = tier.allowed_paths || [];
      if (paths.some(p => new RegExp(p.replace('*', '.*')).test(request.path))) {
        return true;
      }
    }
    return false;
  }
  return true;
}

module.exports = { validateTiers };
