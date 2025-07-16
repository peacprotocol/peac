const { ethers } = require('ethers');
const { getTermsHash } = require('./hash');

// EIP-712 domain and types used for PEAC v0.9
const domain = {
  name: 'PEAC',
  version: '0.9',
  chainId: 1,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

const types = {
  AccessRequest: [
    { name: 'agent_id', type: 'address' },
    { name: 'user_id', type: 'string' },
    { name: 'agent_type', type: 'string' },
  ],
};

/**
 * Signs an EIP-712 structured AccessRequest object using a private key.
 * @param {Object} request - The access request (agent_id, user_id, agent_type)
 * @param {string} privateKey - The EVM private key
 * @returns {Promise<string>} - The EIP-712 signature string
 */
function signRequest(request, privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.signTypedData(domain, types, request);
}

/**
 * Verifies an EIP-712 signature against a request object.
 * @param {Object} request - The same structured object that was signed
 * @param {string} signature - The signature string to verify
 * @returns {boolean} - True if valid and from matching agent_id
 */
function verifySignature(request, signature) {
  try {
    const recovered = ethers.utils.verifyTypedData(domain, types, request, signature);
    return recovered.toLowerCase() === request.agent_id.toLowerCase();
  } catch (err) {
    const isJest = typeof process.env.JEST_WORKER_ID !== 'undefined';
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev && !isJest) {
      console.warn('Invalid signature:', err.message || err);
    }
    return false;
  }
}

module.exports = {
  signRequest,
  verifySignature,
  domain,
  types,
};
