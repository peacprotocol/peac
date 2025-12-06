#!/usr/bin/env node

/**
 * PEAC Protocol CLI v0.9.2
 * Command-line interface for PEAC Protocol operations
 * @license Apache-2.0
 */

const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { UniversalParser, Crypto, Payments, Negotiation, version } = require('../sdk');

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
  $ peac negotiate example.com   Negotiate terms with a publisher
  $ peac pay --provider stripe   Process a payment

For more information, visit https://peacprotocol.org/docs`
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

      console.log(`[OK] Created ${options.output}`);
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

      console.log('[OK] Valid peac file');

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
      console.error('[FAIL] Invalid:', error.message);
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

        console.log(`[OK] Generated keypair:`);
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

      console.log(`[OK] Signed ${file}`);
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

      console.log('\n[OK] Policy scan complete');
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
        version: '0.9.2',
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

      console.log(`[OK] Migrated to ${options.output}`);
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

// Negotiate command
program
  .command('negotiate <domain>')
  .description('Negotiate terms with a publisher')
  .option('-u, --use-case <use>', 'Use case (ai_training, api_access, web_scraping)', 'ai_training')
  .option('-v, --volume <volume>', 'Data volume (e.g., 100GB, 1TB)', '100GB')
  .option('-b, --budget <budget>', 'Budget in USD', '1000')
  .option('-d, --duration <duration>', 'Duration (e.g., 30 days, 1 year)', '30 days')
  .option('-a, --academic', 'Request academic discount')
  .option('-s, --startup', 'Request startup discount')
  .option('--framework <framework>', 'Agent framework (openai, langchain, crewai)')
  .action(async (domain, options) => {
    try {
      console.log(`\nNegotiating with ${domain}...`);

      // Parse peac
      const parser = new UniversalParser();
      const peac = await parser.parseAll(domain);

      // Check if negotiation is available
      if (!peac.peac?.negotiation?.enabled && !peac.peac?.negotiation?.endpoint) {
        console.log('[WARN] Negotiation not available for this publisher');
        console.log(`  Contact: ${peac.peac?.dispute?.contact || 'Not provided'}`);
        process.exit(1);
      }

      // Prepare proposal
      const proposal = {
        use_case: options.useCase,
        volume: options.volume,
        budget: parseFloat(options.budget),
        duration: options.duration,
        attribution_commitment: true,
        academic_verification: options.academic || undefined,
        startup_verification: options.startup || undefined,
        framework: options.framework,
      };

      console.log('Proposal:');
      Object.entries(proposal).forEach(([key, value]) => {
        if (value !== undefined) {
          console.log(`  ${key}: ${value}`);
        }
      });

      // Negotiate
      const negotiation = new Negotiation(peac);
      const result = await negotiation.negotiate(proposal);

      if (result.accepted) {
        console.log('\n[OK] Negotiation successful!');
        console.log('\nAccepted Terms:');
        console.log(`  Peac ID: ${result.peac_id}`);
        console.log(`  Price: $${result.terms.price} ${result.terms.currency}`);
        console.log(`  Volume: ${result.terms.volume}`);
        console.log(`  Duration: ${result.terms.duration}`);
        console.log(`  Expires: ${new Date(result.terms.expires).toLocaleDateString()}`);

        if (result.terms.payment_link) {
          console.log(`  Payment: ${result.terms.payment_link}`);
        }

        if (result.terms.attribution_required) {
          console.log(`  Attribution: Required (${result.terms.attribution_format})`);
        }
      } else {
        console.log('\n[WARN] Negotiation not accepted');
        console.log(`Reason: ${result.reason}`);

        if (result.counter_offer) {
          console.log('\nCounter Offer:');
          console.log(`  Suggested budget: $${result.counter_offer.suggested_budget}`);
          console.log(`  Minimum budget: $${result.counter_offer.minimum_budget}`);
          console.log(`  For your budget: ${result.counter_offer.suggested_volume}`);

          if (result.counter_offer.available_discounts?.length > 0) {
            console.log(`  Available discounts:`);
            result.counter_offer.available_discounts.forEach((d) => {
              console.log(`    - ${d.type}: ${d.discount}`);
            });
          }

          if (result.counter_offer.human_contact) {
            console.log(`  Contact: ${result.counter_offer.human_contact}`);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Pay command
program
  .command('pay')
  .description('Process a payment')
  .option('-d, --domain <domain>', 'Domain to pay')
  .option('-p, --provider <provider>', 'Payment provider (stripe, bridge, paypal, x402)', 'stripe')
  .option('-a, --amount <amount>', 'Amount to pay')
  .option('-u, --use-case <use>', 'Purpose of payment', 'ai_training')
  .option('-c, --currency <currency>', 'Currency', 'usd')
  .action(async (options) => {
    try {
      if (!options.domain || !options.amount) {
        console.error('Error: --domain and --amount are required');
        process.exit(1);
      }

      console.log(`\nProcessing payment to ${options.domain}...`);

      // Parse peac
      const parser = new UniversalParser();
      const peac = await parser.parseAll(options.domain);

      // Initialize payments
      const payments = new Payments(peac);

      // Process payment
      const result = await payments.processPayment({
        amount: parseFloat(options.amount),
        currency: options.currency,
        purpose: options.useCase,
        processor: options.provider,
      });

      console.log('\n[OK] Payment initiated');
      console.log(`  Processor: ${result.processor}`);
      console.log(`  Payment ID: ${result.payment_id}`);
      console.log(`  Amount: $${result.amount} ${result.currency}`);
      console.log(`  Status: ${result.status}`);

      if (result.client_secret) {
        console.log(`  Client Secret: ${result.client_secret.substring(0, 20)}...`);
      }
    } catch (error) {
      console.error('Error:', error.message);
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
