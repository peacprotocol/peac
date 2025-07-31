/**
 * PEAC Protocol Crypto
 * Ed25519 signatures with key rotation support
 * @license Apache-2.0
 */

const crypto = require('crypto');
const fs = require('fs').promises;

class PEACCrypto {
  constructor(options = {}) {
    this.options = options;
    this.keyCache = new Map();
  }

  generateKeyPair(options = {}) {
    const keyPair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: options.passphrase ? 'aes-256-cbc' : undefined,
        passphrase: options.passphrase
      }
    });

    // Add metadata
    return {
      ...keyPair,
      generated: new Date().toISOString(),
      algorithm: 'ed25519',
      keyId: this.generateKeyId()
    };
  }

  generateKeyId() {
    return crypto.randomBytes(16).toString('hex');
  }

  async signPeac(peacData, privateKey, options = {}) {
    try {
      // Prepare data for signing
      const dataToSign = {
        ...peacData,
        metadata: {
          ...peacData.metadata,
          signed_at: new Date().toISOString(),
          key_id: options.keyId || this.generateKeyId()
        }
      };

      // Canonicalize peac section
      const message = this.canonicalize(dataToSign.peac);
      
      // Sign
      const signature = crypto.sign(null, Buffer.from(message), privateKey);
      
      // Return signed peac
      return {
        ...dataToSign,
        signature: signature.toString('hex'),
        signature_algorithm: 'ed25519'
      };
    } catch (error) {
      throw new Error(`Failed to sign peac: ${error.message}`);
    }
  }

  async verifyPeac(peacData, publicKey) {
    try {
      const { signature, signature_algorithm, ...dataWithoutSig } = peacData;
      
      // Check algorithm
      if (signature_algorithm && signature_algorithm !== 'ed25519') {
        throw new Error(`Unsupported signature algorithm: ${signature_algorithm}`);
      }
      
      // Canonicalize peac section
      const message = this.canonicalize(dataWithoutSig.peac);
      
      // Verify
      return crypto.verify(
        null,
        Buffer.from(message),
        publicKey,
        Buffer.from(signature, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  canonicalize(obj) {
    // Deterministic JSON serialization
    return JSON.stringify(this.sortObject(obj));
  }

  sortObject(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }
    
    const sorted = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.sortObject(obj[key]);
    }
    
    return sorted;
  }

  // Key rotation support
  async rotateKeys(currentPrivateKey, options = {}) {
    // Generate new key pair
    const newKeyPair = this.generateKeyPair(options);
    
    // Create rotation record
    const rotation = {
      old_key_id: options.currentKeyId,
      new_key_id: newKeyPair.keyId,
      rotated_at: new Date().toISOString(),
      algorithm: 'ed25519'
    };
    
    // Sign rotation with old key
    const rotationSignature = crypto.sign(
      null,
      Buffer.from(JSON.stringify(rotation)),
      currentPrivateKey
    );
    
    rotation.signature = rotationSignature.toString('hex');
    
    return {
      keyPair: newKeyPair,
      rotation
    };
  }

  // Load key from file with caching
  async loadKey(keyPath, passphrase) {
    const cacheKey = `${keyPath}:${passphrase || 'no-pass'}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey);
    }
    
    try {
      const keyData = await fs.readFile(keyPath, 'utf8');
      this.keyCache.set(cacheKey, keyData);
      return keyData;
    } catch (error) {
      throw new Error(`Failed to load key from ${keyPath}: ${error.message}`);
    }
  }

  // Generate a challenge for mutual authentication
  generateChallenge() {
    return {
      challenge: crypto.randomBytes(32).toString('hex'),
      timestamp: new Date().toISOString(),
      expires: new Date(Date.now() + 300000).toISOString() // 5 minutes
    };
  }

  // Verify a challenge response
  verifyChallenge(challenge, response, publicKey) {
    // Check expiration
    if (new Date(challenge.expires) < new Date()) {
      return false;
    }
    
    try {
      const message = `${challenge.challenge}:${challenge.timestamp}`;
      return crypto.verify(
        null,
        Buffer.from(message),
        publicKey,
        Buffer.from(response, 'hex')
      );
    } catch {
      return false;
    }
  }
}

module.exports = PEACCrypto;