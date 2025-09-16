#!/usr/bin/env node
/**
 * PEAC Protocol CLI
 * Commands: discover, hash, verify
 */

import { Command } from 'commander';
import { DiscoverCommand } from './commands/discover.js';
import { HashCommand } from './commands/hash.js';
import { VerifyCommand } from './commands/verify.js';
import { formatOutput, createExitHandler } from './utils.js';

const program = new Command();
const exit = createExitHandler();

program
  .name('peac')
  .description('PEAC Protocol CLI tools for discovery, hashing, and verification')
  .version('0.9.13.1');

// Global options
program
  .option('-j, --json', 'output in JSON format')
  .option('-v, --verbose', 'verbose output')
  .option('-t, --timeout <ms>', 'request timeout in milliseconds', '5000');

// peac discover <url>
program
  .command('discover <url>')
  .description('List AIPREF / agent-permissions / peac.txt sources')
  .action(async (url, options) => {
    const globalOptions = program.opts();
    const command = new DiscoverCommand();

    const result = await command.execute(url, {
      ...globalOptions,
      timeout: parseInt(globalOptions.timeout),
    });

    console.log(formatOutput(result, globalOptions.json));
    exit(result.success ? 0 : 1);
  });

// peac hash <policy.json>
program
  .command('hash [policy-file]')
  .description('Compute canonical digest of policy (from file or stdin)')
  .action(async (policyFile, options) => {
    const globalOptions = program.opts();
    const command = new HashCommand();

    let result;
    if (policyFile) {
      result = await command.execute(policyFile, globalOptions);
    } else {
      result = await command.executeFromStdin(globalOptions);
    }

    console.log(formatOutput(result, globalOptions.json));
    exit(result.success ? 0 : 1);
  });

// peac verify <receipt.jws> --resource <url>
program
  .command('verify <receipt-file>')
  .description('Verify receipt JWS signature and optionally recompute policy hash')
  .option('-r, --resource <url>', 'resource URL for policy hash verification')
  .option('-k, --keys <jwks-file>', 'path to JWKS file for verification')
  .action(async (receiptFile, options) => {
    const globalOptions = program.opts();
    const command = new VerifyCommand();

    const result = await command.execute(receiptFile, {
      ...globalOptions,
      ...options,
      timeout: parseInt(globalOptions.timeout),
    });

    console.log(formatOutput(result, globalOptions.json));
    exit(result.success ? 0 : 1);
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error('Invalid command. See --help for available commands.');
  exit(1);
});

// Parse command line arguments
program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
  exit(0);
}
