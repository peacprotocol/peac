/**
 * PEAC Protocol SDK v0.9.2
 * Universal Digital Pacts for the Automated Economy
 * @license Apache-2.0
 */

const PEACParser = require("./parser");
const UniversalParser = require("./universal-parser");
const PEACPayments = require("./payments");
const PEACCrypto = require("./crypto");
const PEACNegotiation = require("./negotiation");

module.exports = {
  // Classes
  Parser: PEACParser,
  UniversalParser,
  Payments: PEACPayments,
  Crypto: PEACCrypto,
  Negotiation: PEACNegotiation,

  // Convenience methods
  async parse(domain, options = {}) {
    const parser = new UniversalParser(options);
    return parser.parseAll(domain);
  },

  async createPeac(data) {
    const crypto = new PEACCrypto();
    return crypto.signPeac(data);
  },

  async negotiate(domain, proposal) {
    const parser = new UniversalParser();
    const peac = await parser.parseAll(domain);
    const negotiation = new PEACNegotiation(peac);
    return negotiation.negotiate(proposal);
  },

  // Metadata
  version: "0.9.2",
  schema: "https://peacprotocol.org/schema/v0.9.2",
};
