const { fetchPricing } = require('./fetchPricing'); // if extracted
const { checkAccess } = require('./checkAccess');   // if extracted
const { handlePayment, handlePaymentReal } = require('./paymentHandlers'); // if extracted
const { signRequest } = require('./signer');
const { getTermsHash } = require('./hash');
const { validateAttribution } = require('./attribution');  // if extracted
const { validateTiers } = require('./tiers');

module.exports = {
  fetchPricing,
  checkAccess,
  handlePayment,
  handlePaymentReal,
  signRequest,
  getTermsHash,
  validateAttribution,
  validateTiers
};
