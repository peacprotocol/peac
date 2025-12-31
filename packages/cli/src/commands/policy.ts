/**
 * PEAC Policy CLI Commands
 *
 * Commands for managing policy files:
 * - init: Create a new policy file
 * - validate: Validate policy syntax and schema
 * - explain: Debug rule matching
 * - generate: Compile policy to deployment artifacts
 * - list-profiles: List available policy profiles (v0.9.23+)
 * - show-profile: Show profile details (v0.9.23+)
 *
 * Automation flags (v0.9.23+):
 * - --json: Machine-readable JSON output
 * - --yes: Skip confirmation prompts (auto-confirm)
 * - --strict: Exit non-zero on warnings
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
  // Profile system (v0.9.23+)
  listProfiles,
  loadProfile,
  getProfileSummary,
  validateProfileParams,
  customizeProfile,
  ProfileError,
  type ProfileId,
} from '@peac/policy-kit';

/**
 * Global options for policy commands
 */
interface PolicyGlobalOptions {
  json?: boolean;
  yes?: boolean;
  strict?: boolean;
}

/**
 * Get global options from parent command
 */
function getGlobalOptions(cmd: Command): PolicyGlobalOptions {
  const parent = cmd.parent;
  if (!parent) return {};
  return parent.opts() as PolicyGlobalOptions;
}

/**
 * Output result - handles JSON vs human-readable format
 */
function output(
  data: Record<string, unknown>,
  opts: PolicyGlobalOptions,
  humanMessage?: string
): void {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (humanMessage) {
    console.log(humanMessage);
  }
}

/**
 * Output error - handles JSON vs human-readable format
 */
function outputError(
  error: string,
  details: Record<string, unknown>,
  opts: PolicyGlobalOptions
): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: false, error, ...details }, null, 2));
  } else {
    console.error(`Error: ${error}`);
  }
}

const policy = new Command('policy')
  .description('Policy file operations')
  .option('--json', 'Output in machine-readable JSON format')
  .option('--yes', 'Skip confirmation prompts (auto-confirm)')
  .option('--strict', 'Exit non-zero on warnings');

/**
 * peac policy init
 *
 * Create a new peac-policy.yaml file in the current directory.
 */
policy
  .command('init')
  .description('Create a new PEAC policy file')
  .option('-f, --format <format>', 'Output format (yaml or json)', 'yaml')
  .option('-o, --output <file>', 'Output file path')
  .option('--force', 'Overwrite existing file')
  .option('--profile <id>', 'Use a pre-built profile as template')
  .action(
    (
      options: { format?: string; output?: string; force?: boolean; profile?: string },
      cmd: Command
    ) => {
      const globalOpts = getGlobalOptions(cmd);

      try {
        const format = options.format?.toLowerCase() || 'yaml';
        const outputPath =
          options.output || (format === 'json' ? 'peac-policy.json' : 'peac-policy.yaml');

        // Check if file exists and --force/--yes not set
        if (fs.existsSync(outputPath) && !options.force && !globalOpts.yes) {
          outputError(
            `File already exists: ${outputPath}`,
            { path: outputPath, hint: 'Use --force or --yes to overwrite' },
            globalOpts
          );
          process.exit(1);
        }

        let content: string;
        let policyName: string;

        if (options.profile) {
          // Use profile as template
          try {
            const profile = loadProfile(options.profile as ProfileId);
            const policyDoc = profile.policy;
            content =
              format === 'json' ? serializePolicyJson(policyDoc) : serializePolicyYaml(policyDoc);
            policyName = profile.name;
          } catch (err) {
            if (err instanceof ProfileError) {
              outputError(err.message, { code: err.code, profile: options.profile }, globalOpts);
              process.exit(1);
            }
            throw err;
          }
        } else {
          const example = createExamplePolicy();
          content = format === 'json' ? serializePolicyJson(example) : serializePolicyYaml(example);
          policyName = 'Example Policy';
        }

        fs.writeFileSync(outputPath, content, 'utf-8');

        if (globalOpts.json) {
          output(
            {
              success: true,
              file: outputPath,
              format,
              profile: options.profile || null,
              policyName,
            },
            globalOpts
          );
        } else {
          console.log(`Created policy file: ${outputPath}`);
          if (options.profile) {
            console.log(`Based on profile: ${options.profile}`);
          }
          console.log('');
          console.log('Next steps:');
          console.log('  1. Edit the policy file to define your access rules');
          console.log('  2. Validate with: peac policy validate ' + outputPath);
          console.log('  3. Generate artifacts with: peac policy generate ' + outputPath);
        }

        process.exit(0);
      } catch (err) {
        outputError(err instanceof Error ? err.message : String(err), {}, globalOpts);
        process.exit(1);
      }
    }
  );

/**
 * peac policy validate <file>
 */
policy
  .command('validate')
  .description('Validate a PEAC policy file (YAML or JSON)')
  .argument('<file>', 'Path to policy file')
  .option('-v, --verbose', 'Show detailed validation output')
  .action((file: string, options: { verbose?: boolean }, cmd: Command) => {
    const globalOpts = getGlobalOptions(cmd);
    const warnings: string[] = [];

    try {
      const policyDoc = loadPolicy(file);

      // Collect any warnings (e.g., deprecated features)
      // Currently no warnings defined, but this is the pattern for future use

      const result = {
        success: true,
        file,
        valid: true,
        warnings,
        policy: {
          version: policyDoc.version,
          name: policyDoc.name || null,
          defaultDecision: policyDoc.defaults.decision,
          ruleCount: policyDoc.rules.length,
          rules: options.verbose
            ? policyDoc.rules.map((r) => ({
                name: r.name,
                decision: r.decision,
                subject: r.subject || null,
                purpose: r.purpose || null,
                licensingMode: r.licensing_mode || null,
              }))
            : undefined,
        },
      };

      if (globalOpts.json) {
        output(result, globalOpts);
      } else {
        console.log(`Validating policy file: ${file}\n`);
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

        if (warnings.length > 0) {
          console.log('\nWarnings:');
          for (const warning of warnings) {
            console.log(`   - ${warning}`);
          }
        }
      }

      // Exit with non-zero if --strict and there are warnings
      if (globalOpts.strict && warnings.length > 0) {
        process.exit(1);
      }

      process.exit(0);
    } catch (err) {
      if (err instanceof PolicyValidationError) {
        const issues = err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }));

        if (globalOpts.json) {
          output(
            {
              success: false,
              file,
              valid: false,
              error: 'Validation failed',
              issues,
            },
            globalOpts
          );
        } else {
          console.error('Policy validation failed:\n');
          for (const issue of err.issues) {
            console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
          }
        }
        process.exit(1);
      } else if (err instanceof PolicyLoadError) {
        outputError(`Failed to load policy: ${err.message}`, { file }, globalOpts);
        process.exit(1);
      } else {
        outputError(err instanceof Error ? err.message : String(err), {}, globalOpts);
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
  .option('-o, --out <dir>', 'Output directory (use "-" for stdout)', 'dist')
  .option('--well-known', 'Output peac.txt to .well-known/ subdirectory')
  .option('--dry-run', 'Show what would be generated without writing files')
  .option('--peac-version <version>', 'PEAC protocol version (default: 0.9)')
  .option('--site-url <url>', 'Site URL for peac.txt')
  .option('--contact <email>', 'Contact email for policy questions')
  .option('--attribution <mode>', 'Attribution requirement (required, optional, none)')
  .option('--receipts <mode>', 'Receipts requirement (required, optional, omit)')
  .option('--rate-limit <limit>', 'Rate limit string (e.g., "100/hour", "unlimited")')
  .option('--negotiate <url>', 'Negotiate endpoint URL')
  .option('--no-comments', 'Omit comments from generated files')
  .action(
    (
      file: string,
      options: {
        out: string;
        wellKnown?: boolean;
        dryRun?: boolean;
        peacVersion?: string;
        siteUrl?: string;
        contact?: string;
        attribution?: 'required' | 'optional' | 'none';
        receipts?: 'required' | 'optional' | 'omit';
        rateLimit?: string;
        negotiate?: string;
        comments?: boolean;
      },
      cmd: Command
    ) => {
      const globalOpts = getGlobalOptions(cmd);
      const isStdout = options.out === '-';

      try {
        if (!globalOpts.json && !isStdout) {
          console.log(`Loading policy: ${file}\n`);
        }

        const policyDoc = loadPolicy(file);

        const compileOptions = {
          peacVersion: options.peacVersion,
          siteUrl: options.siteUrl,
          contact: options.contact,
          attribution: options.attribution,
          receipts: options.receipts,
          rateLimit: options.rateLimit,
          negotiateUrl: options.negotiate,
          includeComments: options.comments !== false,
        };

        // Generate content
        const peacTxt = compilePeacTxt(policyDoc, compileOptions);
        const robotsTxt = compileRobotsSnippet(policyDoc, compileOptions);
        const aiprefTemplates = compileAiprefTemplates(policyDoc, compileOptions);
        const markdown = renderPolicyMarkdown(policyDoc, compileOptions);

        // Stdout mode: output all content as JSON
        if (isStdout || globalOpts.json) {
          const result = {
            success: true,
            source: file,
            artifacts: {
              'peac.txt': peacTxt,
              'robots-ai-snippet.txt': robotsTxt,
              'aipref-headers.json': aiprefTemplates,
              'ai-policy.md': markdown,
            },
          };

          if (isStdout && !globalOpts.json) {
            // Plain stdout: just output peac.txt
            console.log(peacTxt);
          } else {
            output(result, { json: true });
          }

          process.exit(0);
        }

        // Determine output paths
        const outDir = options.out;
        let peacTxtPath: string;
        if (options.wellKnown) {
          peacTxtPath = path.join(outDir, '.well-known', 'peac.txt');
        } else {
          peacTxtPath = path.join(outDir, 'peac.txt');
        }
        const robotsPath = path.join(outDir, 'robots-ai-snippet.txt');
        const aiprefPath = path.join(outDir, 'aipref-headers.json');
        const mdPath = path.join(outDir, 'ai-policy.md');

        if (options.dryRun) {
          // Dry run: show what would be generated
          console.log('Dry run - files that would be generated:\n');
          console.log(`--- ${peacTxtPath} ---`);
          console.log(peacTxt);
          console.log(`--- ${robotsPath} ---`);
          console.log(robotsTxt);
          console.log(`--- ${aiprefPath} ---`);
          console.log(JSON.stringify(aiprefTemplates, null, 2));
          console.log(`\n--- ${mdPath} ---`);
          console.log(markdown);
          process.exit(0);
        }

        // Create output directories
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
        if (options.wellKnown) {
          const wellKnownDir = path.join(outDir, '.well-known');
          if (!fs.existsSync(wellKnownDir)) {
            fs.mkdirSync(wellKnownDir, { recursive: true });
          }
        }

        // Write files
        fs.writeFileSync(peacTxtPath, peacTxt, 'utf-8');
        console.log(`Generated: ${peacTxtPath}`);

        fs.writeFileSync(robotsPath, robotsTxt, 'utf-8');
        console.log(`Generated: ${robotsPath}`);

        fs.writeFileSync(aiprefPath, JSON.stringify(aiprefTemplates, null, 2), 'utf-8');
        console.log(`Generated: ${aiprefPath}`);

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
          outputError(`Failed to load policy: ${err.message}`, { file }, globalOpts);
          process.exit(1);
        } else {
          outputError(err instanceof Error ? err.message : String(err), {}, globalOpts);
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
    'Access purpose (crawl, index, train, inference, ai_input, ai_index, search)'
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
      },
      cmd: Command
    ) => {
      const globalOpts = getGlobalOptions(cmd);

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

        if (options.allMatches) {
          const matches = explainMatches(policyDoc, context);

          if (globalOpts.json) {
            output(
              {
                success: true,
                context,
                matches: matches.map((m) => {
                  if (m === '[default]') {
                    return {
                      rule: '[default]',
                      decision: policyDoc.defaults.decision,
                    };
                  }
                  const rule = policyDoc.rules.find((r) => r.name === m);
                  return rule
                    ? { rule: rule.name, decision: rule.decision }
                    : { rule: m, decision: null };
                }),
              },
              globalOpts
            );
          } else {
            console.log('Evaluation Context:');
            if (context.subject) {
              console.log(`   Subject: ${JSON.stringify(context.subject)}`);
            } else {
              console.log('   Subject: (any)');
            }
            console.log(`   Purpose: ${context.purpose || '(any)'}`);
            console.log(`   Licensing Mode: ${context.licensing_mode || '(any)'}`);
            console.log();

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
          }
        } else {
          const result = evaluate(policyDoc, context);

          if (globalOpts.json) {
            output(
              {
                success: true,
                context,
                result: {
                  decision: result.decision,
                  matchedRule: result.matched_rule || '[default]',
                  reason: result.reason || null,
                },
              },
              globalOpts
            );
          } else {
            console.log('Evaluation Context:');
            if (context.subject) {
              console.log(`   Subject: ${JSON.stringify(context.subject)}`);
            } else {
              console.log('   Subject: (any)');
            }
            console.log(`   Purpose: ${context.purpose || '(any)'}`);
            console.log(`   Licensing Mode: ${context.licensing_mode || '(any)'}`);
            console.log();

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
        }

        process.exit(0);
      } catch (err) {
        if (err instanceof PolicyLoadError) {
          outputError(`Failed to load policy: ${err.message}`, { file }, globalOpts);
          process.exit(1);
        } else {
          outputError(err instanceof Error ? err.message : String(err), {}, globalOpts);
          process.exit(1);
        }
      }
    }
  );

/**
 * peac policy list-profiles
 *
 * List available pre-built policy profiles (v0.9.23+)
 */
policy
  .command('list-profiles')
  .description('List available pre-built policy profiles')
  .action((options: Record<string, never>, cmd: Command) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      const profileIds = listProfiles();
      const profiles = profileIds.map((id) => getProfileSummary(id));

      if (globalOpts.json) {
        output(
          {
            success: true,
            profiles: profiles.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              defaultDecision: p.defaultDecision,
              ruleCount: p.ruleCount,
              requiresReceipt: p.requiresReceipt,
              requiredParams: p.requiredParams,
              optionalParams: p.optionalParams,
            })),
          },
          globalOpts
        );
      } else {
        console.log('Available Policy Profiles:\n');
        for (const profile of profiles) {
          console.log(`  ${profile.id}`);
          console.log(`    Name: ${profile.name}`);
          console.log(`    Default: ${profile.defaultDecision}`);
          console.log(`    Rules: ${profile.ruleCount}`);
          if (profile.requiresReceipt) {
            console.log('    Requires receipt: yes');
          }
          if (profile.requiredParams.length > 0) {
            console.log(`    Required params: ${profile.requiredParams.join(', ')}`);
          }
          console.log();
        }

        console.log('Use "peac policy show-profile <id>" for full details');
        console.log('Use "peac policy init --profile <id>" to create a policy from a profile');
      }

      process.exit(0);
    } catch (err) {
      outputError(err instanceof Error ? err.message : String(err), {}, globalOpts);
      process.exit(1);
    }
  });

/**
 * peac policy show-profile <id>
 *
 * Show details of a specific profile (v0.9.23+)
 */
policy
  .command('show-profile')
  .description('Show details of a specific policy profile')
  .argument('<id>', 'Profile ID')
  .action((id: string, options: Record<string, never>, cmd: Command) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      const profile = loadProfile(id as ProfileId);
      const summary = getProfileSummary(id as ProfileId);

      if (globalOpts.json) {
        output(
          {
            success: true,
            profile: {
              id: profile.id,
              name: profile.name,
              description: profile.description,
              policy: profile.policy,
              parameters: profile.parameters,
              defaults: profile.defaults,
            },
          },
          globalOpts
        );
      } else {
        console.log(`Profile: ${profile.name}`);
        console.log(`ID: ${profile.id}`);
        console.log();
        console.log('Description:');
        console.log(
          profile.description
            .split('\n')
            .map((l) => `  ${l}`)
            .join('\n')
        );
        console.log();

        console.log('Policy:');
        console.log(`  Version: ${profile.policy.version}`);
        console.log(`  Default decision: ${profile.policy.defaults.decision}`);
        console.log(`  Rules: ${profile.policy.rules?.length || 0}`);

        if (profile.policy.rules && profile.policy.rules.length > 0) {
          console.log();
          console.log('Rules:');
          for (const rule of profile.policy.rules) {
            console.log(`  - ${rule.name}: ${rule.decision}`);
            if (rule.purpose) {
              const purposes = Array.isArray(rule.purpose) ? rule.purpose.join(', ') : rule.purpose;
              console.log(`      purpose: ${purposes}`);
            }
            if (rule.reason) {
              console.log(`      reason: ${rule.reason}`);
            }
          }
        }

        if (Object.keys(profile.parameters || {}).length > 0) {
          console.log();
          console.log('Parameters:');
          for (const [key, param] of Object.entries(profile.parameters || {})) {
            const required = param.required ? ' (required)' : '';
            console.log(`  ${key}${required}`);
            console.log(`    ${param.description}`);
            if (param.default) {
              console.log(`    Default: ${param.default}`);
            }
            if (param.example) {
              console.log(`    Example: ${param.example}`);
            }
          }
        }

        if (profile.defaults) {
          console.log();
          console.log('Defaults:');
          if (profile.defaults.requirements?.receipt) {
            console.log('  Receipt required: yes');
          }
          if (profile.defaults.rate_limit) {
            console.log(
              `  Rate limit: ${profile.defaults.rate_limit.limit}/${profile.defaults.rate_limit.window_seconds}s`
            );
          }
        }
      }

      process.exit(0);
    } catch (err) {
      if (err instanceof ProfileError) {
        outputError(err.message, { code: err.code, profile: id }, globalOpts);
        process.exit(1);
      }
      outputError(err instanceof Error ? err.message : String(err), {}, globalOpts);
      process.exit(1);
    }
  });

export { policy };
