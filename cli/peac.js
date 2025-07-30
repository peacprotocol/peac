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
const chalk = require('chalk');
const { 
  UniversalParser, 
  Crypto, 
  Payments, 
  Negotiation,
  version 
} = require('../sdk');

// Configure CLI
program
  .name('peac')
  .description('PEAC Protocol CLI - Manage digital pacts for the automated economy')
  .version(version)
  .addHelpText('after', `
Examples:
  $ peac init                     Create a new pact.txt file
  $ peac validate pact.txt        Validate a pact file
  $ peac sign pact.txt           Sign a pact file
  $ peac parse example.com       Parse pact from a domain
  $ peac scan example.com        Scan all policy files
  $ peac migrate robots.txt      Migrate from legacy format
  $ peac negotiate example.com   Negotiate terms with a publisher
  $ peac pay --provider stripe   Process a payment

For more information, visit https://peacprotocol.org/docs`);

// Init command
program
  .command('init')
  .description('Initialize a new pact.txt file')
  .option('-t, --type <type>', 'Type of pact (minimal, standard, full)', 'standard')
  .option('-o, --output <file>', 'Output file', 'pact.txt')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (options) => {
    try {
      let template;
      
      if (options.interactive) {
        // Interactive mode would walk through options
        console.log(chalk.blue('Interactive mode coming soon...'));
        template = await getTemplate(options.type);
      } else {
        template = await getTemplate(options.type);
      }
      
      const yamlContent = yaml.dump(template, { 
        lineWidth: -1,
        noRefs: true
      });
      
      await fs.writeFile(options.output, yamlContent);
      
      console.log(chalk.green(`✓ Created ${options.output}`));
      console.log(chalk.gray(`  Type: ${options.type}`));
      console.log(chalk.gray(`  Next steps:`));
      console.log(chalk.gray(`    1. Edit ${options.output} to customize your terms`));
      console.log(chalk.gray(`    2. Run 'peac sign ${options.output}' to sign it`));
      console.log(chalk.gray(`    3. Deploy to your-domain.com/${options.output}`));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate <file>')
  .description('Validate a pact file')
  .option('-s, --strict', 'Strict validation')
  .option('-v, --verbose', 'Verbose output')
  .action(async (file, options) => {
    try {
      const content = await fs.readFile(file, 'utf8');
      const parser = new UniversalParser({ strict: options.strict });
      const pact = parser.parsePactContent(content);
      await parser.validatePact(pact);
      
      console.log(chalk.green('✓ Valid pact file'));
      
      if (options.verbose) {
        console.log(chalk.gray('\nDetails:'));
        console.log(chalk.gray(`  Version: ${pact.version}`));
        console.log(chalk.gray(`  Protocol: ${pact.protocol}`));
        console.log(chalk.gray(`  Signed: ${pact.signature ? 'Yes' : 'No'}`));
        
        if (parser.warnings.length > 0) {
          console.log(chalk.yellow('\nWarnings:'));
          parser.warnings.forEach(w => console.log(chalk.yellow(`  - ${w}`)));
        }
      }
    } catch (error) {
      console.error(chalk.red('✗ Invalid:'), error.message);
      process.exit(1);
    }
  });

// Sign command
program
  .command('sign <file>')
  .description('Sign a pact file with Ed25519')
  .option('-k, --key <keyfile>', 'Private key file')
  .option('-p, --passphrase <passphrase>', 'Key passphrase')
  .option('-g, --generate-key', 'Generate new keypair if needed')
  .action(async (file, options) => {
    try {
      const content = await fs.readFile(file, 'utf8');
      const pact = yaml.load(content);
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
          console.warn(chalk.yellow('Warning: Could not find public key file'));
        }
      } else if (options.generateKey) {
        // Generate new keypair
        console.log(chalk.yellow('Generating new Ed25519 keypair...'));
        const keyPair = crypto.generateKeyPair({ passphrase: options.passphrase });
        privateKey = keyPair.privateKey;
        publicKey = keyPair.publicKey;
        
        // Save keys
        const keyName = path.basename(file, path.extname(file));
        const privateKeyPath = `${keyName}-private.pem`;
        const publicKeyPath = `${keyName}-public.pem`;
        
        await fs.writeFile(privateKeyPath, privateKey);
        await fs.writeFile(publicKeyPath, publicKey);
        
        console.log(chalk.green(`✓ Generated keypair:`));
        console.log(chalk.gray(`  Private key: ${privateKeyPath}`));
        console.log(chalk.gray(`  Public key: ${publicKeyPath}`));
        console.log(chalk.yellow(`  Keep your private key secure!`));
      } else {
        console.error(chalk.red('Error: No key provided. Use --key or --generate-key'));
        process.exit(1);
      }
      
      // Add public key to metadata
      if (publicKey) {
        pact.metadata = pact.metadata || {};
        pact.metadata.public_key = publicKey;
      }
      
      // Sign the pact
      const signedPact = await crypto.signPact(pact, privateKey);
      
      // Save signed pact
      const signedContent = yaml.dump(signedPact, {
        lineWidth: -1,
        noRefs: true
      });
      await fs.writeFile(file, signedContent);
      
      console.log(chalk.green(`✓ Signed ${file}`));
      console.log(chalk.gray(`  Signature: ${signedPact.signature.substring(0, 32)}...`));
      console.log(chalk.gray(`  Algorithm: ${signedPact.signature_algorithm}`));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Parse command
program
  .command('parse <domain>')
  .description('Parse pact from a domain')
  .option('-f, --format <format>', 'Output format (json, yaml)', 'yaml')
  .option('-c, --no-cache', 'Disable caching')
  .option('-v, --verbose', 'Verbose output')
  .action(async (domain, options) => {
    try {
      const parser = new UniversalParser({ 
        cache: options.cache,
        strict: false 
      });
      
      console.log(chalk.blue(`Parsing pact from ${domain}...`));
      const pact = await parser.parse(domain);
      
      if (options.verbose && parser.warnings.length > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        parser.warnings.forEach(w => console.log(chalk.yellow(`  - ${w}`)));
      }
      
      const output = options.format === 'json' 
        ? JSON.stringify(pact, null, 2)
        : yaml.dump(pact);
        
      console.log('\n' + output);
      
      if (pact.confidence !== undefined && pact.confidence < 1) {
        console.log(chalk.yellow(`\nConfidence: ${(pact.confidence * 100).toFixed(0)}%`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
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
      
      console.log(chalk.blue(`\nScanning ${domain} for policy files...`));
      const result = await parser.parseAll(domain);
      
      console.log(chalk.green('\n✓ Policy scan complete'));
      console.log(chalk.gray('─'.repeat(50)));
      
      if (result.metadata?.sources) {
        console.log(chalk.yellow('Sources found:'));
        result.metadata.sources.forEach(source => {
          console.log(chalk.gray(`  - ${source.file || source}`));
        });
      }
      
      console.log(chalk.green('\nUnified policy:'));
      console.log(yaml.dump(result.pact, { lineWidth: -1 }));
      
      if (result.confidence !== undefined) {
        console.log(chalk.yellow(`\nConfidence: ${(result.confidence * 100).toFixed(0)}%`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Migrate command
program
  .command('migrate <file>')
  .description('Migrate from legacy format to pact.txt')
  .option('-f, --format <format>', 'Source format (robots, llms, ai, usage)', 'robots')
  .option('-o, --output <file>', 'Output file', 'pact.txt')
  .action(async (file, options) => {
    try {
      const content = await fs.readFile(file, 'utf8');
      const parser = new UniversalParser();
      
      let pact;
      const basePolicy = {
        version: '0.9.2',
        protocol: 'peac',
        metadata: {
          migrated_from: options.format,
          migrated_at: new Date().toISOString(),
          original_file: file
        }
      };
      
      console.log(chalk.blue(`Migrating from ${options.format} format...`));
      
      switch (options.format) {
        case 'robots':
          pact = { ...basePolicy, pact: parser.parseRobots(content) };
          break;
        case 'llms':
          pact = { ...basePolicy, pact: parser.parseLLMs(content) };
          break;
        case 'ai':
          pact = { ...basePolicy, pact: parser.parseAI(content) };
          break;
        case 'usage':
          pact = { ...basePolicy, pact: parser.parseUsage(content) };
          break;
        default:
          throw new Error(`Unknown format: ${options.format}`);
      }
      
      const yamlContent = yaml.dump(pact, {
        lineWidth: -1,
        noRefs: true
      });
      
      await fs.writeFile(options.output, yamlContent);
      
      console.log(chalk.green(`✓ Migrated to ${options.output}`));
      console.log(chalk.gray(`  Original format: ${options.format}`));
      console.log(chalk.gray(`  New format: PEAC Protocol v${pact.version}`));
      console.log(chalk.gray(`\nNext steps:`));
      console.log(chalk.gray(`  1. Review and enhance ${options.output}`));
      console.log(chalk.gray(`  2. Add payment processors and compliance info`));
      console.log(chalk.gray(`  3. Sign with 'peac sign ${options.output}'`));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
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
      console.log(chalk.blue(`\nNegotiating with ${domain}...`));
      
      // Parse pact
      const parser = new UniversalParser();
      const pact = await parser.parseAll(domain);
      
      // Check if negotiation is available
      if (!pact.pact?.negotiation?.enabled && !pact.pact?.negotiation?.endpoint) {
        console.log(chalk.yellow('⚠ Negotiation not available for this publisher'));
        console.log(chalk.gray(`  Contact: ${pact.pact?.dispute?.contact || 'Not provided'}`));
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
        framework: options.framework
      };
      
      console.log(chalk.gray('Proposal:'));
      Object.entries(proposal).forEach(([key, value]) => {
        if (value !== undefined) {
          console.log(chalk.gray(`  ${key}: ${value}`));
        }
      });
      
      // Negotiate
      const negotiation = new Negotiation(pact);
      const result = await negotiation.negotiate(proposal);
      
      if (result.accepted) {
        console.log(chalk.green('\n✓ Negotiation successful!'));
        console.log(chalk.white('\nAccepted Terms:'));
        console.log(chalk.gray(`  Pact ID: ${result.pact_id}`));
        console.log(chalk.gray(`  Price: $${result.terms.price} ${result.terms.currency}`));
        console.log(chalk.gray(`  Volume: ${result.terms.volume}`));
        console.log(chalk.gray(`  Duration: ${result.terms.duration}`));
        console.log(chalk.gray(`  Expires: ${new Date(result.terms.expires).toLocaleDateString()}`));
        
        if (result.terms.payment_link) {
          console.log(chalk.gray(`  Payment: ${result.terms.payment_link}`));
        }
        
        if (result.terms.attribution_required) {
          console.log(chalk.yellow(`  Attribution: Required (${result.terms.attribution_format})`));
        }
      } else {
        console.log(chalk.yellow('\n⚠ Negotiation not accepted'));
        console.log(chalk.white(`Reason: ${result.reason}`));
        
        if (result.counter_offer) {
          console.log(chalk.white('\nCounter Offer:'));
          console.log(chalk.gray(`  Suggested budget: $${result.counter_offer.suggested_budget}`));
          console.log(chalk.gray(`  Minimum budget: $${result.counter_offer.minimum_budget}`));
          console.log(chalk.gray(`  For your budget: ${result.counter_offer.suggested_volume}`));
          
          if (result.counter_offer.available_discounts?.length > 0) {
            console.log(chalk.gray(`  Available discounts:`));
            result.counter_offer.available_discounts.forEach(d => {
              console.log(chalk.gray(`    - ${d.type}: ${d.discount}`));
            });
          }
          
          if (result.counter_offer.human_contact) {
            console.log(chalk.gray(`  Contact: ${result.counter_offer.human_contact}`));
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
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
        console.error(chalk.red('Error: --domain and --amount are required'));
        process.exit(1);
      }
      
      console.log(chalk.blue(`\nProcessing payment to ${options.domain}...`));
      
      // Parse pact
      const parser = new UniversalParser();
      const pact = await parser.parseAll(options.domain);
      
      // Initialize payments
      const payments = new Payments(pact);
      
      // Process payment
      const result = await payments.processPayment({
        amount: parseFloat(options.amount),
        currency: options.currency,
        purpose: options.useCase,
        processor: options.provider
      });
      
      console.log(chalk.green('\n✓ Payment initiated'));
      console.log(chalk.gray(`  Processor: ${result.processor}`));
      console.log(chalk.gray(`  Payment ID: ${result.payment_id}`));
      console.log(chalk.gray(`  Amount: $${result.amount} ${result.currency}`));
      console.log(chalk.gray(`  Status: ${result.status}`));
      
      if (result.client_secret) {
        console.log(chalk.gray(`  Client Secret: ${result.client_secret.substring(0, 20)}...`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Helper functions
async function getTemplate(type) {
  const templates = {
    minimal: {
      version: '0.9.2',
      protocol: 'peac',
      pact: {
        consent: {
          ai_training: 'conditional'
        },
        economics: {
          pricing: '$0.01/gb'
        },
        attribution: {
          required: true
        }
      }
    },
    standard: {
      version: '0.9.2',
      protocol: 'peac',
      metadata: {
        domain: 'example.com',
        updated: new Date().toISOString()
      },
      pact: {
        consent: {
          default: 'contact',
          ai_training: {
            allowed: 'conditional',
            conditions: [
              { payment_required: true },
              { attribution_required: true }
            ]
          },
          web_scraping: {
            allowed: true
          },
          commercial_use: {
            allowed: 'negotiable'
          }
        },
        economics: {
          pricing_models: {
            usage_based: {
              per_gb: '$0.01',
              per_request: '$0.001'
            }
          },
          payment_processors: {
            stripe: {
              endpoint: 'https://pay.example.com/stripe'
            }
          }
        },
        attribution: {
          required: true,
          format: 'Source: {url}'
        },
        compliance: {
          jurisdictions: {
            us: {
              ccpa: true
            },
            eu: {
              gdpr: true,
              ai_act: true
            }
          }
        }
      }
    },
    full: {
      version: '0.9.2',
      protocol: 'peac',
      metadata: {
        domain: 'example.com',
        updated: new Date().toISOString(),
        languages: ['en', 'es', 'zh']
      },
      pact: {
        consent: {
          default: 'contact',
          ai_training: {
            allowed: 'conditional',
            conditions: [
              { payment_required: true },
              { attribution_required: true },
              { purpose_limitation: ['research', 'commercial'] }
            ],
            negotiate: 'https://api.example.com/negotiate/ai-training'
          },
          web_scraping: {
            allowed: true,
            rate_limit: '100/hour'
          },
          commercial_use: {
            allowed: 'negotiable',
            contact: 'licensing@example.com'
          }
        },
        economics: {
          currency: ['USD', 'EUR', 'USDB'],
          pricing_models: {
            flat_rate: {
              monthly: '$1000',
              annual: '$10000'
            },
            usage_based: {
              per_gb: '$0.01',
              per_request: '$0.001',
              per_minute: '$0.10'
            },
            dynamic: {
              endpoint: '/pricing/dynamic',
              cache_ttl: 3600
            }
          },
          payment_processors: {
            stripe: {
              endpoint: 'https://pay.example.com/stripe',
              public_key: 'pk_live_example',
              agent_pay: true
            },
            bridge: {
              endpoint: 'https://api.bridge.xyz/orchestration/send',
              public_key: 'bridge_pk_example'
            },
            paypal: {
              endpoint: 'https://api.example.com/paypal',
              stablecoin: 'PYUSD'
            },
            x402: 'https://pay.example.com/x402'
          }
        },
        negotiation: {
          enabled: true,
          endpoint: 'https://api.example.com/negotiate',
          protocols: ['peac-negotiate/v1'],
          templates: {
            bulk_discount: {
              threshold: '1TB',
              discount: '20%'
            },
            academic: {
              verification: 'required',
              discount: '50%'
            }
          }
        },
        attribution: {
          required: true,
          chain_depth: 'unlimited',
          format: '{source} via {aggregator}',
          verification_endpoint: 'https://api.example.com/verify/attribution',
          blockchain_anchor: true
        },
        compliance: {
          jurisdictions: {
            us: {
              ccpa: true,
              state_specific: {
                ca: true,
                va: true
              }
            },
            eu: {
              gdpr: true,
              ai_act: true,
              data_retention: 'P90D',
              dpo_contact: 'dpo@example.eu'
            },
            china: {
              pipl: true,
              data_localization: true
            }
          }
        },
        dispute: {
          contact: 'legal@example.com',
          endpoint: 'https://api.example.com/dispute',
          arbitration: 'binding',
          jurisdiction: 'Delaware, USA'
        },
        audit: {
          endpoint: 'https://api.example.com/audit',
          real_time: true,
          retention: 'P365D',
          webhooks: 'https://api.example.com/webhooks'
        },
        rate_limits: {
          default: '1000/hour',
          by_use_case: {
            ai_training: '100/hour',
            api_access: '10000/hour'
          }
        },
        discovery: {
          sitemap: '/sitemap-usage.xml',
          endpoints: '/api/catalog',
          mobile: {
            ios: 'peacprotocol://policy',
            android: 'content://com.example/pact'
          },
          iot: {
            mqtt: 'device/+/pact',
            coap: '/.well-known/pact'
          }
        },
        geographic_policies: {
          default: 'us',
          overrides: {
            eu: '/pact-eu.txt',
            cn: '/pact-cn.txt'
          }
        },
        extensions: {
          ai_control: true,
          zk_proofs: 'https://api.example.com/zk',
          ipfs_hash: 'QmExample...',
          langchain: true,
          crewai: true
        }
      }
    }
  };
  
  return templates[type] || templates.standard;
}

// Parse and execute
program.parse();