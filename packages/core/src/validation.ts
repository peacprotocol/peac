/**
 * @peac/core v0.9.12.1 - Version and protocol validation
 * Strict version negotiation with graceful compatibility modes
 */

import { VERSION_CONFIG, isCompatibleProtocol, isValidCrawlerType } from './config';
import { ProblemDetails } from './types';

export function assertProtocolVersions(
  obj: { protocol_version?: string; wire_version?: string },
  kind: 'receipt' | 'purge' | 'discovery'
): void {
  const pv = obj.protocol_version || '';
  const wv = obj.wire_version || '';

  if (!isCompatibleProtocol(pv)) {
    const supportedList = [...VERSION_CONFIG.SUPPORTED_PROTOCOLS].join(', ');
    const compatList = VERSION_CONFIG.ACCEPT_COMPAT
      ? [...VERSION_CONFIG.COMPAT_PROTOCOLS].join(', ')
      : '';

    throw createProblem(
      409,
      'version-conflict',
      `Unsupported protocol_version=${pv}. Supported: ${supportedList}${compatList ? '; Compat: ' + compatList : ''}`
    );
  }

  const expectedWireVersion = getExpectedWireVersion(kind);
  if (wv !== expectedWireVersion) {
    throw createProblem(
      409,
      'wire-version-mismatch',
      `Expected wire_version=${expectedWireVersion} for ${kind}, got ${wv}`
    );
  }

  // Log compatibility warnings for non-current protocols
  if (pv !== VERSION_CONFIG.CURRENT_PROTOCOL) {
    console.warn(
      `Accepted compatible protocol_version=${pv} (current: ${VERSION_CONFIG.CURRENT_PROTOCOL})`
    );
  }
}

export function assertCrawlerType(ct: unknown): void {
  if (typeof ct !== 'string' || ct.length === 0) {
    throw createProblem(
      400,
      'missing-crawler-type',
      'crawler_type is required and must be a non-empty string'
    );
  }

  if (!isValidCrawlerType(ct)) {
    throw createProblem(
      400,
      'invalid-crawler-type',
      `Unsupported crawler_type: ${ct}. Allowed: ${['bot', 'agent', 'hybrid', 'browser', 'migrating', 'test', 'unknown'].join(', ')}`
    );
  }
}

export function assertTimestamp(
  timestamp: string | undefined,
  fieldName: string = 'timestamp'
): void {
  if (!timestamp) {
    throw createProblem(400, 'missing-timestamp', `${fieldName} is required`);
  }

  const ts = new Date(timestamp);
  if (isNaN(ts.getTime())) {
    throw createProblem(400, 'invalid-timestamp', `${fieldName} must be valid ISO-8601 datetime`);
  }

  const now = Date.now();
  const tsTime = ts.getTime();
  const maxSkew = 30 * 1000; // 30 seconds
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  if (tsTime > now + maxSkew) {
    throw createProblem(
      400,
      'timestamp-future',
      `${fieldName} cannot be more than 30s in the future`
    );
  }

  if (tsTime < now - maxAge) {
    throw createProblem(400, 'timestamp-expired', `${fieldName} cannot be older than 24 hours`);
  }
}

export function validateNonce(kid: string, nonce: string, nonceStore: Set<string>): void {
  const nonceKey = `${kid}:${nonce}`;

  if (nonceStore.has(nonceKey)) {
    throw createProblem(
      409,
      'nonce-replay',
      'Nonce has already been used (replay attack detected)'
    );
  }

  nonceStore.add(nonceKey);

  // In production, implement TTL cleanup based on SECURITY_CONFIG.nonce_ttl_seconds
}

function getExpectedWireVersion(kind: 'receipt' | 'purge' | 'discovery'): string {
  switch (kind) {
    case 'receipt':
      return VERSION_CONFIG.REQUIRED_WIRE_RECEIPT;
    case 'purge':
      return VERSION_CONFIG.REQUIRED_WIRE_PURGE;
    case 'discovery':
      return VERSION_CONFIG.REQUIRED_WIRE_DISCOVERY;
    default:
      throw new Error(`Unknown document kind: ${kind}`);
  }
}

function createProblem(status: number, type: string, detail: string): ProblemDetails {
  const requestId = generateRequestId();

  return {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Request-Id': requestId,
    },
    body: {
      type: `https://peacprotocol.org/problems/${type}`,
      title: type.replace(/-/g, ' '),
      status,
      detail,
      instance: requestId,
    },
  };
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
