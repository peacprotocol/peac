/**
 * Dispute Bundle (v0.9.30+)
 *
 * DisputeBundle is a ZIP archive containing receipts, keys, and policy
 * for offline verification and audit.
 *
 * Key design principles:
 * 1. ZIP is transport container, not what we hash - deterministic integrity at content layer
 * 2. bundle.sig provides authenticity (JWS over content_hash)
 * 3. receipts.ndjson format for determinism + streaming
 * 4. Real Ed25519 signature verification
 */

import { createHash } from 'node:crypto';
import { posix as pathPosix } from 'node:path';
import { canonicalize } from '@peac/crypto';
import { BUNDLE_ERRORS } from '@peac/kernel';
import * as yazl from 'yazl';
import * as yauzl from 'yauzl';

import type {
  BundleError,
  BundleResult,
  BundleTimeRange,
  CreateDisputeBundleOptions,
  DisputeBundleContents,
  DisputeBundleManifest,
  JsonWebKey,
  JsonWebKeySet,
  ManifestFileEntry,
  ManifestKeyEntry,
  ManifestReceiptEntry,
} from './dispute-bundle-types.js';

import { DISPUTE_BUNDLE_VERSION } from './dispute-bundle-types.js';

// ============================================================================
// Constants and Limits (DoS protection)
// ============================================================================

/** Maximum number of entries in a bundle ZIP */
const MAX_ZIP_ENTRIES = 10000;

/** Maximum uncompressed size per entry (64MB) */
const MAX_ENTRY_SIZE = 64 * 1024 * 1024;

/** Maximum total uncompressed size (512MB) */
const MAX_TOTAL_SIZE = 512 * 1024 * 1024;

/** Maximum receipts in a bundle */
const MAX_RECEIPTS = 10000;

/** Allowed path prefixes in bundle */
const ALLOWED_PATHS = ['manifest.json', 'bundle.sig', 'receipts.ndjson', 'keys/', 'policy/'];

// ============================================================================
// Error Codes (from @peac/kernel - generated from specs/kernel/errors.json)
// ============================================================================

/**
 * Re-export BUNDLE_ERRORS as BundleErrorCodes for backwards compatibility
 * @deprecated Use BUNDLE_ERRORS from @peac/kernel directly
 */
export const BundleErrorCodes = BUNDLE_ERRORS;

// ============================================================================
// Utilities
// ============================================================================

/** Crockford's Base32 alphabet for ULID */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generate a spec-compliant ULID (Universally Unique Lexicographically Sortable Identifier)
 *
 * ULID format: 26 characters using Crockford's Base32
 * - 10 chars timestamp (48 bits, ms since Unix epoch) - lexicographically sortable
 * - 16 chars randomness (80 bits from crypto.randomBytes)
 *
 * @see https://github.com/ulid/spec
 */
function generateBundleId(): string {
  const timestamp = Date.now();

  // Encode 48-bit timestamp as 10 Crockford Base32 characters
  // Each character encodes 5 bits, but we encode from most significant
  const timestampChars: string[] = [];
  let ts = timestamp;
  for (let i = 9; i >= 0; i--) {
    timestampChars[i] = ULID_ALPHABET[ts % 32];
    ts = Math.floor(ts / 32);
  }

  // Generate 80 bits of randomness (16 Crockford Base32 characters)
  // Use crypto.randomBytes for cryptographic randomness
  const { randomBytes: cryptoRandomBytes } = require('node:crypto') as typeof import('node:crypto');
  const randBytes = cryptoRandomBytes(10); // 80 bits = 10 bytes
  const randomChars: string[] = [];

  // Encode 10 bytes as 16 base32 characters
  // Each base32 char = 5 bits, so we need to carefully extract 5-bit groups
  // We'll use BigInt for clean 80-bit handling
  let randomValue = BigInt(0);
  for (let i = 0; i < 10; i++) {
    randomValue = (randomValue << BigInt(8)) | BigInt(randBytes[i]);
  }

  // Extract 16 characters (5 bits each) from the 80-bit value
  for (let i = 15; i >= 0; i--) {
    randomChars[i] = ULID_ALPHABET[Number(randomValue & BigInt(0x1f))];
    randomValue = randomValue >> BigInt(5);
  }

  return timestampChars.join('') + randomChars.join('');
}

/** Compute SHA-256 hash of data (hex-encoded, lowercase) */
function sha256Hex(data: string | Buffer): string {
  const hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/** Decode base64url to Buffer */
function base64urlDecode(str: string): Buffer {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

/** Parse JWS compact serialization to extract header and payload */
function parseJws(jws: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: Buffer;
  signingInput: string;
} | null {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const headerJson = base64urlDecode(parts[0]).toString('utf8');
    const payloadJson = base64urlDecode(parts[1]).toString('utf8');
    return {
      header: JSON.parse(headerJson) as Record<string, unknown>,
      payload: JSON.parse(payloadJson) as Record<string, unknown>,
      signature: base64urlDecode(parts[2]),
      signingInput: `${parts[0]}.${parts[1]}`,
    };
  } catch {
    return null;
  }
}

/** Create a bundle error */
function bundleError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): BundleError {
  return { code, message, details };
}

/**
 * Convert a yauzl ZIP error to the appropriate bundle error.
 * Detects path traversal attempts that yauzl catches and maps them to PATH_TRAVERSAL.
 */
function handleZipError(zipErr: Error): BundleError {
  // Detect yauzl path validation errors and map to PATH_TRAVERSAL
  // yauzl throws "invalid relative path" for zip-slip attempts
  const isPathError =
    zipErr.message.includes('invalid relative path') ||
    zipErr.message.includes('absolute path') ||
    zipErr.message.includes('..') ||
    zipErr.message.includes('\\');

  if (isPathError) {
    return bundleError(BundleErrorCodes.PATH_TRAVERSAL, `Unsafe path in bundle: ${zipErr.message}`);
  }
  return bundleError(BundleErrorCodes.INVALID_FORMAT, `ZIP error: ${zipErr.message}`);
}

/**
 * Virtual root for path containment checks.
 * Using a fixed virtual root allows resolve-based containment verification.
 */
const VIRTUAL_ROOT = '/bundle';

/**
 * Validate path for zip-slip and path traversal attacks.
 *
 * Security measures:
 * 1. Reject backslashes (Windows path separators can bypass Unix checks)
 * 2. Reject null bytes (can bypass string-based checks)
 * 3. Normalize with posix.normalize to handle . and .. components
 * 4. Reject absolute paths (starting with /)
 * 5. Reject paths that escape via .. after normalization
 * 6. Resolve-based containment check (defense in depth)
 * 7. Only allow explicitly whitelisted path prefixes
 */
function isPathSafe(entryPath: string): boolean {
  // Reject backslashes - often used for zip-slip on Unix systems
  // since many ZIP tools will accept both separators
  if (entryPath.includes('\\')) return false;

  // Reject null bytes (can be used to bypass checks)
  if (entryPath.includes('\0')) return false;

  // Normalize the path to resolve . and .. components
  const normalized = pathPosix.normalize(entryPath);

  // After normalization, reject if:
  // - Starts with / (absolute path)
  // - Starts with .. (escapes bundle root)
  // - Is exactly . (current dir, not a valid file)
  if (normalized.startsWith('/')) return false;
  if (normalized.startsWith('..')) return false;
  if (normalized === '.') return false;

  // Defense in depth: resolve-based containment check
  // Resolve the path relative to a virtual root and verify it stays contained
  const resolved = pathPosix.resolve(VIRTUAL_ROOT, normalized);
  if (!resolved.startsWith(VIRTUAL_ROOT + '/') && resolved !== VIRTUAL_ROOT) {
    return false;
  }

  // Only allow explicitly whitelisted paths
  return ALLOWED_PATHS.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

/** Convert JWK to raw Ed25519 public key bytes */
function jwkToEd25519PublicKey(jwk: JsonWebKey): Buffer | null {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) {
    return null;
  }
  return base64urlDecode(jwk.x);
}

// ============================================================================
// Bundle Creation
// ============================================================================

/**
 * Create a dispute bundle from receipts, keys, and optional policy.
 */
export async function createDisputeBundle(
  options: CreateDisputeBundleOptions
): Promise<BundleResult<Buffer>> {
  const {
    dispute_ref,
    created_by,
    receipts,
    keys,
    policy,
    bundle_id,
    created_at,
    signing_key,
    signing_kid,
  } = options;

  // Validate receipts
  if (receipts.length === 0) {
    return {
      ok: false,
      error: bundleError(BundleErrorCodes.MISSING_RECEIPTS, 'No receipts provided'),
    };
  }

  if (receipts.length > MAX_RECEIPTS) {
    return {
      ok: false,
      error: bundleError(
        BundleErrorCodes.SIZE_EXCEEDED,
        `Too many receipts: ${receipts.length} > ${MAX_RECEIPTS}`
      ),
    };
  }

  // Validate keys
  if (keys.keys.length === 0) {
    return {
      ok: false,
      error: bundleError(BundleErrorCodes.MISSING_KEYS, 'No keys provided in JWKS'),
    };
  }

  // Parse receipts and detect duplicates
  const receiptEntries: ManifestReceiptEntry[] = [];
  const seenReceiptIds = new Set<string>();
  const ndjsonLines: string[] = [];
  let minIssuedAt: string | undefined;
  let maxIssuedAt: string | undefined;

  for (let i = 0; i < receipts.length; i++) {
    const jws = receipts[i];
    const parsed = parseJws(jws);

    if (!parsed) {
      return {
        ok: false,
        error: bundleError(BundleErrorCodes.RECEIPT_INVALID, `Invalid JWS at index ${i}`),
      };
    }

    const claims = parsed.payload;
    const receiptId = claims.jti as string | undefined;
    const issuedAtRaw = claims.iat as number | string | undefined;

    if (!receiptId) {
      return {
        ok: false,
        error: bundleError(
          BundleErrorCodes.RECEIPT_INVALID,
          `Receipt at index ${i} missing jti claim`
        ),
      };
    }

    // Detect duplicates
    if (seenReceiptIds.has(receiptId)) {
      return {
        ok: false,
        error: bundleError(
          BundleErrorCodes.DUPLICATE_RECEIPT,
          `Duplicate receipt ID: ${receiptId}`
        ),
      };
    }
    seenReceiptIds.add(receiptId);

    // Convert iat to ISO 8601 string
    let issuedAt: string;
    if (typeof issuedAtRaw === 'number') {
      issuedAt = new Date(issuedAtRaw * 1000).toISOString();
    } else if (typeof issuedAtRaw === 'string') {
      issuedAt = issuedAtRaw;
    } else {
      return {
        ok: false,
        error: bundleError(
          BundleErrorCodes.RECEIPT_INVALID,
          `Receipt ${receiptId} missing or invalid iat claim`
        ),
      };
    }

    // Track time range
    if (!minIssuedAt || issuedAt < minIssuedAt) minIssuedAt = issuedAt;
    if (!maxIssuedAt || issuedAt > maxIssuedAt) maxIssuedAt = issuedAt;

    // Compute receipt hash (SHA-256 of JWS bytes)
    const receiptHash = sha256Hex(Buffer.from(jws, 'utf8'));

    receiptEntries.push({
      receipt_id: receiptId,
      issued_at: issuedAt,
      receipt_hash: receiptHash,
    });

    ndjsonLines.push(jws);
  }

  // Sort receipts by (issued_at, receipt_id, receipt_hash) for determinism
  const sortedIndices = receiptEntries
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => {
      if (a.entry.issued_at !== b.entry.issued_at) {
        return a.entry.issued_at.localeCompare(b.entry.issued_at);
      }
      if (a.entry.receipt_id !== b.entry.receipt_id) {
        return a.entry.receipt_id.localeCompare(b.entry.receipt_id);
      }
      return a.entry.receipt_hash.localeCompare(b.entry.receipt_hash);
    });

  const sortedReceiptEntries = sortedIndices.map((x) => x.entry);
  const sortedNdjsonLines = sortedIndices.map((x) => ndjsonLines[x.i]);

  // Create receipts.ndjson content
  const receiptsNdjson = sortedNdjsonLines.join('\n') + '\n';
  const receiptsNdjsonBytes = Buffer.from(receiptsNdjson, 'utf8');

  // Process keys
  const keyEntries: ManifestKeyEntry[] = keys.keys.map((key) => ({
    kid: key.kid,
    alg: key.alg ?? 'EdDSA',
  }));
  keyEntries.sort((a, b) => a.kid.localeCompare(b.kid));

  const keysJson = JSON.stringify(keys, null, 2);
  const keysBytes = Buffer.from(keysJson, 'utf8');

  // Build file entries
  const fileEntries: ManifestFileEntry[] = [
    {
      path: 'receipts.ndjson',
      sha256: sha256Hex(receiptsNdjsonBytes),
      size: receiptsNdjsonBytes.length,
    },
    {
      path: 'keys/keys.json',
      sha256: sha256Hex(keysBytes),
      size: keysBytes.length,
    },
  ];

  // Process policy if present
  let policyHash: string | undefined;
  let policyBytes: Buffer | undefined;

  if (policy) {
    policyBytes = Buffer.from(policy, 'utf8');
    policyHash = sha256Hex(policyBytes);
    fileEntries.push({
      path: 'policy/policy.yaml',
      sha256: policyHash,
      size: policyBytes.length,
    });
  }

  // Sort files by path
  fileEntries.sort((a, b) => a.path.localeCompare(b.path));

  // Build manifest (without content_hash first)
  const timeRange: BundleTimeRange = {
    start: minIssuedAt!,
    end: maxIssuedAt!,
  };

  const manifestWithoutHash: Omit<DisputeBundleManifest, 'content_hash'> = {
    version: DISPUTE_BUNDLE_VERSION,
    bundle_id: bundle_id ?? generateBundleId(),
    dispute_ref,
    created_by,
    created_at: created_at ?? new Date().toISOString(),
    time_range: timeRange,
    receipts: sortedReceiptEntries,
    keys: keyEntries,
    files: fileEntries,
  };

  if (policyHash) {
    (manifestWithoutHash as DisputeBundleManifest).policy_hash = policyHash;
  }

  // Compute content_hash = SHA-256 of JCS(manifest without content_hash)
  const contentHash = sha256Hex(canonicalize(manifestWithoutHash));

  const manifest: DisputeBundleManifest = {
    ...manifestWithoutHash,
    content_hash: contentHash,
  };

  // Create ZIP archive
  const zipfile = new yazl.ZipFile();

  // Use manifest.created_at as the mtime for all entries to ensure deterministic ZIP output
  // Disable compression to ensure byte-identical output across platforms (zlib implementations vary)
  const mtime = new Date(manifest.created_at);
  const zipOptions = { mtime, compress: false };

  // Add manifest.json
  const manifestJson = JSON.stringify(manifest, null, 2);
  zipfile.addBuffer(Buffer.from(manifestJson), 'manifest.json', zipOptions);

  // Add receipts.ndjson
  zipfile.addBuffer(receiptsNdjsonBytes, 'receipts.ndjson', zipOptions);

  // Add keys
  zipfile.addBuffer(keysBytes, 'keys/keys.json', zipOptions);

  // Add policy if present
  if (policyBytes) {
    zipfile.addBuffer(policyBytes, 'policy/policy.yaml', zipOptions);
  }

  // Add bundle.sig if signing key is provided
  if (signing_key && signing_kid) {
    const sigResult = await createBundleSignature(contentHash, signing_key, signing_kid);
    if (!sigResult.ok) {
      return sigResult;
    }
    zipfile.addBuffer(Buffer.from(sigResult.value), 'bundle.sig', zipOptions);
  }

  // Finalize and collect the ZIP buffer
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    zipfile.outputStream
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => {
        resolve({ ok: true, value: Buffer.concat(chunks) });
      })
      .on('error', (err: Error) => {
        resolve({
          ok: false,
          error: bundleError(
            BundleErrorCodes.INVALID_FORMAT,
            `Failed to create ZIP: ${err.message}`
          ),
        });
      });

    zipfile.end();
  });
}

/**
 * Create bundle.sig JWS over the content_hash
 */
async function createBundleSignature(
  contentHash: string,
  privateKey: Uint8Array,
  kid: string
): Promise<BundleResult<string>> {
  try {
    const { sign } = await import('@peac/crypto');
    const jws = await sign({ content_hash: contentHash }, privateKey, kid);
    return { ok: true, value: jws };
  } catch (err) {
    return {
      ok: false,
      error: bundleError(
        BundleErrorCodes.SIGNATURE_INVALID,
        `Failed to create bundle signature: ${(err as Error).message}`
      ),
    };
  }
}

// ============================================================================
// Bundle Reading
// ============================================================================

/**
 * Read and parse a dispute bundle from a ZIP buffer.
 */
export async function readDisputeBundle(
  zipBuffer: Buffer
): Promise<BundleResult<DisputeBundleContents>> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve({
          ok: false,
          error: bundleError(
            BundleErrorCodes.INVALID_FORMAT,
            `Failed to open ZIP: ${err?.message ?? 'unknown error'}`
          ),
        });
        return;
      }

      const files = new Map<string, Buffer>();
      let entryCount = 0;
      let totalSize = 0; // Claimed total from ZIP metadata
      let actualTotalBytes = 0; // Actual decompressed bytes (defense-in-depth)

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        entryCount++;

        // DoS protection: entry count
        if (entryCount > MAX_ZIP_ENTRIES) {
          zipfile.close();
          resolve({
            ok: false,
            error: bundleError(
              BundleErrorCodes.SIZE_EXCEEDED,
              `Too many ZIP entries: > ${MAX_ZIP_ENTRIES}`
            ),
          });
          return;
        }

        // Security: path validation
        if (!isPathSafe(entry.fileName)) {
          zipfile.close();
          resolve({
            ok: false,
            error: bundleError(
              BundleErrorCodes.PATH_TRAVERSAL,
              `Unsafe path in bundle: ${entry.fileName}`
            ),
          });
          return;
        }

        // DoS protection: entry size
        if (entry.uncompressedSize > MAX_ENTRY_SIZE) {
          zipfile.close();
          resolve({
            ok: false,
            error: bundleError(
              BundleErrorCodes.SIZE_EXCEEDED,
              `Entry too large: ${entry.fileName}`
            ),
          });
          return;
        }

        totalSize += entry.uncompressedSize;
        if (totalSize > MAX_TOTAL_SIZE) {
          zipfile.close();
          resolve({
            ok: false,
            error: bundleError(
              BundleErrorCodes.SIZE_EXCEEDED,
              `Total size exceeded: > ${MAX_TOTAL_SIZE} bytes`
            ),
          });
          return;
        }

        zipfile.openReadStream(entry, (readErr, readStream) => {
          if (readErr || !readStream) {
            zipfile.close();
            resolve({
              ok: false,
              error: bundleError(
                BundleErrorCodes.INVALID_FORMAT,
                `Failed to read ${entry.fileName}`
              ),
            });
            return;
          }

          const chunks: Buffer[] = [];
          let actualBytes = 0;
          const entryBudget = entry.uncompressedSize > 0 ? entry.uncompressedSize : MAX_ENTRY_SIZE;

          readStream.on('data', (chunk: Buffer) => {
            actualBytes += chunk.length;
            actualTotalBytes += chunk.length;

            // Defense-in-depth: Track actual decompressed bytes, not just ZIP metadata.
            // A malicious ZIP can claim small uncompressedSize but decompress to much more.
            if (actualBytes > MAX_ENTRY_SIZE) {
              readStream.destroy();
              zipfile.close();
              resolve({
                ok: false,
                error: bundleError(
                  BundleErrorCodes.SIZE_EXCEEDED,
                  `Entry exceeds size limit during decompression: ${entry.fileName}`,
                  { claimed: entry.uncompressedSize, actual: actualBytes, limit: MAX_ENTRY_SIZE }
                ),
              });
              return;
            }

            // Defense-in-depth: Track actual total decompressed bytes across all entries
            if (actualTotalBytes > MAX_TOTAL_SIZE) {
              readStream.destroy();
              zipfile.close();
              resolve({
                ok: false,
                error: bundleError(
                  BundleErrorCodes.SIZE_EXCEEDED,
                  `Total decompressed size exceeds limit: ${actualTotalBytes} > ${MAX_TOTAL_SIZE}`,
                  { actual: actualTotalBytes, limit: MAX_TOTAL_SIZE }
                ),
              });
              return;
            }

            // Also check against claimed size (detect zip bombs with false metadata)
            if (entry.uncompressedSize > 0 && actualBytes > entry.uncompressedSize * 2) {
              // Allow 2x tolerance for edge cases, but catch gross violations
              readStream.destroy();
              zipfile.close();
              resolve({
                ok: false,
                error: bundleError(
                  BundleErrorCodes.SIZE_EXCEEDED,
                  `Entry decompressed size exceeds claimed size: ${entry.fileName}`,
                  { claimed: entry.uncompressedSize, actual: actualBytes }
                ),
              });
              return;
            }

            chunks.push(chunk);
          });

          readStream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zipfile.readEntry();
          });
          readStream.on('error', (streamErr: Error) => {
            zipfile.close();
            resolve({
              ok: false,
              error: bundleError(
                BundleErrorCodes.INVALID_FORMAT,
                `Stream error: ${streamErr.message}`
              ),
            });
          });
        });
      });

      zipfile.on('end', () => {
        processExtractedFiles(files, resolve);
      });

      zipfile.on('error', (zipErr: Error) => {
        resolve({
          ok: false,
          error: handleZipError(zipErr),
        });
      });

      zipfile.readEntry();
    });
  });
}

/**
 * Process extracted files and validate bundle integrity
 */
function processExtractedFiles(
  files: Map<string, Buffer>,
  resolve: (result: BundleResult<DisputeBundleContents>) => void
): void {
  // Parse manifest
  const manifestBuffer = files.get('manifest.json');
  if (!manifestBuffer) {
    resolve({
      ok: false,
      error: bundleError(BundleErrorCodes.MANIFEST_MISSING, 'manifest.json not found in bundle'),
    });
    return;
  }

  let manifest: DisputeBundleManifest;
  try {
    manifest = JSON.parse(manifestBuffer.toString('utf8')) as DisputeBundleManifest;
  } catch (parseErr) {
    resolve({
      ok: false,
      error: bundleError(
        BundleErrorCodes.MANIFEST_INVALID,
        `Failed to parse manifest.json: ${(parseErr as Error).message}`
      ),
    });
    return;
  }

  // Validate version
  if (manifest.version !== DISPUTE_BUNDLE_VERSION) {
    resolve({
      ok: false,
      error: bundleError(
        BundleErrorCodes.MANIFEST_INVALID,
        `Unsupported bundle version: ${manifest.version}`,
        { expected: DISPUTE_BUNDLE_VERSION, actual: manifest.version }
      ),
    });
    return;
  }

  // Verify content_hash
  const { content_hash, ...manifestWithoutHash } = manifest;
  const computedHash = sha256Hex(canonicalize(manifestWithoutHash));

  if (computedHash !== content_hash) {
    resolve({
      ok: false,
      error: bundleError(
        BundleErrorCodes.HASH_MISMATCH,
        'Bundle content_hash verification failed',
        { expected: content_hash, computed: computedHash }
      ),
    });
    return;
  }

  // Verify file hashes
  for (const fileEntry of manifest.files) {
    const fileBuffer = files.get(fileEntry.path);
    if (!fileBuffer) {
      resolve({
        ok: false,
        error: bundleError(BundleErrorCodes.INVALID_FORMAT, `File not found: ${fileEntry.path}`),
      });
      return;
    }

    const computedFileHash = sha256Hex(fileBuffer);
    if (computedFileHash !== fileEntry.sha256) {
      resolve({
        ok: false,
        error: bundleError(
          BundleErrorCodes.HASH_MISMATCH,
          `File hash mismatch: ${fileEntry.path}`,
          { expected: fileEntry.sha256, computed: computedFileHash }
        ),
      });
      return;
    }

    if (fileBuffer.length !== fileEntry.size) {
      resolve({
        ok: false,
        error: bundleError(
          BundleErrorCodes.HASH_MISMATCH,
          `File size mismatch: ${fileEntry.path}`,
          { expected: fileEntry.size, actual: fileBuffer.length }
        ),
      });
      return;
    }
  }

  // Parse receipts.ndjson
  const receiptsBuffer = files.get('receipts.ndjson');
  const receipts = new Map<string, string>();

  if (receiptsBuffer) {
    const lines = receiptsBuffer.toString('utf8').trim().split('\n');

    // Verify receipts are in deterministic order
    let lastKey = '';
    for (let i = 0; i < lines.length; i++) {
      const jws = lines[i].trim();
      if (!jws) continue;

      const parsed = parseJws(jws);
      if (!parsed) {
        resolve({
          ok: false,
          error: bundleError(BundleErrorCodes.RECEIPT_INVALID, `Invalid JWS at line ${i + 1}`),
        });
        return;
      }

      const receiptId = parsed.payload.jti as string;

      // Detect duplicate receipt IDs
      if (receipts.has(receiptId)) {
        resolve({
          ok: false,
          error: bundleError(
            BundleErrorCodes.DUPLICATE_RECEIPT,
            `Duplicate receipt ID in bundle: ${receiptId}`,
            { receipt_id: receiptId, line: i + 1 }
          ),
        });
        return;
      }

      const issuedAt =
        typeof parsed.payload.iat === 'number'
          ? new Date(parsed.payload.iat * 1000).toISOString()
          : String(parsed.payload.iat);
      const receiptHash = sha256Hex(Buffer.from(jws, 'utf8'));

      // Check ordering
      const currentKey = `${issuedAt}|${receiptId}|${receiptHash}`;
      if (currentKey < lastKey) {
        resolve({
          ok: false,
          error: bundleError(
            BundleErrorCodes.RECEIPTS_UNORDERED,
            'receipts.ndjson is not in deterministic order'
          ),
        });
        return;
      }
      lastKey = currentKey;

      receipts.set(receiptId, jws);
    }
  }

  // Extract keys
  let keys: JsonWebKeySet = { keys: [] };
  const keysBuffer = files.get('keys/keys.json');
  if (keysBuffer) {
    try {
      keys = JSON.parse(keysBuffer.toString('utf8')) as JsonWebKeySet;
    } catch {
      resolve({
        ok: false,
        error: bundleError(BundleErrorCodes.MANIFEST_INVALID, 'Failed to parse keys/keys.json'),
      });
      return;
    }
  }

  // Extract policy if present
  let policyContent: string | undefined;
  const policyBuffer = files.get('policy/policy.yaml');
  if (policyBuffer) {
    policyContent = policyBuffer.toString('utf8');

    // Verify policy hash if declared
    if (manifest.policy_hash) {
      const computedPolicyHash = sha256Hex(policyBuffer);
      if (computedPolicyHash !== manifest.policy_hash) {
        resolve({
          ok: false,
          error: bundleError(BundleErrorCodes.POLICY_HASH_MISMATCH, 'Policy hash mismatch', {
            expected: manifest.policy_hash,
            computed: computedPolicyHash,
          }),
        });
        return;
      }
    }
  }

  // Extract bundle.sig if present
  let bundleSig: string | undefined;
  const sigBuffer = files.get('bundle.sig');
  if (sigBuffer) {
    bundleSig = sigBuffer.toString('utf8');
  }

  resolve({
    ok: true,
    value: {
      manifest,
      receipts,
      keys,
      policy: policyContent,
      bundle_sig: bundleSig,
    },
  });
}

/**
 * Verify bundle integrity without verifying receipt signatures.
 */
export async function verifyBundleIntegrity(
  zipBuffer: Buffer
): Promise<BundleResult<{ manifest: DisputeBundleManifest }>> {
  const result = await readDisputeBundle(zipBuffer);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: { manifest: result.value.manifest } };
}

/**
 * Get the content hash of a bundle without fully parsing it.
 */
export async function getBundleContentHash(zipBuffer: Buffer): Promise<BundleResult<string>> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve({
          ok: false,
          error: bundleError(
            BundleErrorCodes.INVALID_FORMAT,
            `Failed to open ZIP: ${err?.message ?? 'unknown'}`
          ),
        });
        return;
      }

      let found = false;

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName === 'manifest.json') {
          found = true;
          zipfile.openReadStream(entry, (readErr, readStream) => {
            if (readErr || !readStream) {
              zipfile.close();
              resolve({
                ok: false,
                error: bundleError(BundleErrorCodes.INVALID_FORMAT, `Failed to read manifest.json`),
              });
              return;
            }

            const chunks: Buffer[] = [];
            readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
            readStream.on('end', () => {
              zipfile.close();
              try {
                const manifest = JSON.parse(
                  Buffer.concat(chunks).toString('utf8')
                ) as DisputeBundleManifest;
                resolve({ ok: true, value: manifest.content_hash });
              } catch (parseErr) {
                resolve({
                  ok: false,
                  error: bundleError(
                    BundleErrorCodes.MANIFEST_INVALID,
                    `Failed to parse manifest.json`
                  ),
                });
              }
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        if (!found) {
          resolve({
            ok: false,
            error: bundleError(BundleErrorCodes.MANIFEST_MISSING, 'manifest.json not found'),
          });
        }
      });

      zipfile.on('error', (zipErr: Error) => {
        resolve({
          ok: false,
          error: handleZipError(zipErr),
        });
      });

      zipfile.readEntry();
    });
  });
}

// Re-export error codes for consumers
export { BundleErrorCodes as BUNDLE_ERROR_CODES };
