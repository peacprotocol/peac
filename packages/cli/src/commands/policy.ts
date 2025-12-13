/**
 * PEAC Policy CLI Commands
 *
 * Commands for validating and explaining policy files.
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
            const purposes = Array.isArray(rule.purpose)
              ? rule.purpose.join('|')
              : rule.purpose;
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
 * peac policy explain <file>
 */
policy
  .command('explain')
  .description('Explain which rule would apply for a given context')
  .argument('<file>', 'Path to policy file')
  .option('-t, --type <type>', 'Subject type (human, org, agent)')
  .option('-l, --labels <labels>', 'Subject labels (comma-separated)')
  .option('-i, --id <id>', 'Subject ID')
  .option('-p, --purpose <purpose>', 'Access purpose (crawl, index, train, inference, ai_input, ai_search, search)')
  .option('-m, --licensing-mode <mode>', 'Licensing mode (subscription, pay_per_crawl, pay_per_inference)')
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

/**
 * peac policy example
 */
policy
  .command('example')
  .description('Generate an example policy file')
  .option('-f, --format <format>', 'Output format (yaml or json)', 'yaml')
  .option('-o, --output <file>', 'Output file path (default: stdout)')
  .action((options: { format?: string; output?: string }) => {
    try {
      const example = createExamplePolicy();
      const format = options.format?.toLowerCase() || 'yaml';
      const content =
        format === 'json' ? serializePolicyJson(example) : serializePolicyYaml(example);

      if (options.output) {
        fs.writeFileSync(options.output, content, 'utf-8');
        console.log(`Example policy written to: ${options.output}`);
      } else {
        console.log(content);
      }

      process.exit(0);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export { policy };
