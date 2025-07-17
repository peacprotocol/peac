#!/usr/bin/env node
const fs = require('fs');
const yaml = require('js-yaml');
const { getTermsHash, signRequest } = require('../core');

async function main() {
  const command = process.argv[2];

  if (!command || ['--help', '-h'].includes(command)) {
    console.log(`
Usage: peac <command>

Commands:
  generate                           Create a pricing.txt template
  validate [file]                    Validate and hash a pricing.txt file
  sign <agent_id> <user_id> <key>    Sign an access request (EIP-712)
`);
    process.exit(0);
  }

  if (command === 'generate') {
    const template = `protocol: peac\nversion: 0.9\ncreated_at: ${Date.now()}`;
    fs.writeFileSync('pricing.txt', template);
    console.log('Generated pricing.txt template');
  } else if (command === 'validate') {
    const file = process.argv[3] || 'pricing.txt';
    const content = fs.readFileSync(file, 'utf8');
    const terms = yaml.load(content);
    const hash = getTermsHash(terms);
    console.log('Valid. Terms Hash:', hash);
  } else if (command === 'sign') {
    const [agent_id, user_id, key] = process.argv.slice(3);
    if (!agent_id || !user_id || !key) {
      console.error('Usage: peac sign <agent_id> <user_id> <private_key>');
      process.exit(1);
    }
    const request = { agent_id, user_id, agent_type: 'research' };
    try {
      const sig = await signRequest(request, key);
      console.log('Signature:', sig);
    } catch (err) {
      console.error('Error signing request:', err.message || err);
      process.exit(2);
    }
  } else {
    console.log('Unknown command. Use --help for usage.');
  }
}

// Top-level error handler
main().catch(err => {
  console.error('Unexpected error:', err.message || err);
  process.exit(99);
});
