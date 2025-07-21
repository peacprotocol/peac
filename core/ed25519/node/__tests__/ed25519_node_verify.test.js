/**
 * PEAC Protocol v0.9.1
 * Ed25519 verify() unit tests (Node.js)
 * Apache 2.0 License
 */

const { sign } = require('../sign');
const { verify } = require('../verify');
const sodium = require('libsodium-wrappers');

describe('Ed25519 verify()', () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  it('should verify a valid signature', async () => {
    const keypair = sodium.crypto_sign_keypair();
    const message = "hello-peac";
    const nonce = "abc123";
    const timestamp = Date.now();
    const privKeyB64 = Buffer.from(keypair.privateKey).toString('base64');
    const pubKeyB64 = Buffer.from(keypair.publicKey).toString('base64');

    const signature = await sign(message, privKeyB64, nonce, timestamp);

    const valid = await verify(message, signature, pubKeyB64, nonce, timestamp);
    expect(valid).toBe(true);
  });

  it('should reject an invalid signature', async () => {
    const keypair = sodium.crypto_sign_keypair();
    const message = "hello-peac";
    const nonce = "abc123";
    const timestamp = Date.now();
    const privKeyB64 = Buffer.from(keypair.privateKey).toString('base64');
    const pubKeyB64 = Buffer.from(keypair.publicKey).toString('base64');

    const signature = await sign(message, privKeyB64, nonce, timestamp);

    const valid = await verify("tampered", signature, pubKeyB64, nonce, timestamp);
    expect(valid).toBe(false);
  });
});
