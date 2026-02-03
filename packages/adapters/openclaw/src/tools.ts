/**
 * @peac/adapter-openclaw - Plugin Tools
 *
 * Tools exposed by the PEAC receipts plugin for OpenClaw.
 */

import type { PluginTool, PluginLogger } from './plugin.js';

// =============================================================================
// Status Tool Types
// =============================================================================

/**
 * Plugin stats interface matching plugin.ts PluginStats.
 */
interface PluginStats {
  totalCaptured: number;
  duplicatesSkipped: number;
  pendingCount: number;
  totalEmitted: number;
  totalErrors: number;
  keyId: string;
  isRunning: boolean;
}

// =============================================================================
// Status Tool
// =============================================================================

/**
 * Create the peac_receipts.status tool.
 * Shows spool size, last receipt time, and config summary.
 */
export function createStatusTool(
  stats: PluginStats,
  outputDir: string
): PluginTool {
  return {
    name: 'peac_receipts.status',
    description: 'Show PEAC receipts status: spool size, last receipt time, config summary',
    parameters: {},

    async execute(): Promise<StatusResult> {
      const fs = await import('fs');
      const path = await import('path');

      // Count receipts in output directory
      let receiptCount = 0;
      let lastReceiptTime: string | null = null;
      let oldestReceiptTime: string | null = null;

      try {
        const files = await fs.promises.readdir(outputDir);
        const receiptFiles = files.filter((f) => f.endsWith('.peac.json'));
        receiptCount = receiptFiles.length;

        if (receiptFiles.length > 0) {
          // Get timestamps from filenames or file stats
          const fileStats = await Promise.all(
            receiptFiles.map(async (f) => {
              const stat = await fs.promises.stat(path.join(outputDir, f));
              return { file: f, mtime: stat.mtime };
            })
          );

          fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
          lastReceiptTime = fileStats[0].mtime.toISOString();
          oldestReceiptTime = fileStats[fileStats.length - 1].mtime.toISOString();
        }
      } catch {
        // Directory might not exist yet
      }

      return {
        status: 'ok',
        spool: {
          pending_entries: stats.pendingCount,
          total_captured: stats.totalCaptured,
          duplicates_skipped: stats.duplicatesSkipped,
        },
        receipts: {
          count: receiptCount,
          output_dir: outputDir,
          last_receipt_time: lastReceiptTime,
          oldest_receipt_time: oldestReceiptTime,
        },
        emitter: {
          total_emitted: stats.totalEmitted,
          total_errors: stats.totalErrors,
          is_running: stats.isRunning,
          key_id: stats.keyId,
        },
      };
    },
  };
}

interface StatusResult {
  status: 'ok' | 'error';
  spool: {
    pending_entries: number;
    total_captured: number;
    duplicates_skipped: number;
  };
  receipts: {
    count: number;
    output_dir: string;
    last_receipt_time: string | null;
    oldest_receipt_time: string | null;
  };
  emitter: {
    total_emitted: number;
    total_errors: number;
    is_running: boolean;
    key_id: string;
  };
}

// =============================================================================
// Export Bundle Tool
// =============================================================================

/**
 * Create the peac_receipts.export_bundle tool.
 * Exports receipts as a dispute bundle ZIP for audit.
 */
export function createExportBundleTool(
  outputDir: string,
  logger: PluginLogger
): PluginTool {
  return {
    name: 'peac_receipts.export_bundle',
    description: 'Export receipts as a dispute bundle ZIP for audit',
    parameters: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'Filter by workflow ID',
        },
        since: {
          type: 'string',
          description: 'Include receipts since this RFC 3339 timestamp',
        },
        until: {
          type: 'string',
          description: 'Include receipts until this RFC 3339 timestamp',
        },
        output_path: {
          type: 'string',
          description: 'Output path for the bundle ZIP (default: peac-bundle-{timestamp}.zip)',
        },
      },
    },

    async execute(params: ExportBundleParams): Promise<ExportBundleResult> {
      const fs = await import('fs');
      const path = await import('path');

      try {
        // List receipts
        const files = await fs.promises.readdir(outputDir);
        const receiptFiles = files.filter((f) => f.endsWith('.peac.json'));

        if (receiptFiles.length === 0) {
          return {
            status: 'ok',
            message: 'No receipts to export',
            receipt_count: 0,
          };
        }

        // Filter receipts
        const receipts: Array<{ file: string; content: unknown; mtime: Date }> = [];

        for (const file of receiptFiles) {
          const filePath = path.join(outputDir, file);
          const stat = await fs.promises.stat(filePath);

          // Apply time filters
          if (params.since && stat.mtime < new Date(params.since)) {
            continue;
          }
          if (params.until && stat.mtime > new Date(params.until)) {
            continue;
          }

          // Read and parse receipt
          const content = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));

          // Apply workflow filter
          if (params.workflow_id) {
            const workflowExt = content?.auth?.extensions?.['org.peacprotocol/workflow'];
            if (workflowExt?.workflow_id !== params.workflow_id) {
              continue;
            }
          }

          receipts.push({ file, content, mtime: stat.mtime });
        }

        if (receipts.length === 0) {
          return {
            status: 'ok',
            message: 'No receipts match the filter criteria',
            receipt_count: 0,
          };
        }

        // Create bundle manifest
        const manifest = {
          version: '1.0',
          created_at: new Date().toISOString(),
          receipt_count: receipts.length,
          filters: {
            workflow_id: params.workflow_id || null,
            since: params.since || null,
            until: params.until || null,
          },
          receipts: receipts.map((r) => ({
            file: r.file,
            mtime: r.mtime.toISOString(),
          })),
        };

        // Determine output path
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const bundlePath = params.output_path || path.join(outputDir, `peac-bundle-${timestamp}.zip`);

        // Create ZIP bundle
        // Note: In production, would use archiver or similar
        // For now, create a directory-based bundle
        const bundleDir = bundlePath.replace('.zip', '');
        await fs.promises.mkdir(bundleDir, { recursive: true });

        // Write manifest
        await fs.promises.writeFile(
          path.join(bundleDir, 'manifest.json'),
          JSON.stringify(manifest, null, 2)
        );

        // Copy receipts
        const receiptsDir = path.join(bundleDir, 'receipts');
        await fs.promises.mkdir(receiptsDir, { recursive: true });

        for (const receipt of receipts) {
          await fs.promises.writeFile(
            path.join(receiptsDir, receipt.file),
            JSON.stringify(receipt.content, null, 2)
          );
        }

        logger.info(`Exported ${receipts.length} receipts to ${bundleDir}`);

        return {
          status: 'ok',
          message: `Exported ${receipts.length} receipts`,
          receipt_count: receipts.length,
          bundle_path: bundleDir,
        };
      } catch (error) {
        logger.error('Export bundle failed:', error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          receipt_count: 0,
        };
      }
    },
  };
}

interface ExportBundleParams {
  workflow_id?: string;
  since?: string;
  until?: string;
  output_path?: string;
}

interface ExportBundleResult {
  status: 'ok' | 'error';
  message: string;
  receipt_count: number;
  bundle_path?: string;
}

// =============================================================================
// Verify Tool
// =============================================================================

/**
 * Create the peac_receipts.verify tool.
 * Verifies a receipt or bundle offline.
 */
export function createVerifyTool(logger: PluginLogger): PluginTool {
  return {
    name: 'peac_receipts.verify',
    description: 'Verify a receipt or bundle offline',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to receipt file or bundle directory',
        },
        jwks_path: {
          type: 'string',
          description: 'Path to JWKS file for key verification (optional)',
        },
      },
      required: ['path'],
    },

    async execute(params: Record<string, unknown>): Promise<VerifyResult> {
      const verifyParams = params as unknown as VerifyParams;
      const fs = await import('fs');
      const pathModule = await import('path');

      try {
        const stat = await fs.promises.stat(verifyParams.path);

        if (stat.isDirectory()) {
          // Verify bundle
          return await verifyBundle(verifyParams.path, verifyParams.jwks_path, fs, pathModule, logger);
        } else {
          // Verify single receipt
          return await verifySingleReceipt(verifyParams.path, verifyParams.jwks_path, fs, logger);
        }
      } catch (error) {
        logger.error('Verification failed:', error);
        return {
          status: 'error',
          valid: false,
          message: error instanceof Error ? error.message : 'Unknown error',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        };
      }
    },
  };
}

async function verifySingleReceipt(
  receiptPath: string,
  jwksPath: string | undefined,
  fs: typeof import('fs'),
  logger: PluginLogger
): Promise<VerifyResult> {
  const content = await fs.promises.readFile(receiptPath, 'utf-8');
  const receipt = JSON.parse(content);

  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic structure validation
  if (!receipt.auth) {
    errors.push('Missing auth block');
  }
  if (!receipt.evidence) {
    errors.push('Missing evidence block');
  }

  // Check for interaction evidence
  const interaction = receipt.evidence?.extensions?.['org.peacprotocol/interaction@0.1'];
  if (interaction) {
    // Validate interaction fields
    if (!interaction.interaction_id) {
      errors.push('Missing interaction_id');
    }
    if (!interaction.kind) {
      errors.push('Missing kind');
    }
    if (!interaction.executor?.platform) {
      errors.push('Missing executor.platform');
    }
    if (!interaction.started_at) {
      errors.push('Missing started_at');
    }

    // Check timing invariant
    if (interaction.completed_at && interaction.started_at) {
      if (new Date(interaction.completed_at) < new Date(interaction.started_at)) {
        errors.push('completed_at is before started_at');
      }
    }

    // Check output requires result
    if (interaction.output && !interaction.result?.status) {
      errors.push('output present but result.status missing');
    }
  } else {
    warnings.push('No interaction evidence found');
  }

  // Signature verification (if JWKS provided)
  if (jwksPath && receipt._jws) {
    try {
      const { verify, base64urlDecode } = await import('@peac/crypto');
      const jwks = JSON.parse(await fs.promises.readFile(jwksPath, 'utf-8'));
      // Extract public key from JWKS
      const keyJwk = jwks.keys?.[0];
      if (!keyJwk || !keyJwk.x) {
        errors.push('No valid Ed25519 keys found in JWKS');
      } else {
        // Decode base64url public key bytes
        const publicKeyBytes = base64urlDecode(keyJwk.x);
        await verify(receipt._jws, publicKeyBytes);
        logger.info('Signature verified successfully');
      }
    } catch (error) {
      errors.push(`Signature verification failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  } else if (!jwksPath) {
    warnings.push('No JWKS provided - signature not verified');
  }

  return {
    status: errors.length === 0 ? 'ok' : 'error',
    valid: errors.length === 0,
    message: errors.length === 0 ? 'Receipt is valid' : 'Receipt has validation errors',
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    receipt_id: receipt.auth?.rid,
    interaction_id: interaction?.interaction_id,
  };
}

async function verifyBundle(
  bundlePath: string,
  jwksPath: string | undefined,
  fs: typeof import('fs'),
  pathModule: typeof import('path'),
  logger: PluginLogger
): Promise<VerifyResult> {
  // Read manifest
  const manifestPath = pathModule.join(bundlePath, 'manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));

  const receiptsDir = pathModule.join(bundlePath, 'receipts');
  const files = await fs.promises.readdir(receiptsDir);

  let validCount = 0;
  let invalidCount = 0;
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (const file of files) {
    if (!file.endsWith('.peac.json')) continue;

    const result = await verifySingleReceipt(
      pathModule.join(receiptsDir, file),
      jwksPath,
      fs,
      logger
    );

    if (result.valid) {
      validCount++;
    } else {
      invalidCount++;
      if (result.errors) {
        allErrors.push(...result.errors.map((e) => `${file}: ${e}`));
      }
    }
    if (result.warnings) {
      allWarnings.push(...result.warnings.map((w) => `${file}: ${w}`));
    }
  }

  return {
    status: invalidCount === 0 ? 'ok' : 'error',
    valid: invalidCount === 0,
    message: `Bundle verification: ${validCount} valid, ${invalidCount} invalid`,
    errors: allErrors.length > 0 ? allErrors : undefined,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    bundle_stats: {
      total: validCount + invalidCount,
      valid: validCount,
      invalid: invalidCount,
      manifest_receipt_count: manifest.receipt_count,
    },
  };
}

interface VerifyParams {
  path: string;
  jwks_path?: string;
}

interface VerifyResult {
  status: 'ok' | 'error';
  valid: boolean;
  message: string;
  errors?: string[];
  warnings?: string[];
  receipt_id?: string;
  interaction_id?: string;
  bundle_stats?: {
    total: number;
    valid: number;
    invalid: number;
    manifest_receipt_count: number;
  };
}

// =============================================================================
// Query Tool
// =============================================================================

/**
 * Create the peac_receipts.query tool.
 * Query receipts by workflow_id, tool name, or time range.
 */
export function createQueryTool(outputDir: string, logger: PluginLogger): PluginTool {
  return {
    name: 'peac_receipts.query',
    description: 'Query receipts by workflow_id, tool name, or time range',
    parameters: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'Filter by workflow ID',
        },
        tool_name: {
          type: 'string',
          description: 'Filter by tool name',
        },
        since: {
          type: 'string',
          description: 'Include receipts since this RFC 3339 timestamp',
        },
        until: {
          type: 'string',
          description: 'Include receipts until this RFC 3339 timestamp',
        },
        status: {
          type: 'string',
          enum: ['ok', 'error', 'timeout', 'canceled'],
          description: 'Filter by result status',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results (default: 100)',
        },
        offset: {
          type: 'integer',
          description: 'Skip this many results (for pagination)',
        },
      },
    },

    async execute(params: QueryParams): Promise<QueryResult> {
      const fs = await import('fs');
      const path = await import('path');

      try {
        const files = await fs.promises.readdir(outputDir);
        const receiptFiles = files.filter((f) => f.endsWith('.peac.json'));

        const matches: QueryMatch[] = [];
        const limit = params.limit || 100;
        const offset = params.offset || 0;

        for (const file of receiptFiles) {
          const filePath = path.join(outputDir, file);
          const stat = await fs.promises.stat(filePath);

          // Apply time filters
          if (params.since && stat.mtime < new Date(params.since)) {
            continue;
          }
          if (params.until && stat.mtime > new Date(params.until)) {
            continue;
          }

          // Read and parse receipt
          const content = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
          const interaction = content?.evidence?.extensions?.['org.peacprotocol/interaction@0.1'];
          const workflow = content?.auth?.extensions?.['org.peacprotocol/workflow'];

          // Apply workflow filter
          if (params.workflow_id && workflow?.workflow_id !== params.workflow_id) {
            continue;
          }

          // Apply tool filter
          if (params.tool_name && interaction?.tool?.name !== params.tool_name) {
            continue;
          }

          // Apply status filter
          if (params.status && interaction?.result?.status !== params.status) {
            continue;
          }

          matches.push({
            file,
            receipt_id: content.auth?.rid,
            interaction_id: interaction?.interaction_id,
            workflow_id: workflow?.workflow_id,
            tool_name: interaction?.tool?.name,
            status: interaction?.result?.status,
            started_at: interaction?.started_at,
            completed_at: interaction?.completed_at,
          });
        }

        // Sort by started_at descending (newest first)
        matches.sort((a, b) => {
          const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
          const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
          return bTime - aTime;
        });

        // Apply pagination
        const paginated = matches.slice(offset, offset + limit);

        return {
          status: 'ok',
          total: matches.length,
          offset,
          limit,
          results: paginated,
        };
      } catch (error) {
        logger.error('Query failed:', error);
        return {
          status: 'error',
          total: 0,
          offset: 0,
          limit: params.limit || 100,
          results: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };
}

interface QueryParams {
  workflow_id?: string;
  tool_name?: string;
  since?: string;
  until?: string;
  status?: 'ok' | 'error' | 'timeout' | 'canceled';
  limit?: number;
  offset?: number;
}

interface QueryMatch {
  file: string;
  receipt_id?: string;
  interaction_id?: string;
  workflow_id?: string;
  tool_name?: string;
  status?: string;
  started_at?: string;
  completed_at?: string;
}

interface QueryResult {
  status: 'ok' | 'error';
  total: number;
  offset: number;
  limit: number;
  results: QueryMatch[];
  error?: string;
}
