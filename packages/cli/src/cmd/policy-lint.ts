import { Command, Option } from 'clipanion';
import { readFileSync, existsSync } from 'fs';
import { request } from 'undici';
import chalk from 'chalk';
import * as yaml from 'yaml';

interface LintResult {
  level: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number; startColumn: number };
    };
  }>;
}

export class PolicyLintCommand extends Command {
  static paths = [['policy', 'lint']];

  static usage = Command.Usage({
    description: 'Validate PEAC policy schema and semantics',
    details: 'Lint policy file or URL for schema compliance and semantic correctness',
    examples: [
      ['Lint local file', 'peac policy lint policy.yaml'],
      ['Lint remote policy', 'peac policy lint https://example.com/.well-known/peac'],
      ['SARIF output', 'peac policy lint policy.yaml --format sarif'],
      ['JSON output', 'peac policy lint policy.yaml --format json'],
    ],
  });

  input = Option.String({ required: true });
  format = Option.String('--format', 'text', { description: 'Output format: text|json|sarif' });

  async execute(): Promise<number> {
    try {
      // Read input (file or URL)
      let policyText: string;
      let inputUri: string;

      if (this.input.startsWith('http://') || this.input.startsWith('https://')) {
        inputUri = this.input;
        try {
          const response = await request(this.input, {
            method: 'GET',
            headers: {
              'user-agent': 'peac-cli/0.9.11',
              accept: 'application/peac+yaml, application/peac+json, text/plain',
            },
            throwOnError: true,
            bodyTimeout: 10000,
            headersTimeout: 10000,
          });

          const chunks: Buffer[] = [];
          for await (const chunk of response.body) {
            chunks.push(chunk);
          }
          policyText = Buffer.concat(chunks).toString('utf-8');
        } catch (error) {
          this.outputError('network_error', `Failed to fetch policy: ${error}`, inputUri);
          return 3;
        }
      } else {
        inputUri = this.input;
        if (!existsSync(this.input)) {
          this.outputError('file_not_found', 'Policy file not found', inputUri);
          return 2;
        }

        try {
          policyText = readFileSync(this.input, 'utf-8');
        } catch (error) {
          this.outputError('file_read_error', `Cannot read file: ${error}`, inputUri);
          return 3;
        }
      }

      // Parse policy
      let policy: any;
      try {
        // Try YAML first, fallback to JSON
        try {
          policy = yaml.parse(policyText);
        } catch {
          policy = JSON.parse(policyText);
        }
      } catch (error) {
        this.outputError('parse_error', `Cannot parse policy: ${error}`, inputUri);
        return 2;
      }

      // Lint policy
      const results = this.lintPolicy(policy, inputUri);

      // Output results
      const errors = results.filter((r) => r.level === 'error');
      const warnings = results.filter((r) => r.level === 'warning');

      if (this.format === 'sarif') {
        this.outputSarif(results, inputUri);
      } else if (this.format === 'json') {
        this.context.stdout.write(
          JSON.stringify(
            {
              uri: inputUri,
              results,
              summary: {
                errors: errors.length,
                warnings: warnings.length,
              },
            },
            null,
            2,
          ) + '\n',
        );
      } else {
        // Text format
        if (errors.length === 0 && warnings.length === 0) {
          this.context.stdout.write(chalk.green('✓ Policy is valid\n'));
        } else {
          for (const result of results) {
            const color = result.level === 'error' ? chalk.red : chalk.yellow;
            this.context.stdout.write(color(`${result.level}: ${result.message}\n`));
            if (result.path) {
              this.context.stdout.write(`  at ${result.path}\n`);
            }
          }

          this.context.stdout.write(`\n${errors.length} errors, ${warnings.length} warnings\n`);
        }
      }

      return errors.length > 0 ? 1 : 0;
    } catch (error) {
      this.outputError('internal_error', `Internal error: ${error}`, this.input);
      return 3;
    }
  }

  private lintPolicy(policy: any, uri: string): LintResult[] {
    const results: LintResult[] = [];

    // Required fields
    if (!policy || typeof policy !== 'object') {
      results.push({
        level: 'error',
        message: 'Policy must be an object',
        path: '$',
      });
      return results;
    }

    if (!policy.version) {
      results.push({
        level: 'error',
        message: 'Missing required field: version',
        path: '$.version',
      });
    } else if (typeof policy.version !== 'string') {
      results.push({
        level: 'error',
        message: 'Version must be a string',
        path: '$.version',
      });
    }

    if (!policy.site) {
      results.push({
        level: 'error',
        message: 'Missing required field: site',
        path: '$.site',
      });
    } else if (typeof policy.site !== 'object') {
      results.push({
        level: 'error',
        message: 'Site must be an object',
        path: '$.site',
      });
    } else {
      if (!policy.site.name) {
        results.push({
          level: 'error',
          message: 'Missing required field: site.name',
          path: '$.site.name',
        });
      }
      if (!policy.site.domain) {
        results.push({
          level: 'error',
          message: 'Missing required field: site.domain',
          path: '$.site.domain',
        });
      }
    }

    // Attribution format validation
    if (policy.attribution?.format) {
      try {
        new RegExp(policy.attribution.format);
      } catch (error) {
        results.push({
          level: 'error',
          message: `Invalid attribution format regex: ${error}`,
          path: '$.attribution.format',
        });
      }
    }

    // Privacy validation
    if (policy.privacy?.retention_days !== undefined) {
      const days = policy.privacy.retention_days;
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        results.push({
          level: 'error',
          message: 'retention_days must be an integer between 1 and 365',
          path: '$.privacy.retention_days',
        });
      }
    }

    // Exports validation
    if (policy.exports?.max_rows !== undefined) {
      const rows = policy.exports.max_rows;
      if (!Number.isInteger(rows) || rows < 1 || rows > 1000000) {
        results.push({
          level: 'error',
          message: 'max_rows must be an integer between 1 and 1,000,000',
          path: '$.exports.max_rows',
        });
      }
    }

    if (policy.exports?.auth && !['signature', 'token'].includes(policy.exports.auth)) {
      results.push({
        level: 'error',
        message: 'exports.auth must be "signature" or "token"',
        path: '$.exports.auth',
      });
    }

    // Logging validation
    if (policy.logging?.sink) {
      const sink = policy.logging.sink;
      if (sink !== 'stdout' && !sink.startsWith('https://')) {
        results.push({
          level: 'error',
          message: 'logging.sink must be "stdout" or https URL',
          path: '$.logging.sink',
        });
      }
    }

    // Heavy paths validation
    if (policy.heavy_paths && Array.isArray(policy.heavy_paths)) {
      for (const [index, path] of policy.heavy_paths.entries()) {
        if (typeof path !== 'string') {
          results.push({
            level: 'error',
            message: 'Heavy paths must be strings',
            path: `$.heavy_paths[${index}]`,
          });
          continue;
        }

        // Validate glob pattern
        if (path.length > 200) {
          results.push({
            level: 'error',
            message: 'Heavy path pattern too long (>200 chars)',
            path: `$.heavy_paths[${index}]`,
          });
        }

        // Check for dangerous patterns
        if (path.includes('**/**')) {
          results.push({
            level: 'warning',
            message: 'Nested ** patterns may be inefficient',
            path: `$.heavy_paths[${index}]`,
          });
        }
      }
    }

    // Rate limits validation
    if (policy.rate_limits) {
      for (const tier of ['anonymous', 'attributed', 'verified']) {
        const limit = policy.rate_limits[tier];
        if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
          results.push({
            level: 'error',
            message: `rate_limits.${tier} must be a non-negative integer`,
            path: `$.rate_limits.${tier}`,
          });
        }
      }
    }

    return results;
  }

  private outputError(code: string, message: string, uri: string): void {
    if (this.format === 'json') {
      this.context.stdout.write(
        JSON.stringify({
          uri,
          results: [
            {
              level: 'error',
              message,
              code,
            },
          ],
          summary: { errors: 1, warnings: 0 },
        }) + '\n',
      );
    } else if (this.format === 'sarif') {
      this.outputSarif(
        [
          {
            level: 'error',
            message,
          },
        ],
        uri,
      );
    } else {
      this.context.stderr.write(chalk.red(`error: ${message}\n`));
    }
  }

  private outputSarif(results: LintResult[], uri: string): void {
    const sarif = {
      version: '2.1.0',
      $schema: 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'peac-policy-lint',
              version: '0.9.11',
              informationUri: 'https://peacprotocol.org',
            },
          },
          artifacts: [
            {
              location: { uri },
            },
          ],
          results: results.map((result) => ({
            ruleId: result.path?.replace(/[$.\[\]]/g, '_') || 'general',
            level: result.level === 'error' ? 'error' : 'warning',
            message: { text: result.message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri },
                  region: {
                    startLine: result.line || 1,
                    startColumn: result.column || 1,
                  },
                },
              },
            ],
          })),
        },
      ],
    };

    this.context.stdout.write(JSON.stringify(sarif, null, 2) + '\n');
  }
}
