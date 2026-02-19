/**
 * Bundle handler -- ZERO MCP SDK imports (DD-57)
 *
 * Creates a signed evidence bundle directory from receipt JWS strings.
 * Requires issuerKey + issuerId + bundleDir on ServerContext.
 */

import { writeFile, rm, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sign, sha256Hex, base64urlEncode } from '@peac/crypto';
import type { HandlerParams, HandlerResult } from './types.js';
import type { BundleInput } from '../schemas/bundle.js';
import { McpServerError, sanitizeOutput } from '../infra/errors.js';
import { checkToolEnabled, truncateResponse } from './guards.js';
import { assertRelativePath, createTempDir, atomicWriteDir } from '../infra/path-safety.js';
import { SERVER_VERSION } from '../infra/constants.js';

/**
 * Stable JSON stringify with sorted keys at all levels.
 * Produces deterministic output regardless of property insertion order.
 * Uses 2-space indentation for human readability.
 */
function stableJsonStringify(value: unknown): string {
  return (
    JSON.stringify(
      value,
      (_key, val) => {
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          const sorted: Record<string, unknown> = {};
          for (const k of Object.keys(val as Record<string, unknown>).sort()) {
            sorted[k] = (val as Record<string, unknown>)[k];
          }
          return sorted;
        }
        return val;
      },
      2
    ) + '\n'
  );
}

/**
 * Build Trust Gate 1 patterns from the actual loaded key.
 */
function buildKeyPatterns(privateKey: Uint8Array, publicKey: Uint8Array): RegExp[] {
  const privB64 = base64urlEncode(privateKey);
  const pubB64 = base64urlEncode(publicKey);
  const escPriv = privB64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escPub = pubB64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [new RegExp(escPriv, 'g'), new RegExp(escPub, 'g')];
}

/**
 * Generate a default bundle directory name with timestamp + random suffix.
 */
function generateBundleName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = randomUUID().slice(0, 8);
  return `bundle-${ts}-${rand}`;
}

export async function handleCreateBundle(
  params: HandlerParams<BundleInput>
): Promise<HandlerResult> {
  const { input, policy, context } = params;

  // Guard: tool enablement
  const disabledResult = checkToolEnabled('peac_create_bundle', policy);
  if (disabledResult) return disabledResult;

  // Guard: bundleDir must be configured
  if (!context.bundleDir) {
    return {
      text: 'Bundle creation failed: server not configured with --bundle-dir',
      structured: {
        ok: false,
        code: 'E_MCP_BUNDLE_DIR_REQUIRED',
        message: 'Server requires --bundle-dir for peac_create_bundle',
      },
      isError: true,
    };
  }

  // Guard: issuer key + id must be configured (for manifest signing)
  if (!context.issuerKey || !context.issuerId) {
    return {
      text: 'Bundle creation failed: server not configured with issuer key and ID',
      structured: {
        ok: false,
        code: 'E_MCP_KEY_REQUIRED',
        message: 'Server requires --issuer-key and --issuer-id for peac_create_bundle',
      },
      isError: true,
    };
  }

  // Guard: receipt count limit
  if (input.receipts.length > policy.limits.max_bundle_receipts) {
    return {
      text: `Input rejected: ${input.receipts.length} receipts exceeds limit of ${policy.limits.max_bundle_receipts}`,
      structured: {
        ok: false,
        code: 'E_MCP_INPUT_TOO_LARGE',
        message: `${input.receipts.length} receipts exceeds limit of ${policy.limits.max_bundle_receipts}`,
      },
      isError: true,
    };
  }

  // Guard: total byte size
  let totalReceiptBytes = 0;
  for (const r of input.receipts) {
    totalReceiptBytes += new TextEncoder().encode(r).length;
  }
  if (totalReceiptBytes > policy.limits.max_bundle_bytes) {
    return {
      text: `Input rejected: total receipt bytes ${totalReceiptBytes} exceeds limit of ${policy.limits.max_bundle_bytes}`,
      structured: {
        ok: false,
        code: 'E_MCP_INPUT_TOO_LARGE',
        message: `Total receipt bytes ${totalReceiptBytes} exceeds limit of ${policy.limits.max_bundle_bytes}`,
      },
      isError: true,
    };
  }

  // Validate or generate output_path
  const outputName = input.output_path ?? generateBundleName();
  try {
    assertRelativePath(outputName);
  } catch (err) {
    return {
      text: `Bundle creation failed: ${err instanceof Error ? err.message : String(err)}`,
      structured: {
        ok: false,
        code: 'E_MCP_PATH_TRAVERSAL',
        message: err instanceof Error ? err.message : String(err),
      },
      isError: true,
    };
  }

  // Build Trust Gate 1 patterns
  const keyPatterns = buildKeyPatterns(context.issuerKey.privateKey, context.issuerKey.publicKey);

  let tempDir: string | undefined;
  try {
    // Create temp working directory (0o700: owner-only access)
    tempDir = await createTempDir(context.bundleDir);

    // Write receipts and compute hashes
    const receiptsDir = join(tempDir, 'receipts');
    await mkdir(receiptsDir, { mode: 0o700 });

    interface ReceiptEntry {
      index: number;
      file: string;
      sha256: string;
      length: number;
    }

    const entries: ReceiptEntry[] = [];
    let totalBytes = 0;

    // Dedup by sha256: identical receipts produce one file and one manifest
    // entry. This is explicit behavior, not an accident of hash-named files.
    const seenHashes = new Set<string>();
    const receiptHashes: string[] = [];

    for (let i = 0; i < input.receipts.length; i++) {
      // Check cancellation at each iteration to avoid unnecessary disk I/O
      if (params.signal?.aborted) {
        throw new McpServerError('E_MCP_CANCELLED', 'Request cancelled during bundle creation');
      }

      const jws = input.receipts[i];
      const data = new TextEncoder().encode(jws);
      const hash = await sha256Hex(data);

      if (seenHashes.has(hash)) continue; // skip duplicate receipt
      seenHashes.add(hash);
      receiptHashes.push(hash);

      // Name receipt files by content hash for input-order independence.
      // Same receipt set in any order produces identical file structure.
      const fileName = `${hash}.jws`;
      const filePath = join(receiptsDir, fileName);
      await writeFile(filePath, data, { mode: 0o600 });
      entries.push({
        index: i,
        file: `receipts/${fileName}`,
        sha256: hash,
        length: data.length,
      });
      totalBytes += data.length;
    }

    // Sort entries by sha256 for canonical ordering.
    // Note: the manifest includes `created_at` (wall-clock time), so manifest
    // content and its signature will differ across runs. Only `bundle_id` is
    // fully deterministic (content-addressable from policy + receipt hashes).
    entries.sort((a, b) => a.sha256.localeCompare(b.sha256));

    // Compute content-addressable bundle_id: deterministic identifier
    // independent of wall-clock time. Same policy + same receipts = same bundle_id.
    const sortedHashes = [...receiptHashes].sort();
    const bundleIdInput = `${context.policyHash}:${sortedHashes.join(':')}`;
    const bundleId = await sha256Hex(new TextEncoder().encode(bundleIdInput));

    const manifest = {
      bundle_id: bundleId,
      tool_version: SERVER_VERSION,
      created_at: new Date().toISOString(),
      policy_hash: context.policyHash,
      receipt_count: entries.length,
      receipts: entries,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    // Write manifest.json with canonical key ordering (0o600: owner rw)
    const manifestJson = stableJsonStringify(manifest);
    await writeFile(join(tempDir, 'manifest.json'), manifestJson, { mode: 0o600 });
    totalBytes += new TextEncoder().encode(manifestJson).length;

    // Compute manifest hash for the response (caller uses this for integrity checks)
    const manifestBytes = new TextEncoder().encode(manifestJson);
    const manifestSha256 = await sha256Hex(manifestBytes);

    // Sign the canonical manifest object. The signature covers the full
    // manifest including `created_at`, so it is NOT reproducible across runs.
    // Parse the stable-stringified JSON back so the sign() function
    // receives an object whose property order matches the on-disk file.
    const canonicalManifest = JSON.parse(manifestJson) as Record<string, unknown>;
    const manifestJws = await sign(
      canonicalManifest,
      context.issuerKey.privateKey,
      context.issuerKey.kid
    );
    await writeFile(join(tempDir, 'manifest.jws'), manifestJws, { mode: 0o600 });
    totalBytes += new TextEncoder().encode(manifestJws).length;

    // File count: unique receipts + manifest.json + manifest.jws
    const fileCount = entries.length + 2;

    // Atomic move to final path
    const finalPath = join(context.bundleDir, outputName);

    // Check final path doesn't already exist
    try {
      await stat(finalPath);
      // If we get here, it exists -- error
      return {
        text: `Bundle creation failed: output path already exists: ${outputName}`,
        structured: {
          ok: false,
          code: 'E_MCP_BUNDLE_FAILED',
          message: `Output path already exists: ${outputName}`,
        },
        isError: true,
      };
    } catch (err) {
      // ENOENT is expected -- path doesn't exist yet
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }

    await atomicWriteDir(tempDir, finalPath);
    tempDir = undefined; // Don't clean up -- rename succeeded

    const tr = truncateResponse(
      `Bundle created: ${outputName} (${fileCount} files, ${totalBytes} bytes)`,
      policy
    );
    const safeText = sanitizeOutput(tr.text, keyPatterns);

    // Return metadata only -- full manifest and manifestJws live on disk.
    // This prevents multi-KB JSON in MCP responses (client/UI stability).
    // Return bundleName (relative to --bundle-dir), not absolute path --
    // the absolute path leaks host filesystem layout to the LLM context.
    return {
      text: safeText,
      structured: {
        ok: true,
        bundleId: bundleId,
        bundleName: outputName,
        receiptCount: entries.length,
        fileCount,
        totalBytes,
        createdAt: manifest.created_at,
        manifestSha256,
      },
    };
  } catch (err) {
    // Clean up temp dir on failure
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }

    const rawMessage = err instanceof Error ? err.message : String(err);
    const safeMessage = sanitizeOutput(rawMessage, keyPatterns);

    if (err instanceof McpServerError) {
      return {
        text: `Bundle creation failed: ${safeMessage}`,
        structured: {
          ok: false,
          code: err.code,
          message: safeMessage,
        },
        isError: true,
      };
    }

    return {
      text: `Bundle creation failed: ${safeMessage}`,
      structured: {
        ok: false,
        code: 'E_MCP_BUNDLE_FAILED',
        message: safeMessage,
      },
      isError: true,
    };
  }
}
