/**
 * PEAC Protocol v0.9.6 Version Management
 *
 * Implements "Strict Protocol = Release" versioning strategy:
 * - Single source of truth for all version numbers
 * - Protocol version = capabilities version for 0.9.6.x
 * - No backward compatibility until ~0.9.12
 * - Exact version matching required on write endpoints
 */

// Core version constants
export const CAPABILITIES_VERSION = process.env.PEAC_CAPABILITIES_VERSION ?? '0.9.6';
export const PROTOCOL_VERSION = process.env.PEAC_PROTOCOL_VERSION ?? CAPABILITIES_VERSION;
export const MIN_PROTOCOL_VERSION = process.env.PEAC_MIN_PROTOCOL_VERSION ?? PROTOCOL_VERSION;

// Package version (from package.json)
export const PACKAGE_VERSION = '0.9.6';

// Build info
export const BUILD_TIMESTAMP = new Date().toISOString();
export const NODE_VERSION = process.version;

/**
 * Version information for capabilities endpoint
 */
export interface VersionInfo {
  version: string;
  protocol_version: string;
  min_protocol_version: string;
  package_version: string;
  build_timestamp: string;
  node_version: string;
}

/**
 * Get complete version information
 */
export function getVersionInfo(): VersionInfo {
  return {
    version: CAPABILITIES_VERSION,
    protocol_version: PROTOCOL_VERSION,
    min_protocol_version: MIN_PROTOCOL_VERSION,
    package_version: PACKAGE_VERSION,
    build_timestamp: BUILD_TIMESTAMP,
    node_version: NODE_VERSION,
  };
}

/**
 * Check if a protocol version is supported
 */
export function isProtocolVersionSupported(version: string): boolean {
  // For 0.9.6.x: exact match required (strict versioning)
  // Future: could implement range checking based on MIN_PROTOCOL_VERSION
  return version === PROTOCOL_VERSION;
}

/**
 * Header name for protocol version
 */
export const PROTOCOL_HEADER = 'X-PEAC-Protocol';

/**
 * Get expected protocol header value
 */
export function getExpectedProtocolHeader(): string {
  return PROTOCOL_VERSION;
}
