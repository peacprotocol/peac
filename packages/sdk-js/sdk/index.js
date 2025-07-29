/**
 * PEAC Protocol SDK
 * @version 0.9.1
 */

const PEACParser = require('./parser');
const PEACPayments = require('./payments');
const PEACCrypto = require('./crypto');

module.exports = {
  Parser: PEACParser,
  Payments: PEACPayments,
  Crypto: PEACCrypto,
  
  // Convenience methods
  async parse(domain) {
    const parser = new PEACParser();
    return parser.parse(domain);
  },
  
  async createPact(data) {
    const crypto = new PEACCrypto();
    return crypto.signPact(data);
  },
  
  version: '0.9.1'
};