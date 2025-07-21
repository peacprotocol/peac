/**
 * PEAC Protocol v0.9.1
 * Ed25519 signature verifier (Node.js)
 * Uses libsodium-wrappers.
 * Apache 2.0 License
 */

const sodium = require('libsodium-wrappers');

async function verify(message, signatureBase64, publicKeyBase64, nonce, timestamp) {
  await sodium.ready;
  const publicKey = Buffer.from(publicKeyBase64, 'base64');
  const signature = Buffer.from(signatureBase64, 'base64');
  const combined = Buffer.concat([
    Buffer.from(message),
    Buffer.from(nonce),
    Buffer.from(String(timestamp))
  ]);
  return sodium.crypto_sign_verify_detached(signature, combined, publicKey);
}

module.exports = { verify };
