/**
 * PEAC Conformance CLI Commands (v0.10.8+)
 *
 * Commands for running conformance tests:
 * - run: Run conformance tests against fixtures
 * - list: List available conformance test fixtures
 *
 * Uses real validators from @peac/schema and generates reports
 * conforming to peac-conformance-report/0.1.
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  runConformance,
  formatReportText,
  formatReportMarkdown,
  type ConformanceLevel,
  type RunnerCallbacks,
  type TestResult,
} from '../lib/conformance-runner.js';
import { getVersion, getRuntime, getCommit } from '../lib/version.js';

/**
 * Global options for conformance commands
 */
interface ConformanceGlobalOptions {
  json?: boolean;
}

/**
 * Get global options from parent command
 */
function getGlobalOptions(cmd: Command): ConformanceGlobalOptions {
  const parent = cmd.parent;
  if (!parent) return {};
  return parent.opts() as ConformanceGlobalOptions;
}

/**
 * Output error - handles JSON vs human-readable format
 */
function outputError(
  error: string,
  details: Record<string, unknown>,
  opts: ConformanceGlobalOptions
): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: false, error, ...details }, null, 2));
  } else {
    console.error(`Error: ${error}`);
    if (details.code) {
      console.error(`Code: ${details.code}`);
    }
    if (details.hint) {
      console.error(`Hint: ${details.hint}`);
    }
  }
}

/**
 * Find fixtures directory (relative to CLI package or repo root)
 */
function findFixturesDir(customPath?: string): string | null {
  // Use custom path if provided
  if (customPath) {
    if (fs.existsSync(customPath)) {
      return customPath;
    }
    return null;
  }

  // Try relative to CLI package (when installed)
  const cliPath = path.resolve(__dirname, '../../../../specs/conformance/fixtures');
  if (fs.existsSync(cliPath)) {
    return cliPath;
  }

  // Try relative to repo root (when running from source)
  const repoPath = path.resolve(process.cwd(), 'specs/conformance/fixtures');
  if (fs.existsSync(repoPath)) {
    return repoPath;
  }

  // Try one level up (when running from packages/cli)
  const upPath = path.resolve(process.cwd(), '../../specs/conformance/fixtures');
  if (fs.existsSync(upPath)) {
    return upPath;
  }

  return null;
}

/**
 * List available fixture categories
 */
function listCategories(fixturesDir: string): string[] {
  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
}

/**
 * Count fixtures in a category
 */
function countFixtures(categoryPath: string): number {
  if (!fs.existsSync(categoryPath)) return 0;
  const files = fs.readdirSync(categoryPath);
  return files.filter((f) => f.endsWith('.json')).length;
}

const conformance = new Command('conformance')
  .description('PEAC conformance testing (v0.10.8+)')
  .option('--json', 'Output in JSON format');

/**
 * peac conformance run [options]
 */
conformance
  .command('run')
  .description('Run conformance tests')
  .option('-l, --level <level>', 'Conformance level: basic, standard, full', 'standard')
  .option('-c, --category <category>', 'Test specific category only')
  .option('-o, --output <format>', 'Output format: json, text, markdown', 'text')
  .option('-v, --verbose', 'Show detailed test output')
  .option('--fixtures <path>', 'Path to fixtures directory')
  .option('--implementation <name>', 'Implementation name for report', '@peac/cli')
  .action(async (options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);
    const startTime = Date.now();

    try {
      // Find fixtures directory
      const fixturesDir = findFixturesDir(options.fixtures);
      if (!fixturesDir) {
        outputError(
          'Fixtures directory not found',
          {
            hint: options.fixtures
              ? `Specified path does not exist: ${options.fixtures}`
              : 'Run from repo root, specify --fixtures <path>, or ensure specs/conformance/fixtures is available',
          },
          globalOpts
        );
        process.exitCode = 1;
        return;
      }

      // Validate level
      const validLevels: ConformanceLevel[] = ['basic', 'standard', 'full'];
      if (!validLevels.includes(options.level)) {
        outputError(
          'Invalid conformance level',
          {
            level: options.level,
            valid: validLevels,
          },
          globalOpts
        );
        process.exitCode = 1;
        return;
      }

      // Set up callbacks for verbose output
      const callbacks: RunnerCallbacks | undefined = options.verbose
        ? {
            onTestStart: (testId: string) => {
              console.log(`Running: ${testId}`);
            },
            onTestComplete: (result: TestResult) => {
              const status =
                result.status === 'pass' ? 'PASS' : result.status === 'fail' ? 'FAIL' : 'SKIP';
              console.log(`  ${status}: ${result.id}`);
            },
          }
        : undefined;

      // Run conformance tests
      const report = runConformance(
        {
          fixturesDir,
          level: options.level as ConformanceLevel,
          category: options.category,
          implementationName: options.implementation,
          implementationVersion: getVersion(),
        },
        callbacks
      );

      // Add runtime metadata
      report.implementation.runtime = getRuntime();
      const commit = getCommit();
      if (commit) {
        report.implementation.commit = commit;
      }

      // Add meta section
      report.meta = {
        generated_at: new Date().toISOString(),
        runner: {
          name: 'peac-cli',
          version: getVersion(),
        },
        duration_ms: Date.now() - startTime,
      };

      // Output based on format
      if (options.output === 'json' || globalOpts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else if (options.output === 'markdown') {
        console.log(formatReportMarkdown(report));
      } else {
        console.log(formatReportText(report));
      }

      process.exitCode = report.summary.failed === 0 ? 0 : 1;
    } catch (err) {
      outputError((err as Error).message, {}, globalOpts);
      process.exitCode = 1;
    }
  });

/**
 * peac conformance list [--category <cat>]
 */
conformance
  .command('list')
  .description('List available conformance test fixtures')
  .option('-c, --category <category>', 'List fixtures in specific category')
  .option('--fixtures <path>', 'Path to fixtures directory')
  .action((options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      // Find fixtures directory
      const fixturesDir = findFixturesDir(options.fixtures);
      if (!fixturesDir) {
        outputError(
          'Fixtures directory not found',
          {
            hint: options.fixtures
              ? `Specified path does not exist: ${options.fixtures}`
              : 'Run from repo root, specify --fixtures <path>, or ensure specs/conformance/fixtures is available',
          },
          globalOpts
        );
        process.exitCode = 1;
        return;
      }

      // Load manifest
      const manifestPath = path.join(fixturesDir, 'manifest.json');
      const manifest = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        : {};

      // List categories
      const categories = listCategories(fixturesDir);

      if (options.category) {
        // List fixtures in specific category
        if (!categories.includes(options.category)) {
          outputError(
            'Category not found',
            {
              category: options.category,
              available: categories,
            },
            globalOpts
          );
          process.exitCode = 1;
          return;
        }

        const categoryPath = path.join(fixturesDir, options.category);
        const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.json'));
        const categoryManifest = manifest[options.category] as
          | Record<string, Record<string, unknown>>
          | undefined;

        if (globalOpts.json) {
          const fixtures = files.map((f) => ({
            file: f,
            description: (categoryManifest?.[f]?.description as string) || 'No description',
          }));
          console.log(JSON.stringify({ category: options.category, fixtures }, null, 2));
        } else {
          console.log(`Fixtures in ${options.category}:\n`);
          for (const file of files) {
            const info = categoryManifest?.[file] || {};
            const desc = (info.description as string) || 'No description';
            console.log(`  ${file}`);
            console.log(`    ${desc}\n`);
          }
        }
      } else {
        // List all categories
        if (globalOpts.json) {
          const categorySummary = categories.map((cat) => ({
            name: cat,
            fixture_count: countFixtures(path.join(fixturesDir, cat)),
          }));
          console.log(JSON.stringify({ categories: categorySummary }, null, 2));
        } else {
          console.log(`Available conformance test categories:\n`);
          for (const cat of categories) {
            const count = countFixtures(path.join(fixturesDir, cat));
            console.log(`  ${cat} (${count} fixtures)`);
          }
          console.log(`\nUse 'peac conformance list -c <category>' to see fixtures in a category.`);
        }
      }

      process.exitCode = 0;
    } catch (err) {
      outputError((err as Error).message, {}, globalOpts);
      process.exitCode = 1;
    }
  });

export { conformance };
