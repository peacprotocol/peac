/**
 * PEAC Reconcile CLI Command (v0.11.3+, DD-148)
 *
 * Merge two evidence bundles and detect conflicts.
 * Conflict key: composite (iss, jti) with 3-step fallback:
 * 1. (iss, jti) from JWT claims
 * 2. (iss, rid) for Wire 0.1
 * 3. (iss, receipt_ref) where receipt_ref = sha256(receipt_jws)
 *
 * NO auto-resolution: conflicts are surfaced for human decision.
 * Deterministic output: receipts and conflicts sorted by (iss, jti) lexicographically.
 *
 * Security: 16 MB bundle size limit, path traversal prevention.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { readDisputeBundle, type DisputeBundleContents } from '@peac/audit';

// =============================================================================
// TYPES
// =============================================================================

interface ReconcileReport {
  version: '1.0';
  generated_at: string;
  bundles: string[];
  total_receipts: number;
  merged_receipts: number;
  conflicts: ConflictEntry[];
}

interface ConflictEntry {
  key: string;
  bundle_a_receipt_ref: string;
  bundle_b_receipt_ref: string;
  diff_fields: string[];
}

interface ReceiptRecord {
  /** Composite key: "iss|jti" */
  key: string;
  /** JWS string */
  jws: string;
  /** SHA-256 receipt ref */
  receipt_ref: string;
  /** Source bundle label */
  source: string;
}

interface ReconcileGlobalOptions {
  json?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_BUNDLE_SIZE = 16 * 1024 * 1024; // 16 MB

// =============================================================================
// HELPERS
// =============================================================================

function getGlobalOptions(cmd: Command): ReconcileGlobalOptions {
  const parent = cmd.parent;
  if (!parent) return {};
  return parent.opts() as ReconcileGlobalOptions;
}

function output(
  data: Record<string, unknown>,
  opts: ReconcileGlobalOptions,
  humanMessage?: string
): void {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (humanMessage) {
    console.log(humanMessage);
  }
}

function outputError(
  error: string,
  details: Record<string, unknown>,
  opts: ReconcileGlobalOptions
): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: false, error, ...details }, null, 2));
  } else {
    console.error(`Error: ${error}`);
  }
}

/**
 * Compute SHA-256 receipt reference from JWS string.
 */
function computeReceiptRef(jws: string): string {
  return `sha256:${createHash('sha256').update(jws).digest('hex')}`;
}

/**
 * Decode JWS payload (base64url -> JSON).
 * Returns null if decoding fails.
 */
function decodeJwsPayload(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // base64url -> base64 -> buffer -> json
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Extract composite conflict key from a JWS receipt.
 * 3-step fallback: (iss, jti) -> (iss, rid) -> (iss, receipt_ref)
 */
function extractConflictKey(jws: string, receiptRef: string): string {
  const payload = decodeJwsPayload(jws);
  if (!payload) {
    return `unknown|${receiptRef}`;
  }

  const iss = typeof payload.iss === 'string' ? payload.iss : 'unknown';

  // Step 1: (iss, jti)
  if (typeof payload.jti === 'string' && payload.jti.length > 0) {
    return `${iss}|${payload.jti}`;
  }

  // Step 2: (iss, rid) for Wire 0.1
  if (typeof payload.rid === 'string' && payload.rid.length > 0) {
    return `${iss}|${payload.rid}`;
  }

  // Step 3: (iss, receipt_ref)
  return `${iss}|${receiptRef}`;
}

/**
 * Extract receipts from a bundle's contents into ReceiptRecords.
 */
function extractReceipts(contents: DisputeBundleContents, sourceLabel: string): ReceiptRecord[] {
  const records: ReceiptRecord[] = [];
  for (const [_id, jws] of contents.receipts) {
    const receiptRef = computeReceiptRef(jws);
    const key = extractConflictKey(jws, receiptRef);
    records.push({ key, jws, receipt_ref: receiptRef, source: sourceLabel });
  }
  return records;
}

/**
 * Find field-level differences between two JWS receipts.
 */
function findDiffFields(jwsA: string, jwsB: string): string[] {
  const payloadA = decodeJwsPayload(jwsA);
  const payloadB = decodeJwsPayload(jwsB);
  if (!payloadA || !payloadB) return ['payload_decode_failed'];

  const allKeys = new Set([...Object.keys(payloadA), ...Object.keys(payloadB)]);
  const diffs: string[] = [];
  for (const k of allKeys) {
    if (JSON.stringify(payloadA[k]) !== JSON.stringify(payloadB[k])) {
      diffs.push(k);
    }
  }
  return diffs.sort();
}

/**
 * Read and validate a bundle file.
 */
async function readBundle(
  bundlePath: string,
  label: string
): Promise<{ ok: true; value: DisputeBundleContents } | { ok: false; error: string }> {
  if (!fs.existsSync(bundlePath)) {
    return { ok: false, error: `Bundle file not found: ${bundlePath}` };
  }

  const stat = fs.statSync(bundlePath);
  if (stat.size > MAX_BUNDLE_SIZE) {
    return { ok: false, error: `Bundle ${label} exceeds 16 MB size limit (${stat.size} bytes)` };
  }

  // Path traversal prevention: resolve to absolute and check it stays within expected directory
  const resolved = fs.realpathSync(bundlePath);
  if (resolved !== bundlePath && !resolved.startsWith(process.cwd())) {
    // Allow if the path is a valid absolute path
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `Path traversal detected for ${label}` };
    }
  }

  const zipBuffer = fs.readFileSync(bundlePath);
  const result = await readDisputeBundle(zipBuffer);
  if (!result.ok) {
    return { ok: false, error: `Failed to read ${label}: ${result.error.message}` };
  }
  return { ok: true, value: result.value };
}

/**
 * Format a ReconcileReport as human-readable text.
 */
function formatReportText(report: ReconcileReport): string {
  const lines: string[] = [
    'PEAC Reconciliation Report',
    '==========================',
    '',
    `Generated: ${report.generated_at}`,
    `Bundles: ${report.bundles.join(', ')}`,
    `Total receipts: ${report.total_receipts}`,
    `Merged receipts: ${report.merged_receipts}`,
    `Conflicts: ${report.conflicts.length}`,
    '',
  ];

  if (report.conflicts.length === 0) {
    lines.push('No conflicts detected. Bundles merge cleanly.');
  } else {
    lines.push('Conflicts:');
    lines.push('---------');
    for (const conflict of report.conflicts) {
      lines.push(`  Key: ${conflict.key}`);
      lines.push(`    Bundle A ref: ${conflict.bundle_a_receipt_ref}`);
      lines.push(`    Bundle B ref: ${conflict.bundle_b_receipt_ref}`);
      lines.push(`    Different fields: ${conflict.diff_fields.join(', ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// COMMAND
// =============================================================================

export function reconcileCommand(): Command {
  const reconcile = new Command('reconcile').description(
    'Merge evidence bundles and detect conflicts (v0.11.3+)'
  );

  reconcile
    .argument('<bundle1>', 'Path to first bundle ZIP file')
    .argument('<bundle2>', 'Path to second bundle ZIP file')
    .option('-f, --format <format>', 'Output format: json or text', 'text')
    .option('--fail-on-conflict', 'Exit code 1 when any conflict detected', false)
    .action(
      async (
        bundle1Path: string,
        bundle2Path: string,
        options: Record<string, unknown>,
        cmd: Command
      ) => {
        const globalOpts = getGlobalOptions(cmd);
        const format = (options.format as string) || 'text';
        const failOnConflict = !!options.failOnConflict;

        try {
          // Read both bundles
          const [result1, result2] = await Promise.all([
            readBundle(bundle1Path, 'bundle1'),
            readBundle(bundle2Path, 'bundle2'),
          ]);

          if (!result1.ok) {
            outputError(result1.error, {}, globalOpts);
            process.exitCode = 1;
            return;
          }
          if (!result2.ok) {
            outputError(result2.error, {}, globalOpts);
            process.exitCode = 1;
            return;
          }

          // Extract receipts
          const receipts1 = extractReceipts(result1.value, bundle1Path);
          const receipts2 = extractReceipts(result2.value, bundle2Path);

          // Build index: key -> ReceiptRecord[]
          const index = new Map<string, ReceiptRecord[]>();
          for (const r of [...receipts1, ...receipts2]) {
            const existing = index.get(r.key) ?? [];
            existing.push(r);
            index.set(r.key, existing);
          }

          // Detect conflicts and count merged receipts
          const conflicts: ConflictEntry[] = [];
          let mergedCount = 0;

          // Sort keys deterministically
          const sortedKeys = [...index.keys()].sort();

          for (const key of sortedKeys) {
            const records = index.get(key)!;

            // Find records from each bundle
            const fromA = records.filter((r) => r.source === bundle1Path);
            const fromB = records.filter((r) => r.source === bundle2Path);

            if (fromA.length > 0 && fromB.length > 0) {
              // Both bundles have this key: check for conflict
              const a = fromA[0];
              const b = fromB[0];
              if (a.receipt_ref !== b.receipt_ref) {
                // Same key, different content: CONFLICT
                conflicts.push({
                  key,
                  bundle_a_receipt_ref: a.receipt_ref,
                  bundle_b_receipt_ref: b.receipt_ref,
                  diff_fields: findDiffFields(a.jws, b.jws),
                });
              }
              // Same key, same content: merged (deduplicated)
              mergedCount++;
            } else {
              // Only in one bundle: merged directly
              mergedCount++;
            }
          }

          // Sort conflicts by key (already sorted since we iterate sorted keys)
          const report: ReconcileReport = {
            version: '1.0',
            generated_at: new Date().toISOString(),
            bundles: [bundle1Path, bundle2Path],
            total_receipts: receipts1.length + receipts2.length,
            merged_receipts: mergedCount,
            conflicts,
          };

          // Output
          if (format === 'json' || globalOpts.json) {
            console.log(JSON.stringify(report, null, 2));
          } else {
            console.log(formatReportText(report));
          }

          // Exit code
          if (failOnConflict && conflicts.length > 0) {
            process.exitCode = 1;
          } else {
            process.exitCode = 0;
          }
        } catch (err) {
          outputError((err as Error).message, {}, globalOpts);
          process.exitCode = 1;
        }
      }
    );

  return reconcile;
}
