/**
 * PEAC Protocol Crypto
 * Ed25519 signatures for pact integrity
 */

const crypto = require('crypto');

class PEACCrypto {
  generateKeyPair() {
    return crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }

  signPact(pactData, privateKey) {
    const message = this.canonicalize(pactData.pact);
    const signature = crypto.sign(null, Buffer.from(message), privateKey);
    
    return {
      ...pactData,
      metadata: {
        ...pactData.metadata,
        signed_at: new Date().toISOString()
      },
      signature: signature.toString('hex')
    };
  }

  verifyPact(pactData, publicKey) {
    try {
      const { signature, ...dataWithoutSig } = pactData;
      const message = this.canonicalize(dataWithoutSig.pact);
      
      return crypto.verify(
        null,
        Buffer.from(message),
        publicKey,
        Buffer.from(signature, 'hex')
      );
    } catch {
      return false;
    }
  }

  canonicalize(obj) {
    // Simple JSON canonicalization
    return JSON.stringify(obj, Object.keys(obj).sort());
  }
}

module.exports = PEACCrypto;