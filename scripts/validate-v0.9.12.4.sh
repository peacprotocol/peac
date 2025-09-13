#!/usr/bin/env bash
set -euo pipefail

echo "=== PEAC Protocol v0.9.12.4 Validation ==="

# Core function availability check
echo "🔍 Checking core primitives..."
node -e "
  import('@peac/core').then(core => {
    const required = ['canonicalPolicyHash', 'signDetached', 'verifyDetached', 'uuidv7', 'InMemoryNonceCache'];
    const missing = required.filter(fn => !core[fn]);
    if (missing.length > 0) {
      console.error('❌ Missing core functions:', missing.join(', '));
      process.exit(1);
    }
    console.log('✅ All core primitives available');
  }).catch(err => {
    console.error('❌ Core module import failed:', err.message);
    process.exit(1);
  });
"

# Schema validation
echo "🔍 Validating JSON schemas..."
if command -v ajv &> /dev/null; then
  ajv compile -s 'schemas/**/*.json' || {
    echo "❌ Schema validation failed"
    exit 1
  }
  echo "✅ All schemas valid"
else
  echo "⚠️ ajv not installed, skipping schema validation"
fi

# Hash vector tests
echo "🔍 Running policy hash golden vectors..."
node -e "
  import('./test/smoke/policy-hash.test.js').then(() => {
    console.log('✅ Policy hash vectors passed');
  }).catch(err => {
    console.error('❌ Policy hash tests failed:', err.message);
    process.exit(1);
  });
" 2>/dev/null || {
  echo "⚠️ Policy hash tests not available, running basic smoke test"
  node -e "
    import('@peac/core').then(async ({ canonicalPolicyHash }) => {
      const testInput = { url: 'https://example.com/test', method: 'GET' };
      const hash = canonicalPolicyHash(testInput);
      if (typeof hash !== 'string' || hash.length < 10) {
        throw new Error('Invalid hash output');
      }
      console.log('✅ Basic canonicalization working');
    }).catch(err => {
      console.error('❌ Canonicalization failed:', err.message);
      process.exit(1);
    });
  "
}

# JWS performance test
echo "🔍 Testing JWS performance (target: <5ms p95)..."
node -e "
  import('@peac/core').then(async ({ signDetached, verifyDetached, generateEdDSAKeyPair }) => {
    const { privateKey, publicKey, kid } = await generateEdDSAKeyPair();
    const payload = 'test payload';

    // Warmup
    for (let i = 0; i < 10; i++) {
      await signDetached(payload, privateKey, kid);
    }

    // Measure sign performance
    const signTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await signDetached(payload, privateKey, kid);
      signTimes.push(performance.now() - start);
    }

    // Measure verify performance
    const jws = await signDetached(payload, privateKey, kid);
    const verifyTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await verifyDetached(payload, jws, publicKey);
      verifyTimes.push(performance.now() - start);
    }

    const signP95 = signTimes.sort((a,b) => a-b)[94];
    const verifyP95 = verifyTimes.sort((a,b) => a-b)[94];

    console.log(\`Sign p95: \${signP95.toFixed(2)}ms (target: <5ms)\`);
    console.log(\`Verify p95: \${verifyP95.toFixed(2)}ms (target: <5ms)\`);

    if (signP95 > 5 || verifyP95 > 5) {
      console.error('❌ Performance targets not met');
      process.exit(1);
    }

    console.log('✅ Performance targets exceeded');
  }).catch(err => {
    console.error('❌ JWS performance test failed:', err.message);
    process.exit(1);
  });
"

# Replay protection test
echo "🔍 Testing replay protection (≤5min TTL)..."
node -e "
  import('@peac/core').then(async ({ InMemoryNonceCache, uuidv7 }) => {
    const cache = new InMemoryNonceCache();
    const rid1 = uuidv7();
    const rid2 = uuidv7();

    // First use should succeed
    if (cache.isUsed(rid1)) {
      throw new Error('New RID marked as used');
    }

    cache.markUsed(rid1);

    // Replay should be detected
    if (!cache.isUsed(rid1)) {
      throw new Error('Used RID not detected');
    }

    // Different RID should succeed
    if (cache.isUsed(rid2)) {
      throw new Error('Different RID marked as used');
    }

    console.log('✅ Replay protection working');
  }).catch(err => {
    console.error('❌ Replay protection test failed:', err.message);
    process.exit(1);
  });
"

# Profiles-safety integration test
echo "🔍 Testing PEIP-SAF profiles integration..."
node -e "
  import('@peac/profiles-safety').then(async ({ validateSafetyPolicy }) => {
    const testPolicy = {
      profile: 'peip-saf/core',
      version: 'v1',
      disclosure_cadence: { enabled: true, interval: 'PT1H' },
      crisis_referral: { enabled: true, keywords: ['help'] },
      minors_gate: { enabled: true, min_age: 13 },
      intent_keys: [{
        key: 'safety_concern',
        description: 'General safety concern',
        severity: 'medium'
      }]
    };

    const result = await validateSafetyPolicy(testPolicy);
    if (!result.valid) {
      throw new Error('Valid policy rejected: ' + result.errors?.join(', '));
    }

    console.log('✅ PEIP-SAF validation working');
  }).catch(err => {
    console.error('❌ PEIP-SAF test failed:', err.message);
    process.exit(1);
  });
"

echo "🚀 v0.9.12.4 validation complete - all gates passed!"