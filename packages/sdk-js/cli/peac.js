#!/usr/bin/env node

/**
 * PEAC Protocol CLI v0.9.6
 * Command-line interface for PEAC Protocol operations
 * @license Apache-2.0
 */

const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { UniversalParser, Crypto, Client, version } = require('../sdk');

// Configure CLI
program
  .name('peac')
  .description('PEAC Protocol CLI - Manage digital pacts for the automated economy')
  .version(version)
  .addHelpText(
    'after',
    `
Examples:
  $ peac init                     Create a new peac.txt file
  $ peac validate peac.txt        Validate a peac file
  $ peac sign peac.txt           Sign a peac file
  $ peac parse example.com       Parse peac from a domain
  $ peac scan example.com        Scan all policy files
  $ peac migrate robots.txt      Migrate from legacy format
  $ peac negotiate:create example.com Start new negotiation with a publisher
  $ peac accept <id>             Accept a negotiation
  $ peac reject <id> "reason"    Reject a negotiation
  $ peac pay:create --rail credits Create a payment
  $ peac status <id>             Check payment/negotiation status
  $ peac payments:list           List payments with pagination

For more information, visit https://peacprotocol.org/docs`,
  );

// Init command
program
  .command('init')
  .description('Initialize a new peac.txt file')
  .option('-t, --type <type>', 'Type of peac (minimal, standard, full)', 'standard')
  .option('-o, --output <file>', 'Output file', 'peac.txt')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (options) => {
    try {
      let template;

      if (options.interactive) {
        // Interactive mode would walk through options
        console.log('Interactive mode coming soon...');
        template = await getTemplate(options.type);
      } else {
        template = await getTemplate(options.type);
      }

      const yamlContent = yaml.dump(template, {
        lineWidth: -1,
        noRefs: true,
      });

      await fs.writeFile(options.output, yamlContent);

      console.log(`✓ Created ${options.output}`);
      console.log(`  Type: ${options.type}`);
      console.log(`  Next steps:`);
      console.log(`    1. Edit ${options.output} to customize your terms`);
      console.log(`    2. Run 'peac sign ${options.output}' to sign it`);
      console.log(`    3. Deploy to your-domain.com/${options.output}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate <file>')
  .description('Validate a peac file')
  .option('-s, --strict', 'Strict validation')
  .option('-v, --verbose', 'Verbose output')
  .action(async (file, options) => {
    try {
      const content = await fs.readFile(file, 'utf8');
      const parser = new UniversalParser({ strict: options.strict });
      const peac = parser.parsePeacContent(content);
      await parser.validatePeac(peac);

      console.log('✓ Valid peac file');

      if (options.verbose) {
        console.log('\nDetails:');
        console.log(`  Version: ${peac.version}`);
        console.log(`  Protocol: ${peac.protocol}`);
        console.log(`  Signed: ${peac.signature ? 'Yes' : 'No'}`);

        if (parser.warnings.length > 0) {
          console.log('\nWarnings:');
          parser.warnings.forEach((w) => console.log(` - ${w}`));
        }
      }
    } catch (error) {
      console.error('✗ Invalid:', error.message);
      process.exit(1);
    }
  });

// Sign command
program
  .command('sign <file>')
  .description('Sign a peac file with Ed25519')
  .option('-k, --key <keyfile>', 'Private key file')
  .option('-p, --passphrase <passphrase>', 'Key passphrase')
  .option('-g, --generate-key', 'Generate new keypair if needed')
  .action(async (file, options) => {
    try {
      const content = await fs.readFile(file, 'utf8');
      const peac = yaml.load(content);
      const crypto = new Crypto();

      let privateKey;
      let publicKey;

      if (options.key) {
        privateKey = await crypto.loadKey(options.key, options.passphrase);
        // Try to load corresponding public key
        const pubKeyPath = options.key.replace(/\.(pem|key)$/, '.pub');
        try {
          publicKey = await crypto.loadKey(pubKeyPath);
        } catch {
          console.warn('Warning: Could not find public key file');
        }
      } else if (options.generateKey) {
        // Generate new keypair
        console.log('Generating new Ed25519 keypair...');
        const keyPair = crypto.generateKeyPair({
          passphrase: options.passphrase,
        });
        privateKey = keyPair.privateKey;
        publicKey = keyPair.publicKey;

        // Save keys
        const keyName = path.basename(file, path.extname(file));
        const privateKeyPath = `${keyName}-private.pem`;
        const publicKeyPath = `${keyName}-public.pem`;

        await fs.writeFile(privateKeyPath, privateKey);
        await fs.writeFile(publicKeyPath, publicKey);

        console.log(`✓ Generated keypair:`);
        console.log(`  Private key: ${privateKeyPath}`);
        console.log(`  Public key: ${publicKeyPath}`);
        console.log(`  Keep your private key secure!`);
      } else {
        console.error('Error: No key provided. Use --key or --generate-key');
        process.exit(1);
      }

      // Add public key to metadata
      if (publicKey) {
        peac.metadata = peac.metadata || {};
        peac.metadata.public_key = publicKey;
      }

      // Sign the peac
      const signedPeac = await crypto.signPeac(peac, privateKey);

      // Save signed peac
      const signedContent = yaml.dump(signedPeac, {
        lineWidth: -1,
        noRefs: true,
      });
      await fs.writeFile(file, signedContent);

      console.log(`✓ Signed ${file}`);
      console.log(`  Signature: ${signedPeac.signature.substring(0, 32)}...`);
      console.log(`  Algorithm: ${signedPeac.signature_algorithm}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Parse command
program
  .command('parse <domain>')
  .description('Parse peac from a domain')
  .option('-f, --format <format>', 'Output format (json, yaml)', 'yaml')
  .option('-c, --no-cache', 'Disable caching')
  .option('-v, --verbose', 'Verbose output')
  .action(async (domain, options) => {
    try {
      const parser = new UniversalParser({
        cache: options.cache,
        strict: false,
      });

      console.log(`Parsing peac from ${domain}...`);
      const peac = await parser.parse(domain);

      if (options.verbose && parser.warnings.length > 0) {
        console.log('\nWarnings:');
        parser.warnings.forEach((w) => console.log(` - ${w}`));
      }

      const output = options.format === 'json' ? JSON.stringify(peac, null, 2) : yaml.dump(peac);

      console.log('\n' + output);

      if (peac.confidence !== undefined && peac.confidence < 1) {
        console.log(`\nConfidence: ${(peac.confidence * 100).toFixed(0)}%`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Scan command
program
  .command('scan <domain>')
  .description('Scan domain for all policy files')
  .option('-d, --detailed', 'Show detailed results')
  .action(async (domain) => {
    try {
      const parser = new UniversalParser();

      console.log(`\nScanning ${domain} for policy files...`);
      const result = await parser.parseAll(domain);

      console.log('\n✓ Policy scan complete');
      console.log('─'.repeat(50));

      if (result.metadata?.sources) {
        console.log('Sources found:');
        result.metadata.sources.forEach((source) => {
          console.log(`  - ${source.file || source}`);
        });
      }

      console.log('\nUnified policy:');
      console.log(yaml.dump(result.peac, { lineWidth: -1 }));

      if (result.confidence !== undefined) {
        console.log(`\nConfidence: ${(result.confidence * 100).toFixed(0)}%`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Migrate command
program
  .command('migrate <file>')
  .description('Migrate from legacy format to peac.txt')
  .option('-f, --format <format>', 'Source format (robots, llms, ai, usage)', 'robots')
  .option('-o, --output <file>', 'Output file', 'peac.txt')
  .action(async (file, options) => {
    try {
      const content = await fs.readFile(file, 'utf8');
      const parser = new UniversalParser();

      let peac;
      const basePolicy = {
        version: '0.9.6',
        protocol: 'peac',
        metadata: {
          migrated_from: options.format,
          migrated_at: new Date().toISOString(),
          original_file: file,
        },
      };

      console.log(`Migrating from ${options.format} format...`);

      switch (options.format) {
        case 'robots':
          peac = { ...basePolicy, peac: parser.parseRobots(content) };
          break;
        case 'llms':
          peac = { ...basePolicy, peac: parser.parseLLMs(content) };
          break;
        case 'ai':
          peac = { ...basePolicy, peac: parser.parseAI(content) };
          break;
        case 'usage':
          peac = { ...basePolicy, peac: parser.parseUsage(content) };
          break;
        default:
          throw new Error(`Unknown format: ${options.format}`);
      }

      const yamlContent = yaml.dump(peac, {
        lineWidth: -1,
        noRefs: true,
      });

      await fs.writeFile(options.output, yamlContent);

      console.log(`✓ Migrated to ${options.output}`);
      console.log(`  Original format: ${options.format}`);
      console.log(`  New format: PEAC Protocol v${peac.version}`);
      console.log(`\nNext steps:`);
      console.log(`  1. Review and enhance ${options.output}`);
      console.log(`  2. Add payment processors and compliance info`);
      console.log(`  3. Sign with 'peac sign ${options.output}'`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// New v0.9.6 API commands

// Accept negotiation command
program
  .command('accept <negotiation-id>')
  .description('Accept a negotiation')
  .option('--server <url>', 'PEAC server URL', 'http://localhost:3000')
  .option('--decided-by <who>', 'Who is accepting the negotiation')
  .action(async (negotiationId, options) => {
    try {
      const client = new Client({ baseUrl: options.server });

      console.log(`Accepting negotiation ${negotiationId}...`);

      const response = await client.acceptNegotiation(negotiationId, {
        decided_by: options.decidedBy,
      });

      console.log('✓ Negotiation accepted successfully');
      console.log(`  ID: ${response.data.id}`);
      console.log(`  State: ${response.data.state}`);
      console.log(`  Updated: ${response.data.updated_at}`);

      if (response.data.decided_by) {
        console.log(`  Decided by: ${response.data.decided_by}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Details:', error.response.detail);
      }
      process.exit(1);
    }
  });

// Reject negotiation command
program
  .command('reject <negotiation-id> <reason>')
  .description('Reject a negotiation with a reason')
  .option('--server <url>', 'PEAC server URL', 'http://localhost:3000')
  .option('--decided-by <who>', 'Who is rejecting the negotiation')
  .action(async (negotiationId, reason, options) => {
    try {
      const client = new Client({ baseUrl: options.server });

      console.log(`Rejecting negotiation ${negotiationId}...`);

      const response = await client.rejectNegotiation(negotiationId, reason, {
        decided_by: options.decidedBy,
      });

      console.log('✓ Negotiation rejected successfully');
      console.log(`  ID: ${response.data.id}`);
      console.log(`  State: ${response.data.state}`);
      console.log(`  Reason: ${response.data.reason}`);
      console.log(`  Updated: ${response.data.updated_at}`);

      if (response.data.decided_by) {
        console.log(`  Decided by: ${response.data.decided_by}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Details:', error.response.detail);
      }
      process.exit(1);
    }
  });

// Status command (works for both payments and negotiations)
program
  .command('status <id>')
  .description('Check status of a payment or negotiation')
  .option('--server <url>', 'PEAC server URL', 'http://localhost:3000')
  .option('--type <type>', 'Resource type (payment, negotiation)', 'auto')
  .action(async (id, options) => {
    try {
      const client = new Client({ baseUrl: options.server });

      console.log(`Checking status of ${id}...`);

      let response;
      let resourceType = options.type;

      if (resourceType === 'auto') {
        // Try to determine type by checking both endpoints
        try {
          response = await client.getPayment(id);
          resourceType = 'payment';
        } catch (paymentError) {
          try {
            response = await client.getNegotiation(id);
            resourceType = 'negotiation';
          } catch (negotiationError) {
            throw new Error(`Resource ${id} not found as payment or negotiation`);
          }
        }
      } else if (resourceType === 'payment') {
        response = await client.getPayment(id);
      } else if (resourceType === 'negotiation') {
        response = await client.getNegotiation(id);
      } else {
        throw new Error('Invalid type. Use: payment, negotiation, or auto');
      }

      const data = response.data;

      console.log(`\n✓ ${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} Status`);
      console.log('─'.repeat(40));
      console.log(`  ID: ${data.id}`);

      if (resourceType === 'payment') {
        console.log(`  Rail: ${data.rail}`);
        console.log(`  Amount: ${data.amount} ${data.currency}`);
        console.log(`  Status: ${data.status}`);
        if (data.external_id) console.log(`  External ID: ${data.external_id}`);
        if (data.failure_reason) console.log(`  Failure Reason: ${data.failure_reason}`);
      } else {
        console.log(`  State: ${data.state}`);
        if (data.terms) console.log(`  Terms: ${JSON.stringify(data.terms, null, 2)}`);
        if (data.reason) console.log(`  Reason: ${data.reason}`);
        if (data.proposed_by) console.log(`  Proposed by: ${data.proposed_by}`);
        if (data.decided_by) console.log(`  Decided by: ${data.decided_by}`);
      }

      console.log(`  Created: ${new Date(data.created_at).toLocaleString()}`);
      console.log(`  Updated: ${new Date(data.updated_at).toLocaleString()}`);

      if (data.metadata) {
        console.log(`  Metadata: ${JSON.stringify(data.metadata, null, 2)}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Details:', error.response.detail);
      }
      process.exit(1);
    }
  });

// List payments command
program
  .command('payments:list')
  .description('List payments with pagination')
  .option('--server <url>', 'PEAC server URL', 'http://localhost:3000')
  .option('--limit <limit>', 'Number of items per page', '20')
  .option('--cursor <cursor>', 'Pagination cursor')
  .option('--all', 'Fetch all payments (paginate automatically)')
  .action(async (options) => {
    try {
      const client = new Client({ baseUrl: options.server });
      const limit = parseInt(options.limit);

      if (options.all) {
        console.log('Fetching all payments...\n');
        let count = 0;

        for await (const payment of client.paginatePayments({ limit })) {
          count++;
          console.log(`${count}. ${payment.id}`);
          console.log(`   Rail: ${payment.rail}, Amount: ${payment.amount} ${payment.currency}`);
          console.log(
            `   Status: ${payment.status}, Created: ${new Date(payment.created_at).toLocaleDateString()}`,
          );
          console.log('');
        }

        console.log(`Total payments: ${count}`);
      } else {
        console.log('Fetching payments...\n');

        const response = await client.listPayments({
          limit,
          cursor: options.cursor,
        });

        const payments = response.data.items;

        if (payments.length === 0) {
          console.log('No payments found.');
          return;
        }

        payments.forEach((payment, index) => {
          console.log(`${index + 1}. ${payment.id}`);
          console.log(`   Rail: ${payment.rail}, Amount: ${payment.amount} ${payment.currency}`);
          console.log(
            `   Status: ${payment.status}, Created: ${new Date(payment.created_at).toLocaleDateString()}`,
          );
          console.log('');
        });

        console.log(`Showing ${payments.length} payments`);

        if (response.data.next_cursor) {
          console.log(`Next page: --cursor ${response.data.next_cursor}`);
        }

        if (response.data.has_more) {
          console.log('More payments available. Use --all to fetch all.');
        }
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Details:', error.response.detail);
      }
      process.exit(1);
    }
  });

// Updated negotiate command to use new API
program
  .command('negotiate:create <domain>')
  .description('Create a new negotiation with a publisher')
  .option('--server <url>', 'PEAC server URL', 'http://localhost:3000')
  .option('--terms <terms>', 'Terms as JSON string')
  .option('--context <context>', 'Context as JSON string')
  .option('--proposed-by <who>', 'Who is proposing the negotiation')
  .action(async (domain, options) => {
    try {
      const client = new Client({ baseUrl: options.server });

      console.log(`Creating negotiation with ${domain}...`);

      const negotiationData = {
        proposed_by: options.proposedBy,
      };

      if (options.terms) {
        try {
          negotiationData.terms = JSON.parse(options.terms);
        } catch (error) {
          throw new Error('Invalid terms JSON format');
        }
      }

      if (options.context) {
        try {
          negotiationData.context = JSON.parse(options.context);
        } catch (error) {
          throw new Error('Invalid context JSON format');
        }
      }

      const response = await client.createNegotiation(negotiationData, {
        idempotencyKey: client.generateIdempotencyKey(),
      });

      console.log('✓ Negotiation created successfully');
      console.log(`  ID: ${response.data.id}`);
      console.log(`  State: ${response.data.state}`);
      console.log(`  Created: ${response.data.created_at}`);

      if (response.data.terms) {
        console.log(`  Terms: ${JSON.stringify(response.data.terms, null, 2)}`);
      }

      if (response.data.context) {
        console.log(`  Context: ${JSON.stringify(response.data.context, null, 2)}`);
      }

      console.log(`\nNext steps:`);
      console.log(`  - Use 'peac status ${response.data.id}' to check progress`);
      console.log(`  - The other party can accept with 'peac accept ${response.data.id}'`);
      console.log(`  - Or reject with 'peac reject ${response.data.id} "reason"'`);
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Details:', error.response.detail);
      }
      process.exit(1);
    }
  });

// Updated pay command to use new API
program
  .command('pay:create')
  .description('Create a payment using the new API')
  .option('--server <url>', 'PEAC server URL', 'http://localhost:3000')
  .option('--rail <rail>', 'Payment rail (credits, x402)', 'credits')
  .option('--amount <amount>', 'Amount to pay', '10')
  .option('--currency <currency>', 'Currency code', 'USD')
  .option('--metadata <metadata>', 'Metadata as JSON string')
  .action(async (options) => {
    try {
      const client = new Client({ baseUrl: options.server });

      console.log(`Creating ${options.rail} payment...`);

      const paymentData = {
        rail: options.rail,
        amount: parseFloat(options.amount),
        currency: options.currency,
      };

      if (options.metadata) {
        try {
          paymentData.metadata = JSON.parse(options.metadata);
        } catch (error) {
          throw new Error('Invalid metadata JSON format');
        }
      }

      const response = await client.createPayment(paymentData, {
        idempotencyKey: client.generateIdempotencyKey(),
      });

      console.log('✓ Payment created successfully');
      console.log(`  ID: ${response.data.id}`);
      console.log(`  Rail: ${response.data.rail}`);
      console.log(`  Amount: ${response.data.amount} ${response.data.currency}`);
      console.log(`  Status: ${response.data.status}`);
      console.log(`  Created: ${response.data.created_at}`);

      if (response.data.external_id) {
        console.log(`  External ID: ${response.data.external_id}`);
      }

      console.log(`\nNext steps:`);
      console.log(`  - Use 'peac status ${response.data.id}' to check payment status`);

      if (response.data.status === 'requires_action') {
        console.log(`  - Payment requires additional action to complete`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Details:', error.response.detail);
      }
      process.exit(1);
    }
  });

// Health check commands
program
  .command('health')
  .description('Check server health')
  .option('--server <url>', 'PEAC server URL', 'http://localhost:3000')
  .option('--check <type>', 'Health check type (liveness, readiness)', 'readiness')
  .action(async (options) => {
    try {
      const client = new Client({ baseUrl: options.server });

      console.log(`Checking ${options.check}...`);

      let response;
      if (options.check === 'liveness') {
        response = await client.getLiveness();
      } else {
        response = await client.getReadiness();
      }

      const health = response.data;

      console.log(`\n${options.check === 'liveness' ? 'Liveness' : 'Readiness'} Check Results`);
      console.log('─'.repeat(40));
      console.log(`  Overall Status: ${health.status}`);
      console.log(`  Timestamp: ${health.timestamp}`);
      console.log(`  Uptime: ${health.uptime_seconds}s`);

      if (health.checks && health.checks.length > 0) {
        console.log('\n  Component Checks:');
        health.checks.forEach((check) => {
          const icon = check.status === 'pass' ? '✓' : '✗';
          console.log(`    ${icon} ${check.name}: ${check.status}`);

          if (check.duration_ms !== undefined) {
            console.log(`      Duration: ${check.duration_ms}ms`);
          }

          if (check.details && Object.keys(check.details).length > 0) {
            console.log(`      Details: ${JSON.stringify(check.details, null, 6)}`);
          }
        });
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Details:', error.response.detail);
      }
      process.exit(1);
    }
  });

// Helper functions
async function getTemplate(type) {
  const templates = {
    minimal: {
      version: '0.9.2',
      protocol: 'peac',
      peac: {
        consent: {
          ai_training: 'conditional',
        },
        economics: {
          pricing: '$0.01/gb',
        },
        attribution: {
          required: true,
        },
      },
    },
    standard: {
      version: '0.9.2',
      protocol: 'peac',
      metadata: {
        domain: 'example.com',
        updated: new Date().toISOString(),
      },
      peac: {
        consent: {
          default: 'contact',
          ai_training: {
            allowed: 'conditional',
            conditions: [{ payment_required: true }, { attribution_required: true }],
          },
          web_scraping: {
            allowed: true,
          },
          commercial_use: {
            allowed: 'negotiable',
          },
        },
        economics: {
          pricing_models: {
            usage_based: {
              per_gb: '$0.01',
              per_request: '$0.001',
            },
          },
          payment_processors: {
            stripe: {
              endpoint: 'https://pay.example.com/stripe',
            },
          },
        },
        attribution: {
          required: true,
          format: 'Source: {url}',
        },
        compliance: {
          jurisdictions: {
            us: {
              ccpa: true,
            },
            eu: {
              gdpr: true,
              ai_act: true,
            },
          },
        },
      },
    },
    full: {
      version: '0.9.2',
      protocol: 'peac',
      metadata: {
        domain: 'example.com',
        updated: new Date().toISOString(),
        languages: ['en', 'es', 'zh'],
      },
      peac: {
        consent: {
          default: 'contact',
          ai_training: {
            allowed: 'conditional',
            conditions: [
              { payment_required: true },
              { attribution_required: true },
              { purpose_limitation: ['research', 'commercial'] },
            ],
            negotiate: 'https://api.example.com/negotiate/ai-training',
          },
          web_scraping: {
            allowed: true,
            rate_limit: '100/hour',
          },
          commercial_use: {
            allowed: 'negotiable',
            contact: 'licensing@example.com',
          },
        },
        economics: {
          currency: ['USD', 'EUR', 'USDB'],
          pricing_models: {
            flat_rate: {
              monthly: '$1000',
              annual: '$10000',
            },
            usage_based: {
              per_gb: '$0.01',
              per_request: '$0.001',
              per_minute: '$0.10',
            },
            dynamic: {
              endpoint: '/pricing/dynamic',
              cache_ttl: 3600,
            },
          },
          payment_processors: {
            stripe: {
              endpoint: 'https://pay.example.com/stripe',
              public_key: 'pk_live_example',
              agent_pay: true,
            },
            bridge: {
              endpoint: 'https://api.bridge.xyz/orchestration/send',
              public_key: 'bridge_pk_example',
            },
            paypal: {
              endpoint: 'https://api.example.com/paypal',
              stablecoin: 'PYUSD',
            },
            x402: 'https://pay.example.com/x402',
          },
        },
        negotiation: {
          enabled: true,
          endpoint: 'https://api.example.com/negotiate',
          protocols: ['peac-negotiate/v1'],
          templates: {
            bulk_discount: {
              threshold: '1TB',
              discount: '20%',
            },
            academic: {
              verification: 'required',
              discount: '50%',
            },
          },
        },
        attribution: {
          required: true,
          chain_depth: 'unlimited',
          format: '{source} via {aggregator}',
          verification_endpoint: 'https://api.example.com/verify/attribution',
          blockchain_anchor: true,
        },
        compliance: {
          jurisdictions: {
            us: {
              ccpa: true,
              state_specific: {
                ca: true,
                va: true,
              },
            },
            eu: {
              gdpr: true,
              ai_act: true,
              data_retention: 'P90D',
              dpo_contact: 'dpo@example.eu',
            },
            china: {
              pipl: true,
              data_localization: true,
            },
          },
        },
        dispute: {
          contact: 'legal@example.com',
          endpoint: 'https://api.example.com/dispute',
          arbitration: 'binding',
          jurisdiction: 'Delaware, USA',
        },
        audit: {
          endpoint: 'https://api.example.com/audit',
          real_time: true,
          retention: 'P365D',
          webhooks: 'https://api.example.com/webhooks',
        },
        rate_limits: {
          default: '1000/hour',
          by_use_case: {
            ai_training: '100/hour',
            api_access: '10000/hour',
          },
        },
        discovery: {
          sitemap: '/sitemap-usage.xml',
          endpoints: '/api/catalog',
          mobile: {
            ios: 'peacprotocol://policy',
            android: 'content://com.example/peac',
          },
          iot: {
            mqtt: 'device/+/peac',
            coap: '/.well-known/peac',
          },
        },
        geographic_policies: {
          default: 'us',
          overrides: {
            eu: '/peac-eu.txt',
            cn: '/peac-cn.txt',
          },
        },
        extensions: {
          ai_control: true,
          zk_proofs: 'https://api.example.com/zk',
          ipfs_hash: 'QmExample...',
          langchain: true,
          crewai: true,
        },
      },
    },
  };

  return templates[type] || templates.standard;
}

// Parse and execute
program.parse();
