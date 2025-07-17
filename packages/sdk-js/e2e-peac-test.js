const { execSync } = require('child_process');
const { checkAccess } = require('./core/checkAccess');
const { signRequest } = require('./core/signer');
const fs = require('fs');
const yaml = require('js-yaml');

function log(cmd) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

// 1. Generate a sample pricing.txt
log('node cli/peac-cli.js generate');

// 2. Validate the generated file
log('node cli/peac-cli.js validate pricing.txt');

// 3. Prepare agent identity for signing and access checks
const agent_id = '0xa0fb98a1d397d13fbe71f31fbc3241c8b01488da'; // Derived from test vector private key
const user_id = 'user-123';
const agent_type = 'research';
const private_key = '4f3edf983ac636a65a842ce7c78d9aa706d3b113b37d7b1b6b5ddf49f7f6ed15';

// The ONLY fields that are signed!
const signed_request = { agent_id, user_id, agent_type };

// 4. Sign the access request *in-memory* for exact match
const signature = signRequest(signed_request, private_key);
console.log('\nLoaded signature:', signature);

// 5. Prepare headers and request for access check
const pricing = yaml.load(fs.readFileSync('examples/pricing.txt', 'utf8'));
const headers = {
  'X-PEAC-Agent-ID': agent_id,
  'X-PEAC-User-ID': user_id,
  'X-PEAC-Agent-Type': agent_type,
  'X-PEAC-Signature': signature,
  'X-PEAC-Attribution-Consent': 'true'
};
const check_request = { ...signed_request, path: '/test' };

// DEBUG: Print everything!
console.log('\n[DEBUG] signed_request:', JSON.stringify(signed_request, null, 2));
console.log('[DEBUG] signature:', signature);
console.log('[DEBUG] headers:', JSON.stringify(headers, null, 2));
console.log('[DEBUG] check_request:', JSON.stringify(check_request, null, 2));

// 6. Check access using SDK
const access = checkAccess(pricing, headers, check_request);

console.log('\nSDK checkAccess result:', access);

if (access.access) {
  console.log('✅ E2E success: Access granted!');
  process.exit(0);
} else {
  console.error('❌ E2E fail: Access denied:', access.reason);
  process.exit(1);
}
