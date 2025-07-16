const fs = require('fs');
const yaml = require('js-yaml');
const { ethers } = require('ethers');
const { getTermsHash, signRequest } = require('./bundle/index');

async function main() {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log(`
Usage: node peac-cli.js <command>

Commands:
  generate              Create a pricing.txt template
  validate [file]       Validate a pricing.txt file
  sign [agent_id] [user_id] [key]   Sign a request with EIP-712
`);
    process.exit(0);
  }
  if (process.argv[2] === 'generate') {
    const template = `protocol: peac
version: 0.9
created_at: ${Date.now()}
`;
    fs.writeFileSync('pricing.txt', template);
    console.log('Generated pricing.txt template');
  } else if (process.argv[2] === 'validate') {
    const file = process.argv[3] || 'pricing.txt';
    const content = fs.readFileSync(file, 'utf8');
    const terms = yaml.safeLoad(content);
    const hash = getTermsHash(terms);
    console.log('Validated. Hash:', hash);
  } else if (process.argv[2] === 'sign') {
    const agent_id = process.argv[3] || 'test-agent';
    const user_id = process.argv[4] || 'test-user';
    const key = process.argv[5] || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const request = { agent_id, user_id, agent_type: 'research' };
    const sig = await signRequest(request, key);
    console.log('Signed:', sig);
  } else {
    console.log('PEAC CLI coming soon. Commands: generate, validate [file], sign [agent_id] [user_id] [key]');
  }
}

main();