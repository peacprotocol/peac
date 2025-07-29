#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const chalk = require('chalk');
const { Parser, Crypto, version } = require('../sdk');

program
  .name('peac')
  .description('PEAC Protocol CLI')
  .version(version);

// Init command
program
  .command('init')
  .description('Initialize a new pact.txt file')
  .option('-t, --type <type>', 'Type of pact (minimal, standard, full)', 'standard')
  .option('-o, --output <file>', 'Output file', 'pact.txt')
  .action(async (options) => {
    try {
      const template = await getTemplate(options.type);
      await fs.writeFile(options.output, yaml.dump(template));
      console.log(chalk.green(`✓ Created ${options.output}`));
      console.log(chalk.gray(`  Edit the file to customize your pact`));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate <file>')
  .description('Validate a pact file')
  .action(async (file) => {
    try {
      const content = await fs.readFile(file, 'utf8');
      const parser = new Parser();
      const pact = parser.parsePactContent(content);
      parser.validatePact(pact);
      console.log(chalk.green('✓ Valid pact file'));
    } catch (error) {
      console.error(chalk.red('✗ Invalid:'), error.message);
      process.exit(1);
    }
  });

// Sign command
program
  .command('sign <file>')
  .description('Sign a pact file')
  .option('-k, --key <keyfile>', 'Private key file')
  .action(async (file, options) => {
    try {
      const content = await fs.readFile(file, 'utf8');
      const pact = yaml.load(content);
      
      let privateKey;
      if (options.key) {
        privateKey = await fs.readFile(options.key, 'utf8');
      } else {
        // Generate new keypair
        const crypto = new Crypto();
        const { privateKey: priv, publicKey } = crypto.generateKeyPair();
        privateKey = priv;
        
        // Save keys
        await fs.writeFile('pact-private.pem', privateKey);
        await fs.writeFile('pact-public.pem', publicKey);
        console.log(chalk.yellow('Generated new keypair: pact-private.pem, pact-public.pem'));
      }
      
      const crypto = new Crypto();
      const signedPact = crypto.signPact(pact, privateKey);
      
      await fs.writeFile(file, yaml.dump(signedPact));
      console.log(chalk.green(`✓ Signed ${file}`));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Parse command
program
  .command('parse <domain>')
  .description('Parse pact from a domain')
  .action(async (domain) => {
    try {
      const parser = new Parser();
      const pact = await parser.parse(domain);
      console.log(yaml.dump(pact));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Helper functions
async function getTemplate(type) {
  const templates = {
    minimal: {
      version: '0.9.1',
      protocol: 'peac',
      pact: {
        consent: {
          ai_training: 'conditional'
        },
        economics: {
          pricing: '$0.01/request'
        }
      }
    },
    standard: {
      version: '0.9.1',
      protocol: 'peac',
      metadata: {
        domain: 'example.com',
        updated: new Date().toISOString()
      },
      pact: {
        consent: {
          ai_training: 'conditional',
          web_scraping: 'allowed',
          commercial_use: 'negotiable'
        },
        economics: {
          pricing: '$0.01/request',
          payment_endpoints: {
            stripe: 'https://pay.example.com/stripe'
          }
        },
        attribution: {
          required: true,
          format: 'Source: {url}'
        },
        compliance: {
          gdpr: true,
          ccpa: true
        }
      }
    }
  };
  
  return templates[type] || templates.standard;
}

program.parse();