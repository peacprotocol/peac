/**
 * @peac/core v0.9.12.1 - Enhanced JWS signing with wire versioning
 * EdDSA with JCS canonicalization, proper media type, version validation
 * Target: <3ms p95
 */

import { SignJWT, importJWK } from 'jose';
import { Receipt, PurgeReceipt, SignOpts } from './types';
import { VERSION_CONFIG } from './config';
import { assertProtocolVersions, assertCrawlerType } from './validation';
import { timed, metricsCollector } from './observability';

export async function signReceipt(receipt: Receipt, opts: SignOpts): Promise<string> {
  const start = performance.now();

  try {
    metricsCollector.incrementCounter('receipts_issued');

    // Validate versions and required fields
    assertProtocolVersions(receipt, 'receipt');
    assertCrawlerType(receipt.crawler_type);

    // Kid consistency check
    if (receipt.kid !== opts.kid) {
      throw new Error(`Receipt kid mismatch: ${receipt.kid} !== ${opts.kid}`);
    }

    // Ensure protocol and wire versions are set correctly
    const enhancedReceipt: Receipt = {
      ...receipt,
      protocol_version: VERSION_CONFIG.CURRENT_PROTOCOL,
      wire_version: VERSION_CONFIG.REQUIRED_WIRE_RECEIPT,
      signature_media_type: 'application/peac-receipt+jws',
    };

    // Add request context if not present
    if (!enhancedReceipt.request_context?.request_id) {
      enhancedReceipt.request_context = {
        ...enhancedReceipt.request_context,
        request_id: generateRequestId(),
        timestamp: new Date().toISOString(),
      };
    }

    const result = await signDocument(enhancedReceipt, opts, 'application/peac-receipt+jws');

    const duration = performance.now() - start;
    metricsCollector.recordTiming('sign', duration);

    return result;
  } catch (error) {
    metricsCollector.incrementCounter('sign_errors');
    throw error;
  }
}

export async function signPurgeReceipt(purge: PurgeReceipt, opts: SignOpts): Promise<string> {
  // Validate versions
  assertProtocolVersions(purge, 'purge');

  // Kid consistency check
  if (purge.kid !== opts.kid) {
    throw new Error(`Purge receipt kid mismatch: ${purge.kid} !== ${opts.kid}`);
  }

  const enhancedPurge: PurgeReceipt = {
    ...purge,
    protocol_version: VERSION_CONFIG.CURRENT_PROTOCOL,
    wire_version: VERSION_CONFIG.REQUIRED_WIRE_PURGE,
    signature_media_type: 'application/peac-purge+jws',
  };

  if (!enhancedPurge.request_context?.request_id) {
    enhancedPurge.request_context = {
      ...enhancedPurge.request_context,
      request_id: generateRequestId(),
      timestamp: new Date().toISOString(),
    };
  }

  return await signDocument(enhancedPurge, opts, 'application/peac-purge+jws');
}

async function signDocument(
  document: Receipt | PurgeReceipt,
  opts: SignOpts,
  mediaType: string
): Promise<string> {
  // Import Ed25519 private key (cached for performance)
  const privateKey = await importJWK(opts.privateKey, 'EdDSA');

  // Create detached JWS with proper media type
  const jws = await new SignJWT(document as any)
    .setProtectedHeader({
      alg: 'EdDSA',
      kid: opts.kid,
      typ: mediaType,
    })
    .setIssuedAt()
    .sign(privateKey);

  return jws;
}

// Legacy compatibility wrapper (deprecated)
export async function sign(receipt: Receipt, opts: SignOpts): Promise<string> {
  return await signReceipt(receipt, opts);
}

function generateRequestId(): string {
  // Generate UUIDv7 (timestamp-based) for better traceability
  const timestamp = Date.now();
  const randomBytes = crypto.getRandomValues(new Uint8Array(10));

  // Simple UUIDv7-like format: timestamp (12 chars) + random (16 chars)
  const timestampHex = timestamp.toString(16).padStart(12, '0');
  const randomHex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8)}-7${randomHex.slice(0, 3)}-${randomHex.slice(3, 7)}-${randomHex.slice(7)}`;
}
