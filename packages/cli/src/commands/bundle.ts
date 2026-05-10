/**
 * PEAC Bundle CLI Commands (v0.9.30+)
 *
 * Commands for creating and verifying dispute bundles:
 * - create: Create a dispute bundle from receipts and keys
 * - verify: Verify a dispute bundle (offline by default)
 * - info: Show bundle manifest information
 *
 * Automation flags:
 * - --json: Machine-readable JSON output
 * - --online: Enable external key fetching (verify only, not yet implemented)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  createDisputeBundle,
  readDisputeBundle,
  verifyBundle,
  formatReportText,
  serializeReport,
  type JsonWebKeySet,
  type CreateDisputeBundleOptions,
} from '@peac/audit';
import { readFileBufferSnapshot, readFileUtf8Snapshot } from '../lib/safe-file.js';

/**
 * Global options for bundle commands
 */
interface BundleGlobalOptions {
  json?: boolean;
}

/**
 * Get global options from parent command
 */
function getGlobalOptions(cmd: Command): BundleGlobalOptions {
  const parent = cmd.parent;
  if (!parent) return {};
  return parent.opts() as BundleGlobalOptions;
}

/**
 * Output result - handles JSON vs human-readable format
 */
function output(
  data: Record<string, unknown>,
  opts: BundleGlobalOptions,
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
  opts: BundleGlobalOptions
): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: false, error, ...details }, null, 2));
  } else {
    console.error(`Error: ${error}`);
    if (details.code) {
      console.error(`Code: ${details.code}`);
    }
  }
}

/**
 * Read receipts from a directory or files. Uses fd-bound read for the
 * single-file case so existence and content read happen atomically; on
 * EISDIR the helper signals a directory path and we fall back to
 * readdirSync + per-file fd-bound reads. The directory listing path is
 * not subject to a check-then-read race because each per-file read is
 * itself fd-bound via readFileUtf8Snapshot.
 */
function readReceipts(receiptsPath: string): string[] {
  const receipts: string[] = [];

  let singleFile: string | undefined;
  try {
    singleFile = readFileUtf8Snapshot(receiptsPath);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EISDIR') {
      const files = fs.readdirSync(receiptsPath);
      for (const file of files) {
        if (file.endsWith('.jws')) {
          receipts.push(readFileUtf8Snapshot(path.join(receiptsPath, file)).trim());
        }
      }
      return receipts;
    }
    throw err;
  }

  receipts.push(singleFile.trim());
  return receipts;
}

/**
 * Read JWKS from file via a single fd-bound read.
 */
function readJwks(keysPath: string): JsonWebKeySet {
  const content = readFileUtf8Snapshot(keysPath);
  return JSON.parse(content) as JsonWebKeySet;
}

const bundle = new Command('bundle').description('Dispute bundle operations (v0.9.30+)');

/**
 * peac bundle create --dispute <ref> --receipts <path> --keys <file> [--policy <file>] -o <output>
 */
bundle
  .command('create')
  .description('Create a dispute bundle from receipts and keys')
  .requiredOption('-d, --dispute <ref>', 'Dispute reference (ULID)')
  .requiredOption('-r, --receipts <path>', 'Path to receipts (directory or file)')
  .requiredOption('-k, --keys <file>', 'Path to JWKS file with public keys')
  .option('-p, --policy <file>', 'Path to policy YAML file')
  .option('-c, --created-by <uri>', 'Creator URI (default: cli)')
  .requiredOption('-o, --output <file>', 'Output bundle file path')
  .option('--bundle-id <id>', 'Custom bundle ID (generated if not provided)')
  .action(async (options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      // Read inputs via fd-bound helpers; existence and content read happen atomically.
      // ENOENT is translated to a user-facing not-found error per input path; other
      // errno values fall through to the outer error path.
      let receipts: string[];
      try {
        receipts = readReceipts(options.receipts);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          outputError('Receipts path not found', { path: options.receipts }, globalOpts);
          process.exit(1);
        }
        throw err;
      }

      let keys: JsonWebKeySet;
      try {
        keys = readJwks(options.keys);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          outputError('JWKS file not found', { path: options.keys }, globalOpts);
          process.exit(1);
        }
        throw err;
      }

      if (receipts.length === 0) {
        outputError('No receipts found', { path: options.receipts }, globalOpts);
        process.exit(1);
      }

      // Read policy if provided
      let policy: string | undefined;
      if (options.policy) {
        try {
          policy = readFileUtf8Snapshot(options.policy);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            outputError('Policy file not found', { path: options.policy }, globalOpts);
            process.exit(1);
          }
          throw err;
        }
      }

      // Create bundle
      const createOptions: CreateDisputeBundleOptions = {
        dispute_ref: options.dispute,
        created_by: options.createdBy ?? 'peac-cli',
        receipts,
        keys,
        policy,
        bundle_id: options.bundleId,
      };

      const result = await createDisputeBundle(createOptions);

      if (!result.ok) {
        outputError(result.error.message, { code: result.error.code }, globalOpts);
        process.exit(1);
      }

      // Write output
      fs.writeFileSync(options.output, result.value);

      // Read back to get manifest info
      const readResult = await readDisputeBundle(result.value);
      if (readResult.ok) {
        const manifest = readResult.value.manifest;
        output(
          {
            success: true,
            bundle_id: manifest.bundle_id,
            content_hash: manifest.content_hash,
            receipts_count: manifest.receipts.length,
            keys_count: manifest.keys.length,
            output_path: options.output,
          },
          globalOpts,
          `Bundle created successfully:
  Bundle ID: ${manifest.bundle_id}
  Content hash: ${manifest.content_hash}
  Receipts: ${manifest.receipts.length}
  Keys: ${manifest.keys.length}
  Output: ${options.output}`
        );
      } else {
        output(
          { success: true, output_path: options.output },
          globalOpts,
          `Bundle created: ${options.output}`
        );
      }

      process.exit(0);
    } catch (err) {
      outputError((err as Error).message, {}, globalOpts);
      process.exit(1);
    }
  });

/**
 * peac bundle verify <bundle> [--online] [--output <file>] [--format json|text]
 *
 * NOTE: Verification is OFFLINE by default - uses only keys bundled in the archive.
 * Use --online to enable external key fetching (not yet implemented).
 */
bundle
  .command('verify')
  .description('Verify a dispute bundle (offline by default)')
  .argument('<bundle>', 'Path to bundle ZIP file')
  .option('--online', 'Allow external key fetching (not yet implemented)', false)
  .option('-o, --output <file>', 'Output report to file')
  .option('-f, --format <format>', 'Output format: json or text', 'text')
  .action(async (bundlePath, options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      // Read bundle via fd-bound snapshot; existence and content read happen atomically.
      let zipBuffer: Buffer;
      try {
        zipBuffer = readFileBufferSnapshot(bundlePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          outputError('Bundle file not found', { path: bundlePath }, globalOpts);
          process.exit(1);
        }
        throw err;
      }

      // Verify bundle - offline by default, online if explicitly requested
      const offline = !options.online;
      const result = await verifyBundle(zipBuffer, { offline });

      if (!result.ok) {
        outputError(result.error.message, { code: result.error.code }, globalOpts);
        process.exit(1);
      }

      const report = result.value;

      // Format output
      let outputContent: string;
      if (options.format === 'json' || globalOpts.json) {
        outputContent = serializeReport(report, true);
      } else {
        outputContent = formatReportText(report);
      }

      // Write to file or stdout
      if (options.output) {
        fs.writeFileSync(options.output, outputContent);
        output(
          {
            success: true,
            report_hash: report.report_hash,
            summary: report.summary,
            recommendation: report.auditor_summary.recommendation,
            output_path: options.output,
          },
          globalOpts,
          `Verification complete:
  ${report.auditor_summary.headline}
  Recommendation: ${report.auditor_summary.recommendation.toUpperCase()}
  Report hash: ${report.report_hash}
  Report saved to: ${options.output}`
        );
      } else if (globalOpts.json) {
        // JSON to stdout
        console.log(outputContent);
      } else {
        // Text to stdout
        console.log(outputContent);
      }

      // Exit code based on recommendation
      const exitCode = report.auditor_summary.recommendation === 'valid' ? 0 : 1;
      process.exit(exitCode);
    } catch (err) {
      outputError((err as Error).message, {}, globalOpts);
      process.exit(1);
    }
  });

/**
 * peac bundle info <bundle>
 */
bundle
  .command('info')
  .description('Show bundle manifest information')
  .argument('<bundle>', 'Path to bundle ZIP file')
  .action(async (bundlePath, options, cmd) => {
    const globalOpts = getGlobalOptions(cmd);

    try {
      // Read bundle via fd-bound snapshot; existence and content read happen atomically.
      let zipBuffer: Buffer;
      try {
        zipBuffer = readFileBufferSnapshot(bundlePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          outputError('Bundle file not found', { path: bundlePath }, globalOpts);
          process.exit(1);
        }
        throw err;
      }
      const result = await readDisputeBundle(zipBuffer);

      if (!result.ok) {
        outputError(result.error.message, { code: result.error.code }, globalOpts);
        process.exit(1);
      }

      const { manifest, keys, policy } = result.value;

      if (globalOpts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              manifest: {
                version: manifest.version,
                bundle_id: manifest.bundle_id,
                dispute_ref: manifest.dispute_ref,
                created_by: manifest.created_by,
                created_at: manifest.created_at,
                time_range: manifest.time_range,
                content_hash: manifest.content_hash,
                receipts_count: manifest.receipts.length,
                keys_count: manifest.keys.length,
                has_policy: !!policy,
              },
            },
            null,
            2
          )
        );
      } else {
        console.log(`PEAC Dispute Bundle Info
========================

Version: ${manifest.version}
Bundle ID: ${manifest.bundle_id}
Dispute Ref: ${manifest.dispute_ref}
Created By: ${manifest.created_by}
Created At: ${manifest.created_at}

Time Range
----------
Start: ${manifest.time_range.start}
End: ${manifest.time_range.end}

Contents
--------
Receipts: ${manifest.receipts.length}
Keys: ${keys.keys.length}
Policy: ${policy ? 'Yes' : 'No'}

Integrity
---------
Content Hash: ${manifest.content_hash}
`);

        // List receipts
        if (manifest.receipts.length > 0) {
          console.log('Receipts:');
          for (const receipt of manifest.receipts) {
            console.log(`  - ${receipt.receipt_id} (${receipt.issued_at})`);
          }
          console.log('');
        }

        // List keys
        if (manifest.keys.length > 0) {
          console.log('Keys:');
          for (const key of manifest.keys) {
            console.log(`  - ${key.kid} (${key.alg})`);
          }
        }
      }

      process.exit(0);
    } catch (err) {
      outputError((err as Error).message, {}, globalOpts);
      process.exit(1);
    }
  });

export { bundle as bundleCommand };
