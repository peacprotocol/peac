import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('Receipt JWS format validation', async () => {
  // Load a sample receipt from golden vectors
  const vectorDir = 'tests/golden/receipt-vectors';
  const files = fs.readdirSync(vectorDir).filter((f) => f.endsWith('.json') && f !== 'jwks.json');

  if (files.length === 0) {
    throw new Error('No receipt vectors found for testing');
  }

  const sampleVector = JSON.parse(fs.readFileSync(`${vectorDir}/${files[0]}`, 'utf8'));

  const receipt = sampleVector.jws;
  assert(typeof receipt === 'string', 'Receipt must be a string');

  // Test standard 3-part compact JWS format (header.payload.signature)
  const parts = receipt.split('.');
  assert.strictEqual(
    parts.length,
    3,
    'Receipt must have exactly 3 parts (header.payload.signature)'
  );

  // Validate each part is base64url encoded (no padding)
  for (const [i, part] of parts.entries()) {
    assert(part.length > 0, `Part ${i} must not be empty`);
    assert(!part.includes('+'), `Part ${i} must use base64url (no + characters)`);
    assert(!part.includes('/'), `Part ${i} must use base64url (no / characters)`);
    assert(!part.includes('='), `Part ${i} must use base64url (no padding)`);
    assert(/^[A-Za-z0-9_-]+$/.test(part), `Part ${i} must contain only base64url characters`);
  }

  // Decode and validate header structure
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  assert.strictEqual(header.alg, 'EdDSA', 'Algorithm must be EdDSA');
  assert(typeof header.kid === 'string' && header.kid.length > 0, 'kid must be present');
  assert(header.typ, 'typ claim must be present');

  // Decode and validate payload structure
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  assert(typeof payload.iss === 'string', 'iss claim must be string');
  assert(typeof payload.sub === 'string', 'sub claim must be string');
  // aud claim is optional in some receipt formats
  if (payload.aud) {
    assert(typeof payload.aud === 'string', 'aud claim must be string when present');
  }
  assert(typeof payload.iat === 'number', 'iat claim must be number');
  assert(typeof payload.exp === 'number', 'exp claim must be number');
  // Receipt ID can be either rid or jti
  assert(
    typeof payload.rid === 'string' || typeof payload.jti === 'string',
    'Receipt must have rid or jti claim (UUID)'
  );

  // Validate signature is not empty
  assert(parts[2].length > 0, 'Signature must not be empty');

  console.log(
    `✅ JWS format validated: ${parts[0].length}+${parts[1].length}+${parts[2].length} chars`
  );
});
