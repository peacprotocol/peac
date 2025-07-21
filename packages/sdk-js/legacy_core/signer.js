const ethSigUtil = require('@metamask/eth-sig-util');

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

function signRequest(request, privateKey) {
  const normalized = {
    agent_id: request.agent_id,
    user_id: request.user_id,
    agent_type: request.agent_type,
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
    message: normalized,
  };

  return ethSigUtil.signTypedData({
    privateKey: Buffer.from(privateKey.replace(/^0x/, ''), 'hex'),
    data,
    version: 'V4',
  });
}

function verifySignature(request, signature) {
  try {
    const normalized = {
      agent_id: request.agent_id,
      user_id: request.user_id,
      agent_type: request.agent_type,
    };

    const data = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        AccessRequest: [
          { name: 'agent_id', type: 'address' },
          { name: 'user_id', type: 'string' },
          { name: 'agent_type', type: 'string' },
        ],
      },
      domain: {
        name: 'PEAC',
        version: '0.9',
        chainId: 1,
        verifyingContract: '0x0000000000000000000000000000000000000000',
      },
      primaryType: 'AccessRequest',
      message: normalized,
    };

    const recovered = ethSigUtil.recoverTypedSignature({
      data,
      signature,
      version: 'V4',
    });

    return recovered.toLowerCase() === normalized.agent_id.toLowerCase();
  } catch (err) {
    return false;
  }
}

module.exports = {
  signRequest,
  verifySignature,
};
