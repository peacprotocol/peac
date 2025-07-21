const crypto = require('crypto');

function getTermsHash(terms) {
  const termsString = JSON.stringify(terms, Object.keys(terms).sort());
  return crypto.createHash('sha256').update(termsString).digest('hex');
}

module.exports = { getTermsHash };
