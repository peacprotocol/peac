/**
 * Cross-runtime crypto sanity test - prevents accidental export removal
 */
import { test } from 'node:test';
import assert from 'node:assert';

test('crypto helpers cross-runtime sanity', async () => {
  // Dynamic import to test actual exports
  const core = await import('./index.js');

  // Verify all crypto helpers are exported
  assert.ok(
    typeof core.generateEdDSAKeyPair === 'function',
    'generateEdDSAKeyPair must be exported'
  );
  assert.ok(typeof core.signDetached === 'function', 'signDetached must be exported');
  assert.ok(typeof core.verifyDetached === 'function', 'verifyDetached must be exported');
  assert.ok(typeof core.validateKidFormat === 'function', 'validateKidFormat must be exported');

  // Test the full flow: generate → sign → verify
  const { privateKey, publicKey, kid } = await core.generateEdDSAKeyPair();
  assert.ok(core.validateKidFormat(kid), 'Generated kid should be valid');

  const payload = 'cross-runtime-test';
  const jws = await core.signDetached(payload, privateKey, kid);
  const verified = await core.verifyDetached(payload, jws, publicKey);

  assert.strictEqual(verified, true, 'Cross-runtime crypto flow must work');
});
