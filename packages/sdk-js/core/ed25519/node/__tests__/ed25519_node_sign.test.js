/**
 * PEAC Protocol v0.9.1
 * Ed25519 sign() unit tests (Node.js)
 * Apache 2.0 License
 */

const { sign } = require('../sign');
const sodium = require('libsodium-wrappers');

describe('Ed25519 sign()', () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  it('should sign a message and produce a base64 signature', async () => {
    const keypair = sodium.crypto_sign_keypair();
    const message = "test-message";
    const nonce = "nonce-123";
    const timestamp = Date.now();
    const privKeyB64 = Buffer.from(keypair.privateKey).toString('base64');
    const signature = await sign(message, privKeyB64, nonce, timestamp);

    expect(typeof signature).toBe('string');
    expect(Buffer.from(signature, 'base64').length).toBe(64);
  });
});
