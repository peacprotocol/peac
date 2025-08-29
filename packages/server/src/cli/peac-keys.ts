#!/usr/bin/env node

import { Command } from 'commander';
import { generateKeyPair, keyStore, exportJWKS, SiteKey } from '../core/keys';
import fs from 'fs/promises';

const program = new Command();

program.name('peac-keys').description('PEAC site key management CLI').version('0.9.10');

program
  .command('gen')
  .description('Generate a new site key')
  .option('--kid <kid>', 'Key ID (default: site-YYYY-MM-DD)')
  .option('--output <file>', 'Output file for private key (default: stdout public only)')
  .action(async (options) => {
    try {
      const kid = options.kid || `site-${new Date().toISOString().substring(0, 10)}`;
      const key = generateKeyPair(kid);

      if (options.output) {
        // Save full key to file
        const keyData = {
          kid: key.kid,
          created: key.created,
          expires: key.expires,
          publicKey: Buffer.from(key.publicKey).toString('base64'),
          privateKey: key.privateKey ? Buffer.from(key.privateKey).toString('base64') : undefined,
        };

        await fs.writeFile(options.output, JSON.stringify(keyData, null, 2));
        process.stdout.write(`Key saved to ${options.output}\n`);

        // Print public JWKS
        const jwks = exportJWKS([key]);
        process.stdout.write('\nPublic JWKS:\n');
        process.stdout.write(JSON.stringify(jwks, null, 2) + '\n');
      } else {
        // Print public JWKS only
        const jwks = exportJWKS([key]);
        process.stdout.write(JSON.stringify(jwks, null, 2) + '\n');
      }
    } catch (error) {
      process.stderr.write(`Failed to generate key: ${error}\n`);
      process.exit(1);
    }
  });

program
  .command('rotate')
  .description('Rotate to a new active key')
  .requiredOption('--kid <kid>', 'New key ID')
  .option('--key-file <file>', 'Load key from file')
  .action(async (options) => {
    try {
      let key: SiteKey;

      if (options.keyFile) {
        const keyData = JSON.parse(await fs.readFile(options.keyFile, 'utf-8'));
        key = {
          kid: keyData.kid,
          created: keyData.created,
          expires: keyData.expires,
          publicKey: Buffer.from(keyData.publicKey, 'base64'),
          privateKey: keyData.privateKey ? Buffer.from(keyData.privateKey, 'base64') : undefined,
        };
      } else {
        key = generateKeyPair(options.kid);
      }

      await keyStore.rotate(key);
      process.stdout.write(`Rotated to key: ${key.kid}\n`);

      // Print current public JWKS
      const allKeys = await keyStore.getAllPublic();
      const jwks = exportJWKS(allKeys);
      process.stdout.write('\nUpdated JWKS:\n');
      process.stdout.write(JSON.stringify(jwks, null, 2) + '\n');
    } catch (error) {
      process.stderr.write(`Failed to rotate key: ${error}\n`);
      process.exit(1);
    }
  });

program
  .command('export-jwks')
  .description('Export current public JWKS')
  .option('--output <file>', 'Output file (default: stdout)')
  .action(async (options) => {
    try {
      const keys = await keyStore.getAllPublic();
      const jwks = exportJWKS(keys);
      const json = JSON.stringify(jwks, null, 2);

      if (options.output) {
        await fs.writeFile(options.output, json);
        process.stdout.write(`JWKS exported to ${options.output}\n`);
      } else {
        process.stdout.write(json + '\n');
      }
    } catch (error) {
      process.stderr.write(`Failed to export JWKS: ${error}\n`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all keys')
  .action(async () => {
    try {
      const keys = await keyStore.getAllPublic();

      if (keys.length === 0) {
        process.stdout.write('No keys found\n');
        return;
      }

      process.stdout.write('Site Keys:\n');
      for (const key of keys) {
        const status = await keyStore
          .getActive()
          .then((active) => (active.kid === key.kid ? ' (active)' : ''))
          .catch(() => '');

        const expires = key.expires ? new Date(key.expires * 1000).toISOString() : 'never';
        process.stdout.write(`  ${key.kid}${status} - expires: ${expires}\n`);
      }
    } catch (error) {
      process.stderr.write(`Failed to list keys: ${error}\n`);
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse();
}
