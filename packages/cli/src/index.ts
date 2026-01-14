#!/usr/bin/env node
/**
 * PEAC Protocol CLI
 * Command-line tools for receipt verification and conformance testing
 */

import { Command } from 'commander';
import { verifyReceipt } from '@peac/protocol';
import { parseIssuerConfig, fetchIssuerConfig } from '@peac/protocol';
import { decode } from '@peac/crypto';
import { PEACReceiptClaims } from '@peac/schema';
import * as fs from 'fs';
import { policy } from './commands/policy';

const program = new Command();

program.name('peac').description('PEAC protocol command-line tools').version('0.9.15');

/**
 * peac verify <jws>
 */
program
  .command('verify')
  .description('Verify a PEAC receipt JWS')
  .argument('<jws>', 'JWS compact serialization or path to file containing JWS')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (jwsInput: string, options: { verbose?: boolean }) => {
    try {
      // Check if input is a file path
      let jws = jwsInput;
      if (fs.existsSync(jwsInput)) {
        jws = fs.readFileSync(jwsInput, 'utf-8').trim();
      }

      console.log('Verifying PEAC receipt...\n');

      // First, decode to show receipt info
      const { header, payload } = decode<PEACReceiptClaims>(jws);

      console.log('Receipt Information:');
      console.log(`   Receipt ID: ${payload.rid}`);
      console.log(`   Issuer:     ${payload.iss}`);
      console.log(`   Audience:   ${payload.aud}`);
      console.log(`   Amount:     ${payload.amt} ${payload.cur}`);
      console.log(`   Payment:    ${payload.payment.rail} (${payload.payment.reference})`);
      console.log(`   Issued:     ${new Date(payload.iat * 1000).toISOString()}`);
      if (payload.exp) {
        console.log(`   Expires:    ${new Date(payload.exp * 1000).toISOString()}`);
      }
      console.log();

      // Verify signature
      console.log('Verifying signature...');
      const result = await verifyReceipt(jws);

      if (result.ok) {
        console.log('Signature valid!');
        if (result.perf) {
          console.log(`   Verification time: ${result.perf.verify_ms.toFixed(2)}ms`);
          if (result.perf.jwks_fetch_ms) {
            console.log(`   JWKS fetch time: ${result.perf.jwks_fetch_ms.toFixed(2)}ms`);
          }
        }
        process.exit(0);
      } else {
        console.log(`Verification failed: ${result.reason}`);
        if (result.details) {
          console.log(`   Details: ${result.details}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

/**
 * peac validate-issuer <path|url>
 *
 * Validates a PEAC issuer configuration (/.well-known/peac-issuer.json)
 */
program
  .command('validate-issuer')
  .description('Validate a PEAC issuer configuration')
  .argument('<input>', 'Path to peac-issuer.json file or issuer URL')
  .action(async (input: string) => {
    try {
      console.log('Validating issuer configuration...\n');

      let config;
      if (input.startsWith('http://') || input.startsWith('https://')) {
        // Fetch from URL
        console.log(`Fetching from ${input}...`);
        config = await fetchIssuerConfig(input);
      } else {
        // Read from file
        const text = fs.readFileSync(input, 'utf-8');
        config = parseIssuerConfig(text);
      }

      console.log('Issuer configuration is valid!\n');

      console.log('Issuer Configuration:');
      console.log(`   Version:   ${config.version}`);
      console.log(`   Issuer:    ${config.issuer}`);
      console.log(`   JWKS URI:  ${config.jwks_uri}`);

      if (config.verify_endpoint) {
        console.log(`   Verify:    ${config.verify_endpoint}`);
      }

      if (config.receipt_versions && config.receipt_versions.length > 0) {
        console.log(`   Receipts:  ${config.receipt_versions.join(', ')}`);
      }

      if (config.algorithms && config.algorithms.length > 0) {
        console.log(`   Algorithms: ${config.algorithms.join(', ')}`);
      }

      if (config.payment_rails && config.payment_rails.length > 0) {
        console.log(`   Rails:     ${config.payment_rails.join(', ')}`);
      }

      if (config.security_contact) {
        console.log(`   Security:  ${config.security_contact}`);
      }

      process.exit(0);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

/**
 * peac decode <jws>
 */
program
  .command('decode')
  .description('Decode a PEAC receipt JWS (without verification)')
  .argument('<jws>', 'JWS compact serialization or path to file containing JWS')
  .option('--json', 'Output as JSON')
  .action((jwsInput: string, options: { json?: boolean }) => {
    try {
      // Check if input is a file path
      let jws = jwsInput;
      if (fs.existsSync(jwsInput)) {
        jws = fs.readFileSync(jwsInput, 'utf-8').trim();
      }

      const { header, payload } = decode<PEACReceiptClaims>(jws);

      if (options.json) {
        console.log(JSON.stringify({ header, payload }, null, 2));
      } else {
        console.log('PEAC Receipt (Decoded, Not Verified)\n');

        console.log('Header:');
        console.log(`   typ: ${header.typ}`);
        console.log(`   alg: ${header.alg}`);
        console.log(`   kid: ${header.kid}`);
        console.log();

        console.log('Claims:');
        console.log(`   iss: ${payload.iss}`);
        console.log(`   aud: ${payload.aud}`);
        console.log(`   iat: ${payload.iat} (${new Date(payload.iat * 1000).toISOString()})`);
        if (payload.exp) {
          console.log(`   exp: ${payload.exp} (${new Date(payload.exp * 1000).toISOString()})`);
        }
        console.log(`   rid: ${payload.rid}`);
        console.log(`   amt: ${payload.amt}`);
        console.log(`   cur: ${payload.cur}`);
        console.log();

        console.log('Payment:');
        console.log(`   rail:      ${payload.payment.rail}`);
        console.log(`   reference: ${payload.payment.reference}`);
        console.log(`   amount:    ${payload.payment.amount}`);
        console.log(`   currency:  ${payload.payment.currency}`);

        if (payload.subject) {
          console.log();
          console.log('Subject:');
          console.log(`   uri: ${payload.subject.uri}`);
        }

        if (payload.ext) {
          console.log();
          console.log('Extensions:');
          console.log(JSON.stringify(payload.ext, null, 2));
        }
      }

      process.exit(0);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Policy commands (v0.9.17+)
program.addCommand(policy);

program.parse();
