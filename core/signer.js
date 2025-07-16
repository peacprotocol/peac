const ethSigUtil = require('@metamask/eth-sig-util');
const { bufferToHex } = require('ethereumjs-util');

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
 * Signs an EIP-712 AccessRequest using a private key.
 */
function signRequest(request, privateKey) {
  const normalizedRequest = {
    ...request,
    agent_id: request.agent_id.toLowerCase(),
  };

  const data = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...types,
    },
    domain,
    primaryType: 'AccessRequest',
    message: normalizedRequest,
  };

  return ethSigUtil.signTypedData({
    privateKey: Buffer.from(privateKey.slice(2), 'hex'),
    data,
    version: 'V4',
  });
}

/**
 * Verifies EIP-712 signature.
 */
function verifySignature(request, signature) {
  try {
    const normalizedRequest = {
      ...request,
      agent_id: request.agent_id.toLowerCase(),
    };

    const data = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        ...types,
      },
      domain,
      primaryType: 'AccessRequest',
      message: normalizedRequest,
    };

    const recovered = ethSigUtil.recoverTypedSignature({
      data,
      signature,
      version: 'V4',
    });

    return recovered.toLowerCase() === normalizedRequest.agent_id;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
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
