/**
 * PEAC Protocol SDK v0.9.6
 * Universal Digital Pacts for the Automated Economy - Agreement-First API
 * @license Apache-2.0
 */

const PEACClient = require('./client');
const PEACParser = require('./parser');
const UniversalParser = require('./universal-parser');
const PEACPayments = require('./payments');
const PEACCrypto = require('./crypto');
const PEACNegotiation = require('./negotiation');

module.exports = {
  // Agreement-First Client (v0.9.6)
  Client: PEACClient,
  
  // Legacy classes (for backward compatibility)
  Parser: PEACParser,
  UniversalParser,
  Payments: PEACPayments,
  Crypto: PEACCrypto,
  Negotiation: PEACNegotiation,

  // Convenience methods (updated for agreement-first)
  async createClient(options = {}) {
    return new PEACClient(options);
  },

  async createAgreement(baseURL, proposal, options = {}) {
    const client = new PEACClient({ baseURL, ...options });
    return client.createAgreement(proposal);
  },

  async parse(domain, options = {}) {
    const parser = new UniversalParser(options);
    return parser.parseAll(domain);
  },

  async createPeac(data) {
    const crypto = new PEACCrypto();
    return crypto.signPeac(data);
  },

  // Deprecated: negotiate (with warning)
  async negotiate(domain, proposal) {
    console.warn('⚠️  SDK.negotiate() is deprecated. Use SDK.createAgreement() or new SDK.Client() instead.');
    const parser = new UniversalParser();
    const peac = await parser.parseAll(domain);
    const negotiation = new PEACNegotiation(peac);
    return negotiation.negotiate(proposal);
  },

  // Metadata
  version: '0.9.6',
  schema: 'https://peacprotocol.org/schema/v0.9.6',
  protocolVersion: '0.9.6',
};
