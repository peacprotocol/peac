#!/usr/bin/env node
/**
 * PEAC Protocol CLI
 * Command-line tools for receipt verification and conformance testing
 */

import { Command, CommanderError } from 'commander';
import { verifyReceipt, verifyLocal } from '@peac/protocol';
import { parseIssuerConfig, fetchIssuerConfig } from '@peac/protocol';
import { decode } from '@peac/crypto';
import { PEACReceiptClaims } from '@peac/schema';
import * as fs from 'fs';
import { policy } from './commands/policy.js';
import { conformance } from './commands/conformance.js';
import { samples } from './commands/samples.js';
import { reconcileCommand } from './commands/reconcile.js';
import { doctor } from './commands/doctor.js';
import { DiscoverCommand } from './commands/discover.js';
import { observeCommand } from './commands/observe-command.js';
import { recordCommand } from './commands/record-command.js';
import { emitCommand } from './commands/emit-lifecycle.js';
import { formatOutput } from './utils.js';
import { getVersion } from './lib/version.js';
import { parsePublicKey } from './lib/public-key.js';
import { readFileBufferSnapshot } from './lib/safe-file.js';

/** Upper bound for a public-key file (a JWK/JWKS is well under 1 KiB). */
const MAX_PUBLIC_KEY_FILE_BYTES = 16_384;

const program = new Command();

program
  .name('peac')
  .description('PEAC protocol command-line tools')
  .version(getVersion())
  .exitOverride(); // Throws CommanderError instead of calling process.exit()

/**
 * peac verify <jws>
 */
program
  .command('verify')
  .description('Verify a PEAC receipt JWS')
  .argument('<jws>', 'JWS compact serialization or path to file containing JWS')
  .option('-v, --verbose', 'Show detailed output')
  .option(
    '--public-key <path>',
    'Verify offline with a public Ed25519 JWK or single-key JWKS file (no network)'
  )
  .action(async (jwsInput: string, options: { verbose?: boolean; publicKey?: string }) => {
    try {
      // Check if input is a file path
      let jws = jwsInput;
      if (fs.existsSync(jwsInput)) {
        jws = fs.readFileSync(jwsInput, 'utf-8').trim();
      }

      // Offline mode: verify the signature locally against a supplied public
      // key. No network / JWKS discovery. Structure validation is performed by
      // verifyLocal, so this path does not assume a payment-receipt shape.
      if (options.publicKey) {
        console.log('Verifying PEAC receipt offline...\n');

        let keyContent: string;
        try {
          keyContent = readFileBufferSnapshot(options.publicKey, {
            maxBytes: MAX_PUBLIC_KEY_FILE_BYTES,
          }).toString('utf8');
        } catch (readErr) {
          const code = (readErr as NodeJS.ErrnoException).code;
          if (code === 'E_PEAC_FILE_TOO_LARGE') {
            console.log(
              `Verification failed: public key file exceeds ${MAX_PUBLIC_KEY_FILE_BYTES} bytes`
            );
          } else if (code === 'EISDIR') {
            console.log('Verification failed: public key path is a directory');
          } else {
            console.log('Verification failed: could not read public key file');
          }
          process.exitCode = 1;
          return;
        }

        let publicKey: Uint8Array;
        try {
          publicKey = parsePublicKey(keyContent);
        } catch (keyErr) {
          console.log(
            `Verification failed: ${keyErr instanceof Error ? keyErr.message : 'invalid public key'}`
          );
          process.exitCode = 1;
          return;
        }

        const localResult = await verifyLocal(jws, publicKey);
        if (localResult.valid) {
          console.log('Signature valid (offline).');
          console.log(
            '   Verified the receipt signature and declared receipt structure against the supplied public key.'
          );
          process.exitCode = 0;
        } else {
          console.log(`Verification failed: ${localResult.message}`);
          if (localResult.code) {
            console.log(`   Code: ${localResult.code}`);
          }
          process.exitCode = 1;
        }
        return;
      }

      console.log('Verifying PEAC receipt...\n');

      // First, decode to show receipt info
      const { payload } = decode<PEACReceiptClaims>(jws);

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
        process.exitCode = 0;
      } else {
        console.log(`Verification failed: ${result.reason}`);
        if (result.details) {
          console.log(`   Details: ${result.details}`);
        }
        process.exitCode = 1;
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
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

      process.exitCode = 0;
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
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

      process.exitCode = 0;
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Policy commands (v0.9.17+)
program.addCommand(policy);

// Conformance testing commands (v0.10.8+)
program.addCommand(conformance);

// Sample receipts commands (v0.10.8+)
program.addCommand(samples);

// Reconcile evidence bundles (v0.11.3+)
program.addCommand(reconcileCommand());

// CLI execution observation
program.addCommand(observeCommand());

// CLI execution record (signed Wire 0.2 JWS)
program.addCommand(recordCommand());

// Lifecycle observation emission (signed Wire 0.2 JWS for external lifecycle events)
program.addCommand(emitCommand());

// Installability diagnostics (v0.12.11+)
doctor(program);

/**
 * peac discover <url>
 *
 * Fetches /.well-known/peac.txt with SSRF-aware HTTP and parses it as a
 * peac-policy/0.1 document. Implementation lives in
 * packages/cli/src/lib/policy-document-discovery.ts (CLI-internal helper).
 */
program
  .command('discover')
  .description('Discover and parse a remote /.well-known/peac.txt policy document')
  .argument('<url>', 'Origin URL (http/https) whose /.well-known/peac.txt to fetch')
  .option('-j, --json', 'output in JSON format')
  .action(async (url: string, opts: { json?: boolean }) => {
    const cmd = new DiscoverCommand();
    const result = await cmd.execute(url, { json: opts.json });
    console.log(formatOutput(result, opts.json));
    process.exitCode = result.success ? 0 : 1;
  });

// Parse and handle Commander errors (exitOverride causes CommanderError on --help, --version, etc.)
try {
  program.parse();
} catch (err) {
  if (err instanceof CommanderError) {
    // CommanderError from --help, --version, or validation errors
    process.exitCode = err.exitCode;
  } else {
    throw err;
  }
}
