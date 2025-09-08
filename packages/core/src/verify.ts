/**
 * @peac/core v0.9.12.1 - Enhanced JWS verification with invariants
 * Target: <1ms p95, wire version validation, invariant enforcement
 */

import { jwtVerify, importJWK } from 'jose';
import { Receipt, PurgeReceipt, KeySet, VerifyResult } from './types.js';
import { assertProtocolVersions, assertCrawlerType, validateNonce } from './validation.js';
import { FEATURES } from './config.js';
import { validateReceiptSecurity, securityContext, securityAuditor } from './security.js';
import { metricsCollector } from './observability.js';

// Global nonce store for replay protection (in production, use Redis with TTL)
const nonceStore = new Set<string>();

export async function verifyReceipt(jws: string, keys: KeySet): Promise<VerifyResult> {
  const start = performance.now();

  try {
    metricsCollector.incrementCounter('receipts_verified');

    const result = await verifyDocument(jws, keys, 'receipt');
    const receipt = result.receipt;

    // Enforce v0.9.12.1 invariants
    enforceReceiptInvariants(receipt);

    // Enhanced security validation
    if (FEATURES.REPLAY_PROTECTION || FEATURES.SECURITY_AUDIT) {
      try {
        const securityCheck = await validateReceiptSecurity(receipt, securityContext);

        if (!securityCheck.valid) {
          const error_msg = `Security validation failed: ${securityCheck.violations.join(', ')}`;

          if (FEATURES.SECURITY_AUDIT) {
            securityAuditor.logEvent({
              type: 'replay_detected',
              severity: 'high',
              details: {
                kid: receipt.kid,
                violations: securityCheck.violations,
                subject: receipt.subject,
              },
            });
          }

          throw new Error(error_msg);
        }
      } catch (error) {
        if (FEATURES.SECURITY_AUDIT) {
          securityAuditor.logEvent({
            type: 'timestamp_invalid',
            severity: 'medium',
            details: {
              error: error instanceof Error ? error.message : String(error),
              kid: receipt.kid,
            },
          });
        }
        throw error;
      }
    }

    const duration = performance.now() - start;
    metricsCollector.recordTiming('verify', duration);

    return result;
  } catch (error) {
    metricsCollector.incrementCounter('verify_errors');
    throw error;
  }
}

export async function verifyPurgeReceipt(
  jws: string,
  keys: KeySet
): Promise<{ hdr: any; purge: PurgeReceipt }> {
  const result = await verifyDocument(jws, keys, 'purge');

  return {
    hdr: result.hdr,
    purge: result.receipt as unknown as PurgeReceipt,
  };
}

async function verifyDocument(
  jws: string,
  keys: KeySet,
  expectedType: 'receipt' | 'purge'
): Promise<VerifyResult> {
  // Parse header to get kid and validate format
  const jwsParts = jws.split('.');
  if (jwsParts.length !== 3) {
    throw new Error('Invalid JWS format: must have exactly 3 parts');
  }

  const [headerB64] = jwsParts;
  if (!headerB64) throw new Error('Invalid JWS format: missing header');

  let header: any;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  } catch {
    throw new Error('Invalid JWS header: not valid JSON');
  }

  // Validate header structure
  if (header.alg !== 'EdDSA') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  if (!header.kid || typeof header.kid !== 'string') {
    throw new Error('Missing or invalid kid in header');
  }

  // Validate media type
  const expectedMediaType =
    expectedType === 'receipt' ? 'application/peac-receipt+jws' : 'application/peac-purge+jws';

  if (header.typ && header.typ !== expectedMediaType) {
    throw new Error(`Invalid media type: expected ${expectedMediaType}, got ${header.typ}`);
  }

  // Get public key
  const keyData = keys[header.kid];
  if (!keyData) {
    throw new Error(`Unknown key ID: ${header.kid}`);
  }

  // Import public key (cached for performance)
  const publicKey = await importJWK(keyData, 'EdDSA');

  // Verify signature and decode payload
  let payload: any, protectedHeader: any;
  try {
    const result = await jwtVerify(jws, publicKey, {
      algorithms: ['EdDSA'],
    });
    payload = result.payload;
    protectedHeader = result.protectedHeader;
  } catch (error) {
    throw new Error(
      `JWS verification failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate protocol and wire versions
  assertProtocolVersions(payload, expectedType);

  // Validate required fields based on type
  if (expectedType === 'receipt') {
    assertCrawlerType(payload.crawler_type);
  }

  // Ensure kid consistency between header and payload
  if (payload.kid !== header.kid) {
    throw new Error(`Kid mismatch: header=${header.kid}, payload=${payload.kid}`);
  }

  // Replay protection (if nonce present)
  if (payload.nonce) {
    validateNonce(payload.kid, payload.nonce, nonceStore);
  }

  return {
    hdr: protectedHeader,
    receipt: payload as Receipt,
  };
}

function enforceReceiptInvariants(receipt: Receipt): void {
  // ADR-002: AIPREF object must be present
  if (!receipt.aipref || typeof receipt.aipref !== 'object') {
    throw new Error('Receipt invariant violation: aipref object is required');
  }

  if (!receipt.aipref.status) {
    throw new Error('Receipt invariant violation: aipref.status is required');
  }

  // ADR-002: payment required when enforcement.method === "http-402"
  if (receipt.enforcement?.method === 'http-402') {
    if (!receipt.payment) {
      throw new Error(
        'Receipt invariant violation: payment required when enforcement.method="http-402"'
      );
    }

    if (!receipt.payment.rail || !receipt.payment.amount || !receipt.payment.currency) {
      throw new Error(
        'Receipt invariant violation: payment must include rail, amount, and currency'
      );
    }
  }

  // Validate acquisition method if present
  if (receipt.acquisition) {
    if (!receipt.acquisition.method || !receipt.acquisition.source) {
      throw new Error('Receipt invariant violation: acquisition requires method and source');
    }
  }

  // Validate timestamp format
  try {
    new Date(receipt.issued_at);
  } catch {
    throw new Error('Receipt invariant violation: issued_at must be valid ISO-8601 timestamp');
  }

  // Validate expires_at if present
  if (receipt.expires_at) {
    try {
      const expiresAt = new Date(receipt.expires_at);
      const issuedAt = new Date(receipt.issued_at);
      if (expiresAt <= issuedAt) {
        throw new Error('Receipt invariant violation: expires_at must be after issued_at');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('invariant violation')) throw e;
      throw new Error('Receipt invariant violation: expires_at must be valid ISO-8601 timestamp');
    }
  }
}

// Legacy compatibility wrapper (deprecated)
export async function verify(jws: string, keys: KeySet): Promise<VerifyResult> {
  return await verifyReceipt(jws, keys);
}

// Bulk verification for performance
export async function verifyBulk(
  jwsArray: string[],
  keys: KeySet
): Promise<Array<{ valid: boolean; error?: string; receipt?: Receipt }>> {
  return Promise.all(
    jwsArray.map(async (jws) => {
      try {
        const result = await verifyReceipt(jws, keys);
        return { valid: true, receipt: result.receipt };
      } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );
}
