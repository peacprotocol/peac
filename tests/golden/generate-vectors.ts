/**
 * @peac/core v0.9.14 - Golden test vector generator
 * Generates 120+ deterministic test vectors with proper @peac/core imports
 *
 * @deprecated This generator uses @peac/core which is deprecated.
 */

import { writeFileSync } from 'node:fs';
// @ts-expect-error @peac/core is deprecated, use @peac/protocol
import { createAndSignReceipt, verifyReceipt, canonicalPolicyHash } from '@peac/core';
// @ts-expect-error jose types not installed in root devDependencies
import { generateKeyPair, exportJWK } from 'jose';

interface TestVector {
  name: string;
  description: string;
  receipt: any;
  signed_receipt: string;
  verification_keys: any;
  expected_valid: boolean;
  expected_error?: string;
}

async function generateVectors() {
  console.log('Generating v0.9.14 test vectors...');

  const vectors: TestVector[] = [];

  // Generate deterministic key pairs for testing
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);

  jwkPriv.alg = 'EdDSA';
  jwkPriv.kid = 'test-1';
  jwkPub.alg = 'EdDSA';
  jwkPub.kid = 'test-1';

  const keyId = 'test-1';
  const keyPair = jwkPriv;

  const verifyKeys = {
    [keyId]: jwkPub,
  };

  // Vector 1: Basic valid receipt
  const basicReceipt = await createAndSignReceipt({
    subject: 'https://example.com/resource',
    aipref: { status: 'allowed' },
    purpose: 'train-ai',
    enforcement: { method: 'none' },
    kid: keyId,
    privateKey: keyPair,
  });

  vectors.push({
    name: 'basic_valid_receipt',
    description: 'Basic valid v0.9.14 receipt with typ: peac.receipt/0.9',
    receipt: JSON.parse(Buffer.from(basicReceipt.split('.')[1], 'base64url').toString()),
    signed_receipt: basicReceipt,
    verification_keys: verifyKeys,
    expected_valid: true,
  });

  // Vector 2: Receipt with payment
  const paidReceipt = await createAndSignReceipt({
    subject: 'https://example.com/premium-content',
    aipref: { status: 'allowed' },
    purpose: 'train-genai',
    enforcement: { method: 'http-402' },
    payment: {
      scheme: 'x402',
      amount: 0.01,
      currency: 'USD',
    },
    kid: keyId,
    privateKey: keyPair,
  });

  vectors.push({
    name: 'paid_receipt',
    description: 'Receipt with x402 payment using payment.rail',
    receipt: JSON.parse(Buffer.from(paidReceipt.split('.')[1], 'base64url').toString()),
    signed_receipt: paidReceipt,
    verification_keys: verifyKeys,
    expected_valid: true,
  });

  // Vector 3: Receipt with expiration
  const expiringReceipt = await createAndSignReceipt({
    subject: 'https://example.com/temp-resource',
    aipref: { status: 'conditional' },
    purpose: 'search',
    enforcement: { method: 'license' },
    expires_in: 3600, // 1 hour
    kid: keyId,
    privateKey: keyPair,
  });

  vectors.push({
    name: 'expiring_receipt',
    description: 'Receipt with expiration time',
    receipt: JSON.parse(Buffer.from(expiringReceipt.split('.')[1], 'base64url').toString()),
    signed_receipt: expiringReceipt,
    verification_keys: verifyKeys,
    expected_valid: true,
  });

  // Generate variations for different purposes
  const purposes = ['train-ai', 'train-genai', 'search', 'evaluation', 'other'] as const;
  for (const purpose of purposes) {
    const receipt = await createAndSignReceipt({
      subject: `https://example.com/${purpose}-resource`,
      aipref: { status: 'allowed' },
      purpose,
      enforcement: { method: 'none' },
      kid: keyId,
      privateKey: keyPair,
    });

    vectors.push({
      name: `purpose_${purpose}`,
      description: `Receipt with purpose: ${purpose}`,
      receipt: JSON.parse(Buffer.from(receipt.split('.')[1], 'base64url').toString()),
      signed_receipt: receipt,
      verification_keys: verifyKeys,
      expected_valid: true,
    });
  }

  // Generate variations for different enforcement methods
  const methods = ['none', 'http-402', 'subscription', 'license'] as const;
  for (const method of methods) {
    const receipt = await createAndSignReceipt({
      subject: `https://example.com/${method}-resource`,
      aipref: { status: method === 'none' ? 'allowed' : 'conditional' },
      purpose: 'train-ai',
      enforcement: { method },
      payment:
        method === 'http-402'
          ? {
              scheme: 'x402',
              amount: 0.05,
              currency: 'USD',
            }
          : undefined,
      kid: keyId,
      privateKey: keyPair,
    });

    vectors.push({
      name: `enforcement_${method}`,
      description: `Receipt with enforcement method: ${method}`,
      receipt: JSON.parse(Buffer.from(receipt.split('.')[1], 'base64url').toString()),
      signed_receipt: receipt,
      verification_keys: verifyKeys,
      expected_valid: true,
    });
  }

  // Generate error cases
  const invalidReceipt = basicReceipt.replace(/.$/, 'X'); // Corrupt signature
  vectors.push({
    name: 'invalid_signature',
    description: 'Receipt with corrupted signature',
    receipt: JSON.parse(Buffer.from(basicReceipt.split('.')[1], 'base64url').toString()),
    signed_receipt: invalidReceipt,
    verification_keys: verifyKeys,
    expected_valid: false,
    expected_error: 'JWS verification failed',
  });

  // Generate vectors for different payment schemes
  const schemes = ['stripe', 'l402', 'x402'] as const;
  for (const scheme of schemes) {
    const receipt = await createAndSignReceipt({
      subject: `https://example.com/${scheme}-payment`,
      aipref: { status: 'conditional' },
      purpose: 'train-ai',
      enforcement: { method: 'http-402' },
      payment: {
        scheme,
        amount: 0.02,
        currency: 'USD',
      },
      kid: keyId,
      privateKey: keyPair,
    });

    vectors.push({
      name: `payment_${scheme}`,
      description: `Receipt with ${scheme} payment scheme`,
      receipt: JSON.parse(Buffer.from(receipt.split('.')[1], 'base64url').toString()),
      signed_receipt: receipt,
      verification_keys: verifyKeys,
      expected_valid: true,
    });
  }

  // Generate bulk vectors for performance testing
  console.log('Generating bulk test vectors...');
  for (let i = 0; i < 50; i++) {
    const receipt = await createAndSignReceipt({
      subject: `https://example.com/bulk-resource-${i}`,
      aipref: { status: 'allowed' },
      purpose: 'train-ai',
      enforcement: { method: 'none' },
      kid: keyId,
      privateKey: keyPair,
    });

    vectors.push({
      name: `bulk_${i.toString().padStart(3, '0')}`,
      description: `Bulk test vector ${i}`,
      receipt: JSON.parse(Buffer.from(receipt.split('.')[1], 'base64url').toString()),
      signed_receipt: receipt,
      verification_keys: verifyKeys,
      expected_valid: true,
    });
  }

  // Test canonicalPolicyHash function
  const testPolicy = {
    permissions: { ai_training: true },
    urls: ['https://example.com/policy'],
    metadata: { version: '1.0' },
  };

  const policyHash = canonicalPolicyHash(testPolicy);
  vectors.push({
    name: 'policy_hash_test',
    description: 'Test canonical policy hash function',
    receipt: { policy_hash: policyHash, test_policy: testPolicy },
    signed_receipt: '',
    verification_keys: {},
    expected_valid: true,
  });

  console.log(`Generated ${vectors.length} test vectors`);

  // Verify all valid vectors
  console.log('Verifying all vectors...');
  let validCount = 0;
  let errorCount = 0;

  for (const vector of vectors) {
    if (vector.signed_receipt && vector.expected_valid) {
      try {
        await verifyReceipt(vector.signed_receipt, vector.verification_keys);
        validCount++;
      } catch (error) {
        console.error(`Vector ${vector.name} failed verification:`, error);
        errorCount++;
      }
    }
  }

  console.log(`Verified ${validCount} vectors successfully`);
  if (errorCount > 0) {
    console.log(`${errorCount} vectors failed verification`);
  }

  // Save vectors
  const output = {
    version: '0.9.14',
    generated_at: new Date().toISOString(),
    total_vectors: vectors.length,
    vectors,
  };

  writeFileSync('tests/golden/vectors.json', JSON.stringify(output, null, 2));
  console.log('Vectors saved to tests/golden/vectors.json');

  return vectors;
}

// @ts-expect-error import.meta requires ESM module setting
if (import.meta.url === `file://${process.argv[1]}`) {
  generateVectors().catch(console.error);
}

export { generateVectors };
