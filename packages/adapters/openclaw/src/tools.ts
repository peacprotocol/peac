/**
 * @peac/adapter-openclaw - Plugin Tools
 *
 * Tools exposed by the PEAC receipts plugin for OpenClaw.
 *
 * @experimental This module is experimental and may change.
 */

import type { PluginTool, PluginLogger } from './plugin.js';

// =============================================================================
// Constants
// =============================================================================

/** Maximum files to scan for status (DoS protection) */
const MAX_STATUS_FILE_SCAN = 1000;

/** Maximum files to parse for query (DoS protection) */
const MAX_QUERY_FILE_PARSE = 10000;

/** Maximum file size in bytes to read (DoS protection) - 10MB */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Allowed JWS algorithms (security) */
const ALLOWED_ALGORITHMS = ['EdDSA', 'ES256', 'ES384', 'ES512', 'RS256', 'RS384', 'RS512'] as const;

/** Algorithm to key type compatibility map */
const ALG_KEY_TYPE_MAP: Record<string, { kty: string; crv?: string[] }> = {
  EdDSA: { kty: 'OKP', crv: ['Ed25519', 'Ed448'] },
  ES256: { kty: 'EC', crv: ['P-256'] },
  ES384: { kty: 'EC', crv: ['P-384'] },
  ES512: { kty: 'EC', crv: ['P-521'] },
  RS256: { kty: 'RSA' },
  RS384: { kty: 'RSA' },
  RS512: { kty: 'RSA' },
};

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
      const pathModule = await import('path');

      // Use path.resolve for portability
      const resolvedOutputDir = pathModule.resolve(outputDir);

      // Count receipts in output directory (capped for performance)
      let receiptCount = 0;
      let lastReceiptTime: string | null = null;
      let oldestReceiptTime: string | null = null;
      let countApproximate = false;

      try {
        const files = await fs.promises.readdir(resolvedOutputDir);
        const receiptFiles = files.filter((f) => f.endsWith('.peac.json'));
        receiptCount = receiptFiles.length;

        // Cap the scan for performance
        const filesToScan = receiptFiles.slice(0, MAX_STATUS_FILE_SCAN);
        countApproximate = receiptFiles.length > MAX_STATUS_FILE_SCAN;

        if (filesToScan.length > 0) {
          // Get timestamps from file stats (capped)
          const fileStats = await Promise.all(
            filesToScan.map(async (f) => {
              const stat = await fs.promises.stat(pathModule.join(resolvedOutputDir, f));
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
          count_approximate: countApproximate,
          output_dir: resolvedOutputDir,
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
    count_approximate: boolean;
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
 * Exports receipts as a bundle directory for audit.
 *
 * Note: Creates a directory structure, not a ZIP archive.
 * Use @peac/audit createDisputeBundle for production ZIP bundles.
 */
export function createExportBundleTool(
  outputDir: string,
  logger: PluginLogger
): PluginTool {
  return {
    name: 'peac_receipts.export_bundle',
    description: 'Export receipts as a bundle directory for audit (manifest.json + receipts/)',
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
          description: 'Output path for bundle directory (default: peac-bundle-{timestamp})',
        },
      },
    },

    async execute(params: ExportBundleParams): Promise<ExportBundleResult> {
      const fs = await import('fs');
      const pathModule = await import('path');

      // Use path.resolve for portability
      const resolvedOutputDir = pathModule.resolve(outputDir);

      try {
        // List receipts
        const files = await fs.promises.readdir(resolvedOutputDir);
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
          const filePath = pathModule.join(resolvedOutputDir, file);
          let stat;
          try {
            stat = await fs.promises.stat(filePath);
          } catch {
            // Skip files that can't be stat'd
            continue;
          }

          // Apply time filters
          if (params.since && stat.mtime < new Date(params.since)) {
            continue;
          }
          if (params.until && stat.mtime > new Date(params.until)) {
            continue;
          }

          // Read and parse receipt (tolerate invalid JSON)
          let content;
          try {
            content = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
          } catch {
            logger.warn(`Skipping invalid JSON in ${file}`);
            continue;
          }

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
          format: 'peac-bundle-directory',
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

        // Determine output path (directory, not ZIP)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const bundleDir = params.output_path
          ? pathModule.resolve(params.output_path)
          : pathModule.join(resolvedOutputDir, `peac-bundle-${timestamp}`);

        await fs.promises.mkdir(bundleDir, { recursive: true });

        // Write manifest
        await fs.promises.writeFile(
          pathModule.join(bundleDir, 'manifest.json'),
          JSON.stringify(manifest, null, 2)
        );

        // Copy receipts
        const receiptsDir = pathModule.join(bundleDir, 'receipts');
        await fs.promises.mkdir(receiptsDir, { recursive: true });

        for (const receipt of receipts) {
          await fs.promises.writeFile(
            pathModule.join(receiptsDir, receipt.file),
            JSON.stringify(receipt.content, null, 2)
          );
        }

        logger.info(`Exported ${receipts.length} receipts to ${bundleDir}`);

        return {
          status: 'ok',
          message: `Exported ${receipts.length} receipts to directory`,
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
  // Check file size before reading (DoS protection)
  const stat = await fs.promises.stat(receiptPath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    return {
      status: 'error',
      valid: false,
      message: `File too large: ${stat.size} bytes exceeds limit of ${MAX_FILE_SIZE_BYTES} bytes`,
      errors: [`File size ${stat.size} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`],
    };
  }

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
      const { verify, base64urlDecode, base64urlDecodeString } = await import('@peac/crypto');
      const jwks = JSON.parse(await fs.promises.readFile(jwksPath, 'utf-8'));

      // Parse JWS header to get kid and alg
      const jwsParts = receipt._jws.split('.');
      if (jwsParts.length !== 3) {
        errors.push('Invalid JWS format (expected 3 parts)');
      } else {
        const headerJson = base64urlDecodeString(jwsParts[0]);
        const header = JSON.parse(headerJson) as { kid?: string; alg?: string; crit?: string[] };

        // Reject 'none' algorithm (security)
        if (header.alg === 'none') {
          errors.push('Algorithm "none" is not allowed');
        }

        // Reject algorithms not in allowlist
        if (header.alg && !ALLOWED_ALGORITHMS.includes(header.alg as typeof ALLOWED_ALGORITHMS[number])) {
          errors.push(`Algorithm "${header.alg}" is not in allowed list: ${ALLOWED_ALGORITHMS.join(', ')}`);
        }

        // Reject unknown critical headers (JOSE compliance)
        // Per RFC 7515: crit lists headers that MUST be understood, we don't support any
        if (header.crit && header.crit.length > 0) {
          // Check if crit references headers that are missing (per JOSE spec)
          const headerObj = header as Record<string, unknown>;
          const missingCrit = header.crit.filter((h) => !(h in headerObj));
          if (missingCrit.length > 0) {
            errors.push(`Critical headers declared but missing: ${missingCrit.join(', ')}`);
          }
          // Reject all crit headers since we don't understand any extensions
          errors.push(`Unsupported critical headers: ${header.crit.join(', ')}`);
        }

        const targetKid = header.kid;

        // Strict key selection by kid
        let keyJwk: { kid?: string; kty?: string; crv?: string; x?: string; n?: string; use?: string; key_ops?: string[] } | undefined;
        if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
          errors.push('JWKS has no keys');
        } else if (targetKid) {
          // JWS has kid: require exact match
          keyJwk = jwks.keys.find((k: { kid?: string }) => k.kid === targetKid);
          if (!keyJwk) {
            errors.push(`Key with kid "${targetKid}" not found in JWKS`);
          }
        } else if (jwks.keys.length === 1) {
          // JWS has no kid but JWKS has exactly 1 key: accept it
          keyJwk = jwks.keys[0];
          warnings.push('JWS has no kid - using only key from JWKS');
        } else {
          // JWS has no kid and JWKS has multiple keys: fail
          errors.push(`JWS missing kid but JWKS has ${jwks.keys.length} keys - cannot select`);
        }

        // Verify algorithm matches key type
        if (keyJwk && header.alg && errors.length === 0) {
          const expectedKeyType = ALG_KEY_TYPE_MAP[header.alg];
          if (expectedKeyType) {
            if (keyJwk.kty !== expectedKeyType.kty) {
              errors.push(`Algorithm "${header.alg}" requires key type "${expectedKeyType.kty}" but key has "${keyJwk.kty}"`);
            } else if (expectedKeyType.crv && keyJwk.crv && !expectedKeyType.crv.includes(keyJwk.crv)) {
              errors.push(`Algorithm "${header.alg}" requires curve ${expectedKeyType.crv.join(' or ')} but key has "${keyJwk.crv}"`);
            }
          }

          // Validate key use if present (must be "sig" for signature verification)
          if (keyJwk.use && keyJwk.use !== 'sig') {
            errors.push(`Key use "${keyJwk.use}" is not valid for signature verification (expected "sig")`);
          }

          // Validate key_ops if present (must include "verify")
          if (keyJwk.key_ops && !keyJwk.key_ops.includes('verify')) {
            errors.push(`Key operations ${JSON.stringify(keyJwk.key_ops)} do not include "verify"`);
          }
        }

        if (keyJwk && errors.length === 0) {
          // Get the public key bytes (x for OKP/EC, n for RSA)
          const publicKeyParam = keyJwk.x || keyJwk.n;
          if (!publicKeyParam) {
            errors.push('Selected key missing public key (x or n parameter)');
          } else {
            // Decode base64url public key bytes
            const publicKeyBytes = base64urlDecode(publicKeyParam);
            await verify(receipt._jws, publicKeyBytes);
            logger.info(`Signature verified with key ${keyJwk.kid || 'anonymous'}`);
          }
        }
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
      const pathModule = await import('path');

      // Use path.resolve for portability
      const resolvedOutputDir = pathModule.resolve(outputDir);

      try {
        const files = await fs.promises.readdir(resolvedOutputDir);
        const receiptFiles = files.filter((f) => f.endsWith('.peac.json'));

        const limit = Math.min(params.limit || 100, MAX_QUERY_FILE_PARSE);
        const offset = params.offset || 0;

        // If we have time filters, we can sort by mtime first (cheap) to reduce parsing
        // Get file stats first for time-based pre-filtering
        const fileInfos: Array<{ file: string; mtime: Date }> = [];
        for (const file of receiptFiles.slice(0, MAX_QUERY_FILE_PARSE)) {
          try {
            const filePath = pathModule.join(resolvedOutputDir, file);
            const stat = await fs.promises.stat(filePath);

            // Apply time filters early (before parsing JSON)
            if (params.since && stat.mtime < new Date(params.since)) {
              continue;
            }
            if (params.until && stat.mtime > new Date(params.until)) {
              continue;
            }

            fileInfos.push({ file, mtime: stat.mtime });
          } catch {
            // Skip files that can't be stat'd
            continue;
          }
        }

        // Sort by mtime descending (newest first) before parsing
        fileInfos.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        // Now parse files until we have enough matches
        const matches: QueryMatch[] = [];
        let skippedForFilters = 0;

        let filesSkippedForSize = 0;
        let filesSkippedForInvalidJson = 0;
        for (const { file } of fileInfos) {
          const filePath = pathModule.join(resolvedOutputDir, file);

          // Check file size before reading (DoS protection)
          try {
            const fileStat = await fs.promises.stat(filePath);
            if (fileStat.size > MAX_FILE_SIZE_BYTES) {
              filesSkippedForSize++;
              continue;
            }
          } catch {
            continue;
          }

          // Read and parse receipt (tolerate invalid JSON)
          let content;
          try {
            content = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
          } catch {
            // Skip invalid JSON files
            filesSkippedForInvalidJson++;
            continue;
          }

          const interaction = content?.evidence?.extensions?.['org.peacprotocol/interaction@0.1'];
          const workflow = content?.auth?.extensions?.['org.peacprotocol/workflow'];

          // Apply workflow filter
          if (params.workflow_id && workflow?.workflow_id !== params.workflow_id) {
            skippedForFilters++;
            continue;
          }

          // Apply tool filter
          if (params.tool_name && interaction?.tool?.name !== params.tool_name) {
            skippedForFilters++;
            continue;
          }

          // Apply status filter
          if (params.status && interaction?.result?.status !== params.status) {
            skippedForFilters++;
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

          // Early exit if we have enough matches (limit + offset)
          // This avoids parsing all files when we only need a few
          if (matches.length >= offset + limit + 100) {
            // Buffer of 100 for sorting stability
            break;
          }
        }

        // Final sort by started_at (more accurate than mtime), then by filename for determinism
        matches.sort((a, b) => {
          const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
          const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
          if (bTime !== aTime) return bTime - aTime;
          // Secondary sort by filename for deterministic ordering
          return a.file.localeCompare(b.file);
        });

        // Apply pagination
        const paginated = matches.slice(offset, offset + limit);

        // Build warnings for truncation
        const warnings: string[] = [];
        if (receiptFiles.length > MAX_QUERY_FILE_PARSE) {
          warnings.push(`Results capped at ${MAX_QUERY_FILE_PARSE} files`);
        }
        if (filesSkippedForSize > 0) {
          warnings.push(`${filesSkippedForSize} files skipped (exceeded ${MAX_FILE_SIZE_BYTES} byte limit)`);
        }
        if (filesSkippedForInvalidJson > 0) {
          warnings.push(`${filesSkippedForInvalidJson} files skipped (invalid JSON)`);
        }

        const hasTruncation = receiptFiles.length > MAX_QUERY_FILE_PARSE || filesSkippedForSize > 0 || filesSkippedForInvalidJson > 0;

        return {
          status: 'ok',
          total: matches.length,
          offset,
          limit,
          results: paginated,
          truncated: hasTruncation,
          skipped: hasTruncation ? {
            too_large: filesSkippedForSize,
            invalid_json: filesSkippedForInvalidJson,
            capped: receiptFiles.length > MAX_QUERY_FILE_PARSE ? receiptFiles.length - MAX_QUERY_FILE_PARSE : 0,
          } : undefined,
          ...(warnings.length > 0 && { warning: warnings.join('; ') }),
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
  truncated?: boolean;
  skipped?: {
    too_large: number;
    invalid_json: number;
    capped: number;
  };
  error?: string;
  warning?: string;
}
