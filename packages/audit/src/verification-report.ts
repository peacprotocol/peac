/**
 * Verification Report (v0.9.30+)
 *
 * Deterministic verification of dispute bundles with JCS-canonicalized reports.
 * The report_hash enables cross-language parity: TS and Go implementations
 * must produce identical hashes for the same bundle verification.
 *
 * Key design principles:
 * 1. Real Ed25519 signature verification using @peac/crypto
 * 2. No timestamps in deterministic output
 * 3. All arrays sorted by stable keys for reproducibility
 */

import { createHash } from 'node:crypto';
import { canonicalize, verify as verifyJws, CryptoError } from '@peac/crypto';

import { readDisputeBundle } from './dispute-bundle.js';
import { BundleErrorCodes } from './dispute-bundle.js';
import type {
  AuditorSummary,
  BundleError,
  BundleResult,
  BundleSignatureResult,
  DisputeBundleContents,
  JsonWebKey,
  KeyUsageEntry,
  ReceiptVerificationResult,
  VerificationReport,
  VerifyBundleOptions,
} from './dispute-bundle-types.js';
import { VERIFICATION_REPORT_VERSION } from './dispute-bundle-types.js';

/**
 * Compute SHA-256 hash of data with self-describing format.
 * Returns `sha256:<64 lowercase hex chars>` format.
 */
function sha256Hex(data: string | Buffer): string {
  const hash = createHash('sha256');
  hash.update(data);
  return `sha256:${hash.digest('hex')}`;
}

/** Decode base64url to Buffer */
function base64urlDecode(str: string): Buffer {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

/** Parse JWS to extract header and payload */
function parseJws(jws: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
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
      signature: parts[2],
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
 * Strip undefined values from an object recursively.
 * JCS canonicalization cannot handle undefined values.
 */
function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined) as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = stripUndefined(value);
      }
    }
    return result as T;
  }
  return obj;
}

/**
 * Verify receipt claims (basic validation without cryptographic signature check).
 *
 * This validates:
 * - Required claims are present (jti, iss, iat)
 * - Timestamps are valid (not expired, not in future)
 *
 * Note: Signature verification requires access to the signing key and is
 * handled separately. This function focuses on claim validation.
 */
function verifyReceiptClaims(
  payload: Record<string, unknown>,
  now: Date
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nowSec = Math.floor(now.getTime() / 1000);

  // Required claims
  if (!payload.jti) {
    errors.push('E_RECEIPT_MISSING_JTI');
  }

  if (!payload.iss) {
    errors.push('E_RECEIPT_MISSING_ISS');
  }

  if (payload.iat === undefined) {
    errors.push('E_RECEIPT_MISSING_IAT');
  } else {
    const iat = typeof payload.iat === 'number' ? payload.iat : NaN;
    if (isNaN(iat)) {
      errors.push('E_RECEIPT_INVALID_IAT');
    } else if (iat > nowSec + 300) {
      // Allow 5 min clock skew
      errors.push('E_RECEIPT_NOT_YET_VALID');
    }
  }

  // Check expiry if present
  if (payload.exp !== undefined) {
    const exp = typeof payload.exp === 'number' ? payload.exp : NaN;
    if (isNaN(exp)) {
      errors.push('E_RECEIPT_INVALID_EXP');
    } else if (exp < nowSec) {
      errors.push('E_RECEIPT_EXPIRED');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Find the key ID used to sign a receipt.
 */
function getReceiptKeyId(header: Record<string, unknown>): string | undefined {
  return typeof header.kid === 'string' ? header.kid : undefined;
}

/**
 * Convert JWK to raw Ed25519 public key bytes (32 bytes).
 * Returns null if the JWK is not a valid Ed25519 key.
 */
function jwkToPublicKeyBytes(jwk: JsonWebKey): Uint8Array | null {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) {
    return null;
  }
  // Decode base64url to bytes
  const padded = jwk.x + '='.repeat((4 - (jwk.x.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length !== 32) {
    return null;
  }
  return new Uint8Array(bytes);
}

/**
 * Find a key by kid in the bundle's JWKS.
 */
function findKey(keys: JsonWebKey[], kid: string): JsonWebKey | undefined {
  return keys.find((k) => k.kid === kid);
}

/**
 * Verify a single receipt with real Ed25519 signature verification.
 *
 * In offline mode, we use only the keys bundled in the JWKS.
 * All signature verification is cryptographic - not just key presence.
 */
async function verifyReceipt(
  receiptId: string,
  jws: string,
  bundleContents: DisputeBundleContents,
  options: VerifyBundleOptions
): Promise<ReceiptVerificationResult> {
  const parsed = parseJws(jws);

  if (!parsed) {
    return {
      receipt_id: receiptId,
      signature_valid: false,
      claims_valid: false,
      errors: ['E_RECEIPT_INVALID_FORMAT'],
    };
  }

  const { header, payload } = parsed;
  const keyId = getReceiptKeyId(header);
  const errors: string[] = [];

  // Check key ID presence
  if (!keyId) {
    return {
      receipt_id: receiptId,
      signature_valid: false,
      claims_valid: false,
      errors: ['E_RECEIPT_MISSING_KID'],
    };
  }

  // Find the key in the bundle's JWKS
  const jwk = findKey(bundleContents.keys.keys, keyId);
  if (!jwk) {
    // Key not found - in offline mode this is fatal
    if (options.offline) {
      return {
        receipt_id: receiptId,
        signature_valid: false,
        claims_valid: false,
        key_id: keyId,
        errors: [BundleErrorCodes.KEY_MISSING],
      };
    }
    // In online mode, we could try to fetch the key, but for now fail
    return {
      receipt_id: receiptId,
      signature_valid: false,
      claims_valid: false,
      key_id: keyId,
      errors: [BundleErrorCodes.KEY_MISSING],
    };
  }

  // Convert JWK to raw public key bytes
  const publicKeyBytes = jwkToPublicKeyBytes(jwk);
  if (!publicKeyBytes) {
    return {
      receipt_id: receiptId,
      signature_valid: false,
      claims_valid: false,
      key_id: keyId,
      errors: ['E_RECEIPT_INVALID_KEY_FORMAT'],
    };
  }

  // Perform real Ed25519 signature verification
  let signatureValid = false;
  try {
    const result = await verifyJws(jws, publicKeyBytes);
    signatureValid = result.valid;
    if (!signatureValid) {
      errors.push('E_RECEIPT_SIGNATURE_INVALID');
    }
  } catch (err: unknown) {
    // Handle crypto errors
    if (err instanceof CryptoError) {
      errors.push(`E_RECEIPT_CRYPTO_ERROR:${err.code}`);
    } else {
      errors.push('E_RECEIPT_SIGNATURE_INVALID');
    }
    signatureValid = false;
  }

  // Validate claims
  const claimsResult = verifyReceiptClaims(payload, options.now ?? new Date());
  errors.push(...claimsResult.errors);

  return {
    receipt_id: receiptId,
    signature_valid: signatureValid,
    claims_valid: claimsResult.valid,
    key_id: keyId,
    errors,
    claims: signatureValid && claimsResult.valid && errors.length === 0 ? payload : undefined,
  };
}

/**
 * Build key usage tracking.
 */
function buildKeyUsage(results: ReceiptVerificationResult[]): KeyUsageEntry[] {
  const usage = new Map<string, string[]>();

  for (const result of results) {
    if (result.key_id) {
      const existing = usage.get(result.key_id) ?? [];
      existing.push(result.receipt_id);
      usage.set(result.key_id, existing);
    }
  }

  const entries: KeyUsageEntry[] = [];
  for (const [kid, receiptIds] of usage) {
    entries.push({
      kid,
      receipts_signed: receiptIds.length,
      receipt_ids: receiptIds.sort(),
    });
  }

  // Sort by kid for determinism
  return entries.sort((a, b) => a.kid.localeCompare(b.kid));
}

/**
 * Generate auditor-friendly summary.
 */
function generateAuditorSummary(
  totalReceipts: number,
  validCount: number,
  invalidCount: number,
  results: ReceiptVerificationResult[]
): AuditorSummary {
  const headline = `${validCount}/${totalReceipts} receipts valid`;

  const issues: string[] = [];
  for (const result of results) {
    if (!result.signature_valid || !result.claims_valid) {
      const errorSummary =
        result.errors.length > 0 ? result.errors.join(', ') : 'validation failed';
      issues.push(`Receipt ${result.receipt_id}: ${errorSummary}`);
    }
  }

  // Sort issues for determinism
  issues.sort();

  let recommendation: AuditorSummary['recommendation'];
  if (invalidCount === 0) {
    recommendation = 'valid';
  } else if (invalidCount === totalReceipts) {
    recommendation = 'invalid';
  } else {
    recommendation = 'needs_review';
  }

  return {
    headline,
    issues,
    recommendation,
  };
}

/**
 * Verify the bundle.sig if present.
 * The bundle.sig is a JWS over { content_hash: "..." } signed with a key from the JWKS.
 */
async function verifyBundleSignature(
  bundleContents: DisputeBundleContents
): Promise<BundleSignatureResult> {
  const { bundle_sig, keys, manifest } = bundleContents;

  // No bundle.sig present
  if (!bundle_sig) {
    return { present: false };
  }

  // Parse the JWS to get the key ID
  const parsed = parseJws(bundle_sig);
  if (!parsed) {
    return {
      present: true,
      valid: false,
      error: 'E_BUNDLE_SIGNATURE_INVALID_FORMAT',
    };
  }

  const keyId = typeof parsed.header.kid === 'string' ? parsed.header.kid : undefined;
  if (!keyId) {
    return {
      present: true,
      valid: false,
      error: 'E_BUNDLE_SIGNATURE_MISSING_KID',
    };
  }

  // Find the key in JWKS
  const jwk = keys.keys.find((k) => k.kid === keyId);
  if (!jwk) {
    return {
      present: true,
      valid: false,
      key_id: keyId,
      error: BundleErrorCodes.KEY_MISSING,
    };
  }

  // Convert JWK to raw public key bytes
  const publicKeyBytes = jwkToPublicKeyBytes(jwk);
  if (!publicKeyBytes) {
    return {
      present: true,
      valid: false,
      key_id: keyId,
      error: 'E_BUNDLE_SIGNATURE_INVALID_KEY_FORMAT',
    };
  }

  // Verify the signature
  try {
    const result = await verifyJws<{ content_hash: string }>(bundle_sig, publicKeyBytes);

    if (!result.valid) {
      return {
        present: true,
        valid: false,
        key_id: keyId,
        error: BundleErrorCodes.SIGNATURE_INVALID,
      };
    }

    // Verify the content_hash in the payload matches the manifest
    if (result.payload.content_hash !== manifest.content_hash) {
      return {
        present: true,
        valid: false,
        key_id: keyId,
        error: 'E_BUNDLE_SIGNATURE_CONTENT_MISMATCH',
      };
    }

    return {
      present: true,
      valid: true,
      key_id: keyId,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof CryptoError
        ? `E_BUNDLE_SIGNATURE_CRYPTO_ERROR:${err.code}`
        : BundleErrorCodes.SIGNATURE_INVALID;

    return {
      present: true,
      valid: false,
      key_id: keyId,
      error: errorMsg,
    };
  }
}

/**
 * Verify all receipts in a dispute bundle and generate a deterministic report.
 *
 * @param zipBuffer - Buffer containing the ZIP archive
 * @param options - Verification options
 * @returns Promise resolving to a deterministic verification report
 *
 * @example
 * ```typescript
 * const zipData = fs.readFileSync('dispute-bundle.zip');
 * const result = await verifyBundle(zipData, { offline: true });
 *
 * if (result.ok) {
 *   console.log('Report hash:', result.value.report_hash);
 *   console.log('Summary:', result.value.auditor_summary.headline);
 * }
 * ```
 */
export async function verifyBundle(
  zipBuffer: Buffer,
  options: VerifyBundleOptions
): Promise<BundleResult<VerificationReport>> {
  // Read and parse the bundle
  const readResult = await readDisputeBundle(zipBuffer);
  if (!readResult.ok) {
    return readResult;
  }

  const bundleContents = readResult.value;
  const { manifest, receipts } = bundleContents;

  // Verify bundle.sig if present (authenticity)
  const bundleSignature = await verifyBundleSignature(bundleContents);

  // Verify each receipt with real Ed25519 signature verification
  const results: ReceiptVerificationResult[] = [];

  for (const receiptEntry of manifest.receipts) {
    const jws = receipts.get(receiptEntry.receipt_id);
    if (!jws) {
      results.push({
        receipt_id: receiptEntry.receipt_id,
        signature_valid: false,
        claims_valid: false,
        errors: ['E_BUNDLE_RECEIPT_NOT_FOUND'],
      });
      continue;
    }

    const result = await verifyReceipt(receiptEntry.receipt_id, jws, bundleContents, options);
    results.push(result);
  }

  // Sort results by receipt_id for determinism
  results.sort((a, b) => a.receipt_id.localeCompare(b.receipt_id));

  // Count valid/invalid
  const validCount = results.filter(
    (r) => r.signature_valid && r.claims_valid && r.errors.length === 0
  ).length;
  const invalidCount = results.length - validCount;

  // Build key usage
  const keysUsed = buildKeyUsage(results);

  // Generate auditor summary
  const auditorSummary = generateAuditorSummary(results.length, validCount, invalidCount, results);

  // Build report without report_hash
  const reportWithoutHash: Omit<VerificationReport, 'report_hash'> = {
    version: VERIFICATION_REPORT_VERSION,
    bundle_content_hash: manifest.content_hash,
    bundle_signature: bundleSignature,
    summary: {
      total_receipts: results.length,
      valid: validCount,
      invalid: invalidCount,
    },
    receipts: results,
    keys_used: keysUsed,
    auditor_summary: auditorSummary,
  };

  // Compute report_hash = SHA-256 of JCS(report without report_hash)
  // Strip undefined values first since JCS cannot handle them
  const cleanedReport = stripUndefined(reportWithoutHash);
  const reportHash = sha256Hex(canonicalize(cleanedReport));

  const report: VerificationReport = {
    ...reportWithoutHash,
    report_hash: reportHash,
  };

  return {
    ok: true,
    value: report,
  };
}

/**
 * Serialize a verification report to JSON.
 *
 * @param report - Verification report
 * @param pretty - Pretty print (default: false)
 * @returns JSON string
 */
export function serializeReport(report: VerificationReport, pretty: boolean = false): string {
  if (pretty) {
    return JSON.stringify(report, null, 2);
  }
  return JSON.stringify(report);
}

/**
 * Format verification report as human-readable text.
 *
 * @param report - Verification report
 * @returns Human-readable text summary
 */
export function formatReportText(report: VerificationReport): string {
  const lines: string[] = [];

  lines.push('PEAC Dispute Bundle Verification Report');
  lines.push('========================================');
  lines.push('');
  lines.push(`Bundle content hash: ${report.bundle_content_hash}`);
  lines.push(`Report hash: ${report.report_hash}`);
  lines.push('');

  // Bundle signature status
  lines.push('Bundle Signature');
  lines.push('----------------');
  if (!report.bundle_signature.present) {
    lines.push('  Status: NOT SIGNED');
  } else if (report.bundle_signature.valid) {
    lines.push('  Status: VALID');
    lines.push(`  Key ID: ${report.bundle_signature.key_id}`);
  } else {
    lines.push('  Status: INVALID');
    if (report.bundle_signature.key_id) {
      lines.push(`  Key ID: ${report.bundle_signature.key_id}`);
    }
    if (report.bundle_signature.error) {
      lines.push(`  Error: ${report.bundle_signature.error}`);
    }
  }
  lines.push('');

  lines.push('Summary');
  lines.push('-------');
  lines.push(`Total receipts: ${report.summary.total_receipts}`);
  lines.push(`Valid: ${report.summary.valid}`);
  lines.push(`Invalid: ${report.summary.invalid}`);
  lines.push('');
  lines.push(`Recommendation: ${report.auditor_summary.recommendation.toUpperCase()}`);
  lines.push(`Headline: ${report.auditor_summary.headline}`);
  lines.push('');

  if (report.auditor_summary.issues.length > 0) {
    lines.push('Issues');
    lines.push('------');
    for (const issue of report.auditor_summary.issues) {
      lines.push(`  - ${issue}`);
    }
    lines.push('');
  }

  if (report.keys_used.length > 0) {
    lines.push('Keys Used');
    lines.push('---------');
    for (const keyUsage of report.keys_used) {
      lines.push(`  ${keyUsage.kid}: ${keyUsage.receipts_signed} receipt(s)`);
    }
    lines.push('');
  }

  lines.push('Receipt Details');
  lines.push('---------------');
  for (const receipt of report.receipts) {
    const status = receipt.signature_valid && receipt.claims_valid ? 'VALID' : 'INVALID';
    lines.push(`  ${receipt.receipt_id}: ${status}`);
    if (receipt.key_id) {
      lines.push(`    Key: ${receipt.key_id}`);
    }
    if (receipt.errors.length > 0) {
      lines.push(`    Errors: ${receipt.errors.join(', ')}`);
    }
  }

  return lines.join('\n');
}
