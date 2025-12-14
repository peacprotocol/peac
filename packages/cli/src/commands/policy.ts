/**
 * PEAC Policy CLI Commands
 *
 * Commands for managing policy files:
 * - init: Create a new policy file
 * - validate: Validate policy syntax and schema
 * - explain: Debug rule matching
 * - generate: Compile policy to deployment artifacts
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadPolicy,
  parsePolicy,
  validatePolicy,
  evaluate,
  explainMatches,
  createExamplePolicy,
  serializePolicyYaml,
  serializePolicyJson,
  compilePeacTxt,
  compileRobotsSnippet,
  compileAiprefTemplates,
  renderPolicyMarkdown,
  PolicyLoadError,
  PolicyValidationError,
  POLICY_VERSION,
  EvaluationContext,
  ControlPurpose,
  ControlLicensingMode,
  SubjectType,
} from '@peac/policy-kit';

const policy = new Command('policy').description('Policy file operations');

/**
 * peac policy init
 *
 * Create a new peac-policy.yaml file in the current directory.
 */
policy
  .command('init')
  .description('Create a new PEAC policy file')
  .option('-f, --format <format>', 'Output format (yaml or json)', 'yaml')
  .option('-o, --output <file>', 'Output file path', 'peac-policy.yaml')
  .option('--force', 'Overwrite existing file')
  .action((options: { format?: string; output?: string; force?: boolean }) => {
    try {
      const format = options.format?.toLowerCase() || 'yaml';
      const outputPath =
        options.output || (format === 'json' ? 'peac-policy.json' : 'peac-policy.yaml');

      // Check if file exists and --force not set
      if (fs.existsSync(outputPath) && !options.force) {
        console.error(`Error: File already exists: ${outputPath}`);
        console.error('Use --force to overwrite.');
        process.exit(1);
      }

      const example = createExamplePolicy();
      const content =
        format === 'json' ? serializePolicyJson(example) : serializePolicyYaml(example);

      fs.writeFileSync(outputPath, content, 'utf-8');
      console.log(`Created policy file: ${outputPath}`);
      console.log('');
      console.log('Next steps:');
      console.log('  1. Edit the policy file to define your access rules');
      console.log('  2. Validate with: peac policy validate ' + outputPath);
      console.log('  3. Generate artifacts with: peac policy generate ' + outputPath);

      process.exit(0);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

/**
 * peac policy validate <file>
 */
policy
  .command('validate')
  .description('Validate a PEAC policy file (YAML or JSON)')
  .argument('<file>', 'Path to policy file')
  .option('-v, --verbose', 'Show detailed validation output')
  .action((file: string, options: { verbose?: boolean }) => {
    try {
      console.log(`Validating policy file: ${file}\n`);

      const policyDoc = loadPolicy(file);

      console.log('Policy is valid!\n');

      console.log('Policy Information:');
      console.log(`   Version:  ${policyDoc.version}`);
      if (policyDoc.name) {
        console.log(`   Name:     ${policyDoc.name}`);
      }
      console.log(`   Default:  ${policyDoc.defaults.decision}`);
      console.log(`   Rules:    ${policyDoc.rules.length}`);

      if (options.verbose && policyDoc.rules.length > 0) {
        console.log('\nRules:');
        for (const rule of policyDoc.rules) {
          console.log(`   - ${rule.name}: ${rule.decision}`);
          if (rule.subject) {
            const parts: string[] = [];
            if (rule.subject.type) {
              const types = Array.isArray(rule.subject.type)
                ? rule.subject.type.join('|')
                : rule.subject.type;
              parts.push(`type=${types}`);
            }
            if (rule.subject.labels) {
              parts.push(`labels=[${rule.subject.labels.join(',')}]`);
            }
            if (rule.subject.id) {
              parts.push(`id=${rule.subject.id}`);
            }
            if (parts.length > 0) {
              console.log(`       subject: ${parts.join(', ')}`);
            }
          }
          if (rule.purpose) {
            const purposes = Array.isArray(rule.purpose) ? rule.purpose.join('|') : rule.purpose;
            console.log(`       purpose: ${purposes}`);
          }
          if (rule.licensing_mode) {
            const modes = Array.isArray(rule.licensing_mode)
              ? rule.licensing_mode.join('|')
              : rule.licensing_mode;
            console.log(`       licensing_mode: ${modes}`);
          }
        }
      }

      process.exit(0);
    } catch (err) {
      if (err instanceof PolicyValidationError) {
        console.error('Policy validation failed:\n');
        for (const issue of err.issues) {
          console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
        }
        process.exit(1);
      } else if (err instanceof PolicyLoadError) {
        console.error(`Failed to load policy: ${err.message}`);
        process.exit(1);
      } else {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  });

/**
 * peac policy generate <file>
 *
 * Generate deployment artifacts from a policy file:
 * - peac.txt (PEAC discovery file)
 * - robots.txt snippet
 * - AIPREF header templates
 * - ai-policy.md (human-readable summary)
 */
policy
  .command('generate')
  .description('Generate deployment artifacts from a policy file')
  .argument('<file>', 'Path to policy file')
  .option('-o, --out <dir>', 'Output directory', 'dist')
  .option('--well-known', 'Output peac.txt to .well-known/ subdirectory')
  .option('--site-url <url>', 'Site URL for peac.txt')
  .option('--contact <email>', 'Contact email for policy questions')
  .option('--attribution <mode>', 'Attribution requirement (required, optional, none)')
  .option('--rate-limit <limit>', 'Rate limit string (e.g., "100/hour")')
  .option('--negotiate <url>', 'Negotiate endpoint URL')
  .option('--no-comments', 'Omit comments from generated files')
  .action(
    (
      file: string,
      options: {
        out: string;
        wellKnown?: boolean;
        siteUrl?: string;
        contact?: string;
        attribution?: 'required' | 'optional' | 'none';
        rateLimit?: string;
        negotiate?: string;
        comments?: boolean;
      }
    ) => {
      try {
        console.log(`Loading policy: ${file}\n`);
        const policyDoc = loadPolicy(file);

        // Create output directory if needed
        const outDir = options.out;
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        const compileOptions = {
          siteUrl: options.siteUrl,
          contact: options.contact,
          attribution: options.attribution,
          rateLimit: options.rateLimit,
          negotiateUrl: options.negotiate,
          includeComments: options.comments !== false,
        };

        // Generate peac.txt (optionally in .well-known/)
        const peacTxt = compilePeacTxt(policyDoc, compileOptions);
        let peacTxtPath: string;
        if (options.wellKnown) {
          const wellKnownDir = path.join(outDir, '.well-known');
          if (!fs.existsSync(wellKnownDir)) {
            fs.mkdirSync(wellKnownDir, { recursive: true });
          }
          peacTxtPath = path.join(wellKnownDir, 'peac.txt');
        } else {
          peacTxtPath = path.join(outDir, 'peac.txt');
        }
        fs.writeFileSync(peacTxtPath, peacTxt, 'utf-8');
        console.log(`Generated: ${peacTxtPath}`);

        // Generate robots.txt snippet
        const robotsTxt = compileRobotsSnippet(policyDoc, compileOptions);
        const robotsPath = path.join(outDir, 'robots-ai-snippet.txt');
        fs.writeFileSync(robotsPath, robotsTxt, 'utf-8');
        console.log(`Generated: ${robotsPath}`);

        // Generate AIPREF templates
        const aiprefTemplates = compileAiprefTemplates(policyDoc, compileOptions);
        const aiprefPath = path.join(outDir, 'aipref-headers.json');
        fs.writeFileSync(aiprefPath, JSON.stringify(aiprefTemplates, null, 2), 'utf-8');
        console.log(`Generated: ${aiprefPath}`);

        // Generate ai-policy.md
        const markdown = renderPolicyMarkdown(policyDoc, compileOptions);
        const mdPath = path.join(outDir, 'ai-policy.md');
        fs.writeFileSync(mdPath, markdown, 'utf-8');
        console.log(`Generated: ${mdPath}`);

        console.log('');
        console.log('Deployment instructions:');
        if (options.wellKnown) {
          console.log(`  1. Deploy ${peacTxtPath} to serve at /.well-known/peac.txt`);
        } else {
          console.log(`  1. Copy ${peacTxtPath} to /.well-known/peac.txt`);
        }
        console.log(`  2. Append ${robotsPath} to your robots.txt`);
        console.log(`  3. Add headers from ${aiprefPath} to your server config`);
        console.log(`  4. Publish ${mdPath} for human reference`);

        process.exit(0);
      } catch (err) {
        if (err instanceof PolicyLoadError) {
          console.error(`Failed to load policy: ${err.message}`);
          process.exit(1);
        } else {
          console.error('Error:', err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    }
  );

/**
 * peac policy explain <file>
 *
 * Debug tool: explain which rule would apply for a given context.
 */
policy
  .command('explain')
  .description('Explain which rule would apply for a given context')
  .argument('<file>', 'Path to policy file')
  .option('-t, --type <type>', 'Subject type (human, org, agent)')
  .option('-l, --labels <labels>', 'Subject labels (comma-separated)')
  .option('-i, --id <id>', 'Subject ID')
  .option(
    '-p, --purpose <purpose>',
    'Access purpose (crawl, index, train, inference, ai_input, ai_search, search)'
  )
  .option(
    '-m, --licensing-mode <mode>',
    'Licensing mode (subscription, pay_per_crawl, pay_per_inference)'
  )
  .option('--all-matches', 'Show all matching rules, not just the first')
  .action(
    (
      file: string,
      options: {
        type?: string;
        labels?: string;
        id?: string;
        purpose?: string;
        licensingMode?: string;
        allMatches?: boolean;
      }
    ) => {
      try {
        const policyDoc = loadPolicy(file);

        // Build evaluation context from options
        const context: EvaluationContext = {};

        if (options.type || options.labels || options.id) {
          context.subject = {};
          if (options.type) {
            context.subject.type = options.type as SubjectType;
          }
          if (options.labels) {
            context.subject.labels = options.labels.split(',').map((l) => l.trim());
          }
          if (options.id) {
            context.subject.id = options.id;
          }
        }

        if (options.purpose) {
          context.purpose = options.purpose as ControlPurpose;
        }

        if (options.licensingMode) {
          context.licensing_mode = options.licensingMode as ControlLicensingMode;
        }

        console.log('Evaluation Context:');
        if (context.subject) {
          console.log(`   Subject: ${JSON.stringify(context.subject)}`);
        } else {
          console.log('   Subject: (any)');
        }
        console.log(`   Purpose: ${context.purpose || '(any)'}`);
        console.log(`   Licensing Mode: ${context.licensing_mode || '(any)'}`);
        console.log();

        if (options.allMatches) {
          const matches = explainMatches(policyDoc, context);
          console.log(`Matching Rules (${matches.length}):`);
          for (const match of matches) {
            if (match === '[default]') {
              console.log(`   - [default] -> ${policyDoc.defaults.decision}`);
            } else {
              const rule = policyDoc.rules.find((r) => r.name === match);
              if (rule) {
                console.log(`   - ${rule.name} -> ${rule.decision}`);
              }
            }
          }
        } else {
          const result = evaluate(policyDoc, context);
          console.log('Result:');
          console.log(`   Decision: ${result.decision}`);
          if (result.matched_rule) {
            console.log(`   Matched Rule: ${result.matched_rule}`);
          } else {
            console.log('   Matched Rule: (default)');
          }
          if (result.reason) {
            console.log(`   Reason: ${result.reason}`);
          }
        }

        process.exit(0);
      } catch (err) {
        if (err instanceof PolicyLoadError) {
          console.error(`Failed to load policy: ${err.message}`);
          process.exit(1);
        } else {
          console.error('Error:', err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    }
  );

export { policy };
