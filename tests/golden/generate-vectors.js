// SPDX-License-Identifier: Apache-2.0
import { writeFileSync, mkdirSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { canonicalize } from 'json-canonicalize';

const OUTPUT_DIR = './tests/golden/receipt-vectors';

// Test keys (deterministic)
const TEST_PRIVATE_KEY = new Uint8Array(32).fill(0x42);
const TEST_KID = 'test-key-golden';

// Generate 100+ test vectors
async function generateVectors() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const vectors = [];
  let id = 0;

  // Valid JSON receipts (20)
  for (let i = 0; i < 20; i++) {
    vectors.push(generateValidJsonVector(id++, i));
  }

  // Valid binary content (20)
  for (let i = 0; i < 20; i++) {
    vectors.push(generateValidBinaryVector(id++, i));
  }

  // Invalid signatures (10)
  for (let i = 0; i < 10; i++) {
    vectors.push(generateInvalidSigVector(id++, i));
  }

  // Expired receipts (10)
  for (let i = 0; i < 10; i++) {
    vectors.push(generateExpiredVector(id++, i));
  }

  // Malformed JWS (10)
  for (let i = 0; i < 10; i++) {
    vectors.push(generateMalformedVector(id++, i));
  }

  // Edge cases (30)
  for (let i = 0; i < 30; i++) {
    vectors.push(generateEdgeCaseVector(id++, i));
  }

  // Write vectors
  for (const vector of vectors) {
    const filename = `${vector.id.toString().padStart(3, '0')}-${vector.name}.json`;
    writeFileSync(`${OUTPUT_DIR}/${filename}`, JSON.stringify(vector, null, 2));
  }

  // Write JWKS for verification
  const jwks = {
    keys: [{
      kty: 'OKP',
      crv: 'Ed25519',
      kid: TEST_KID,
      x: Buffer.from(TEST_PRIVATE_KEY).toString('base64url') // Mock public key
    }]
  };
  writeFileSync(`${OUTPUT_DIR}/jwks.json`, JSON.stringify(jwks, null, 2));

  console.log(`Generated ${vectors.length} test vectors`);
}

function generateValidJsonVector(id, variant) {
  const now = Math.floor(Date.now() / 1000);
  const body = { test: variant, data: 'x'.repeat(100 * (variant + 1)) };
  const bodyHash = createHash('sha256').update(canonicalize(body)).digest();

  const payload = {
    typ: 'peac.receipt/0.9',
    iss: 'https://test.peacprotocol.org',
    sub: `urn:resource:sha256:${Buffer.from(bodyHash).toString('base64url')}`,
    iat: now - (variant * 10), // Vary timestamps
    exp: now + 300,
    jti: generateMockUUIDv7(variant),
    policy: {
      aipref: {
        href: 'https://test.peacprotocol.org/policy.json',
        hash: 'sha256:' + Buffer.from(randomBytes(32)).toString('base64url')
      },
      merged_hash: 'sha256:' + Buffer.from(randomBytes(32)).toString('base64url')
    },
    resource: {
      url: `https://test.peacprotocol.org/resource/${variant}`,
      method: 'GET',
      hash: `sha256:${Buffer.from(bodyHash).toString('base64url')}`
    }
  };

  const jws = createMockJWS(payload, TEST_KID);

  return {
    id,
    name: `valid-json-${variant}`,
    valid: true,
    jws,
    payload,
    body,
    expected: {
      verified: true,
      typ: 'peac.receipt/0.9',
      resource_hash: Buffer.from(bodyHash).toString('base64url')
    }
  };
}

function generateValidBinaryVector(id, variant) {
  const binaryData = Buffer.concat([
    Buffer.from('BINARY'),
    randomBytes(variant * 10 + 50)
  ]);
  const bodyHash = createHash('sha256').update(binaryData).digest();

  const payload = {
    typ: 'peac.receipt/0.9',
    iss: 'https://binary.test.com',
    sub: `urn:resource:sha256:${Buffer.from(bodyHash).toString('base64url')}`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    jti: generateMockUUIDv7(variant + 1000),
    policy: {
      aipref: { href: 'https://binary.test.com/policy.json', hash: 'sha256:test' },
      merged_hash: 'sha256:merged'
    },
    resource: {
      url: `https://binary.test.com/file${variant}.bin`,
      method: 'GET',
      hash: `sha256:${Buffer.from(bodyHash).toString('base64url')}`
    }
  };

  return {
    id,
    name: `valid-binary-${variant}`,
    valid: true,
    jws: createMockJWS(payload, TEST_KID),
    payload,
    body: binaryData.toString('base64'),
    bodyType: 'binary',
    expected: { verified: true }
  };
}

function generateInvalidSigVector(id, variant) {
  const payload = {
    typ: 'peac.receipt/0.9',
    iss: 'https://test.com',
    sub: 'urn:resource:sha256:invalid',
    iat: Math.floor(Date.now() / 1000),
    jti: generateMockUUIDv7(variant + 2000)
  };

  // Create JWS with corrupted signature
  const validJWS = createMockJWS(payload, TEST_KID);
  const [header, payloadPart, signature] = validJWS.split('.');
  const corruptedSig = signature.slice(0, -5) + 'XXXXX';

  return {
    id,
    name: `invalid-sig-${variant}`,
    valid: false,
    jws: `${header}.${payloadPart}.${corruptedSig}`,
    payload,
    expected: { error: 'invalid-signature' }
  };
}

function generateExpiredVector(id, variant) {
  const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

  const payload = {
    typ: 'peac.receipt/0.9',
    iss: 'https://expired.test.com',
    sub: 'urn:resource:sha256:expired',
    iat: pastTime,
    exp: pastTime + 60, // Expired
    jti: generateMockUUIDv7(variant + 3000),
    policy: { aipref: { href: 'https://test.com/policy.json', hash: 'sha256:test' }, merged_hash: 'sha256:merged' },
    resource: { url: 'https://test.com/expired', method: 'GET', hash: 'sha256:test' }
  };

  return {
    id,
    name: `expired-${variant}`,
    valid: false,
    jws: createMockJWS(payload, TEST_KID),
    payload,
    expected: { error: 'expired-receipt' }
  };
}

function generateMalformedVector(id, variant) {
  const malformedJWS = [
    'not.a.jws',
    'header.only',
    '..empty.parts',
    'invalid!!!base64.payload.signature',
    'header.payload' // Missing signature
  ];

  return {
    id,
    name: `malformed-${variant}`,
    valid: false,
    jws: malformedJWS[variant % malformedJWS.length] || 'invalid',
    expected: { error: 'invalid-jws-format' }
  };
}

function generateEdgeCaseVector(id, variant) {
  // Various edge cases
  const cases = [
    () => ({ typ: 'wrong.type/0.9', iss: 'https://test.com' }),
    () => ({ typ: 'peac.receipt/0.9', jti: 'not-uuidv7' }),
    () => ({ typ: 'peac.receipt/0.9', iat: 'not-number' }),
    () => ({ typ: 'peac.receipt/0.9', resource: { hash: 'no-sha256-prefix' } })
  ];

  const caseGen = cases[variant % cases.length];
  const payload = {
    typ: 'peac.receipt/0.9',
    iss: 'https://edge.test.com',
    sub: 'urn:resource:sha256:edge',
    iat: Math.floor(Date.now() / 1000),
    jti: generateMockUUIDv7(variant + 4000),
    ...caseGen()
  };

  return {
    id,
    name: `edge-case-${variant}`,
    valid: false,
    jws: createMockJWS(payload, TEST_KID),
    payload,
    expected: { error: 'schema-validation-failed' }
  };
}

function createMockJWS(payload, kid) {
  const header = { alg: 'EdDSA', typ: 'JWT', kid };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(canonicalize(payload)).toString('base64url');
  const signature = Buffer.from(randomBytes(64)).toString('base64url'); // Mock signature

  return `${headerB64}.${payloadB64}.${signature}`;
}

function generateMockUUIDv7(variant) {
  // Mock UUIDv7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
  const hex = (n, len) => n.toString(16).padStart(len, '0');
  return `${hex(variant, 8)}-${hex(variant, 4)}-7${hex(variant, 3)}-a${hex(variant, 3)}-${hex(variant, 12)}`;
}

// Generate vectors
generateVectors().catch(console.error);