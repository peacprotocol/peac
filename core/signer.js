const { ethers } = require('ethers');

async function signRequest(request, privateKey) {
  const domain = {
    name: 'PEAC Protocol',
    version: '0.9',
    chainId: 1,
    verifyingContract: '0x0000000000000000000000000000000000000000'
  };

  const types = {
    Request: [
      { name: 'agent_id', type: 'string' },
      { name: 'user_id', type: 'string' },
      { name: 'agent_type', type: 'string' }
    ]
  };

  const signer = new ethers.Wallet(privateKey);
  return await signer.signTypedData(domain, types, request);
}

module.exports = { signRequest };
