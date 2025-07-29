/**
 * PEAC Protocol v0.9.1
 * Ed25519 message signer (Node.js)
 * Uses libsodium-wrappers for Ed25519 signatures.
 * Apache 2.0 License
 */

const sodium = require('libsodium-wrappers');

async function sign(message, privateKeyBase64, nonce, timestamp) {
  await sodium.ready;
  const privateKey = Buffer.from(privateKeyBase64, 'base64');
  // Combine message, nonce, timestamp for replay protection
  const combined = Buffer.concat([
    Buffer.from(message),
    Buffer.from(nonce),
    Buffer.from(String(timestamp))
  ]);
  const signature = sodium.crypto_sign_detached(combined, privateKey);
  return Buffer.from(signature).toString('base64');
}

module.exports = { sign };
