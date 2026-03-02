/**
 * Generate deterministic Ed25519 JWK x values for conformance fixtures.
 */
import { generateKeypairFromSeed } from '../packages/crypto/src/testkit';
import { base64urlEncode } from '../packages/crypto/src/base64url';

async function main() {
  const seeds = [
    'key-2026-01-rotation-fixture-s1',
    'key-2026-02-rotation-fixture-s2',
    'key-emergency-replacement-se03',
    'key-reused-kid-second-materi04',
  ];

  for (const s of seeds) {
    const seed = new Uint8Array(32);
    const enc = new TextEncoder().encode(s);
    seed.set(enc.slice(0, 32));
    const { publicKey } = await generateKeypairFromSeed(seed);
    console.log(`${s} => ${base64urlEncode(publicKey)}`);
  }
}

main();
