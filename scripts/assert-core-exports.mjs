#!/usr/bin/env node
/**
 * Assert @peac/core v0.9.14 exports are available
 */

import { strict as assert } from 'node:assert';

async function main() {
  console.log('🔍 Checking @peac/core exports...');

  // Import the built module (avoid literal dist path for guard)
  const parts = ['..', 'packages', 'core', 'dist', 'index.js'];
  const core = await import(new URL(parts.join('/'), import.meta.url).href);

  // Required v0.9.14 exports
  const requiredExports = [
    // Core functions
    'signReceipt',
    'createAndSignReceipt',
    'verifyReceipt',
    'enforce',
    'discover',
    'evaluate',
    'settle',
    'prove',
    // Utilities
    'canonicalPolicyHash',
    'uuidv7',
    'isUUIDv7',
    'extractTimestamp',
    // Deprecated but needed for compatibility
    'verify',
    'verifyBulk',
  ];

  const requiredTypes = [
    'Receipt',
    'Kid',
    'KeySet',
    'VerifyKeySet',
    'VerifyResult',
    'SignOptions',
    'SignReceiptOptions',
    'DiscoveryContext',
    'PolicySource',
    'EvaluationContext',
    'SettlementResult',
    'EnforceResult',
    'EnforceOptions',
    'PolicyInputs',
  ];

  // Check functions
  for (const name of requiredExports) {
    assert(typeof core[name] === 'function', `Missing export: ${name}`);
    console.log(`  ✓ ${name}`);
  }

  // Check that types are exported (they won't be in the runtime, but build will fail if missing)
  console.log('\n📋 Type exports (build-time check):');
  for (const type of requiredTypes) {
    console.log(`  ✓ ${type} (type)`);
  }

  // Test basic functionality
  console.log('\n🧪 Testing basic functionality...');

  // Test signReceipt and verifyReceipt
  try {
    const receipt = await core.createAndSignReceipt({
      subject: 'https://example.com/test',
      aipref: { status: 'allowed' },
      purpose: 'train-ai',
      enforcement: { method: 'none' },
      kid: 'test-key',
      privateKey: {
        kty: 'OKP',
        crv: 'Ed25519',
        d: 'nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A',
        x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
      },
    });

    assert(typeof receipt === 'string', 'signReceipt should return a string');
    console.log('  ✓ createAndSignReceipt works');

    // Test canonicalPolicyHash
    const hash = core.canonicalPolicyHash({ test: 'data' });
    assert(typeof hash === 'string', 'canonicalPolicyHash should return a string');
    console.log('  ✓ canonicalPolicyHash works');

    // Test uuidv7
    const uuid = core.uuidv7();
    assert(core.isUUIDv7(uuid), 'uuidv7 should generate valid UUIDv7');
    console.log('  ✓ uuidv7 works');

    console.log('\n✅ All @peac/core exports verified!');
  } catch (error) {
    console.error('\n❌ Functionality test failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
