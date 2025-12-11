/**
 * x402 helper functions
 *
 * Detection, normalization, and logging utilities for x402 v1/v2 support.
 */

import {
  type X402Dialect,
  X402_HEADERS_V1,
  X402_HEADERS_V2,
  CAIP2_REGISTRY,
  X402_V1_DEFAULT_NETWORK,
} from './constants';
import type { X402Invoice } from './types';

/**
 * Track warned networks to avoid log spam (one warning per network per process)
 */
const warnedNetworks = new Set<string>();

/**
 * Log warning for unknown CAIP-2 network (once per network per process)
 *
 * Message is calm and informative. Does not throw.
 */
export function logUnknownNetworkWarning(networkId: string): void {
  if (warnedNetworks.has(networkId)) return;
  warnedNetworks.add(networkId);

  console.warn(`[peac:x402] Unknown CAIP-2 network "${networkId}", passing through as-is.`);
}

/**
 * Detect x402 dialect from HTTP response headers
 *
 * Priority: v2 headers first (case-insensitive), then v1 fallback.
 *
 * Detection rules:
 * 1. If any v2 header present (Payment-Required, Payment-Signature, Payment-Response) -> v2
 * 2. If only v1 headers present (X-PAYMENT-*) -> v1
 * 3. If no headers provided -> v1 (safe default)
 *
 * @param headers - HTTP response headers (optional)
 * @returns Detected dialect ('v1' or 'v2')
 */
export function detectDialect(headers?: Record<string, string>): 'v1' | 'v2' {
  if (!headers) return 'v1';

  const lowerHeaders = Object.keys(headers).map((k) => k.toLowerCase());

  // Check for v2 headers first
  const v2Headers = [
    X402_HEADERS_V2.paymentRequired.toLowerCase(),
    X402_HEADERS_V2.paymentSignature.toLowerCase(),
    X402_HEADERS_V2.paymentResponse.toLowerCase(),
  ];

  if (v2Headers.some((h) => lowerHeaders.includes(h))) {
    return 'v2';
  }

  return 'v1';
}

/**
 * Resolve dialect for invoice processing (no headers available)
 *
 * Heuristics:
 * 1. If explicit dialect is specified (not 'auto') -> use it
 * 2. If invoice.network is a CAIP-2 string (contains ':') -> v2
 * 3. If invoice.payTo is present -> v2
 * 4. Otherwise -> v1
 *
 * @param invoice - x402 invoice
 * @param explicitDialect - Explicit dialect from config
 * @returns Resolved dialect ('v1' or 'v2')
 */
export function resolveDialectFromInvoice(
  invoice: X402Invoice,
  explicitDialect: X402Dialect
): 'v1' | 'v2' {
  if (explicitDialect !== 'auto') {
    return explicitDialect;
  }

  // v2 indicators
  if (invoice.network && invoice.network.includes(':')) return 'v2';
  if (invoice.payTo) return 'v2';

  return 'v1';
}

/**
 * Normalize network ID (returns canonical ID, not label)
 *
 * Behavior:
 * - Missing input -> "lightning" (v1 default)
 * - Known CAIP-2 -> return as-is
 * - Unknown -> log warning, return as-is (no throw)
 *
 * Key rule: NO lossy mapping. The canonical ID is always preserved.
 *
 * @param caip2 - CAIP-2 network identifier (optional)
 * @returns Canonical network ID
 */
export function normalizeNetworkId(caip2: string | undefined): string {
  if (!caip2) return X402_V1_DEFAULT_NETWORK;

  if (!(caip2 in CAIP2_REGISTRY)) {
    logUnknownNetworkWarning(caip2);
  }

  return caip2; // Always return the canonical ID unchanged
}

/**
 * Get human-readable label for network (for evidence.network_label)
 *
 * @param caip2 - CAIP-2 network identifier
 * @returns Human-readable label, or undefined for unknown networks
 */
export function getNetworkLabel(caip2: string): string | undefined {
  return CAIP2_REGISTRY[caip2]?.label;
}

/**
 * Get header names for a specific dialect
 *
 * @param dialect - 'v1' or 'v2'
 * @returns Header name mapping
 */
export function getHeaders(dialect: 'v1' | 'v2'): typeof X402_HEADERS_V1 | typeof X402_HEADERS_V2 {
  return dialect === 'v2' ? X402_HEADERS_V2 : X402_HEADERS_V1;
}

/**
 * Check if a network ID indicates testnet environment
 *
 * @param networkId - CAIP-2 network identifier
 * @returns true if testnet, false otherwise
 */
export function isTestnet(networkId: string): boolean {
  return CAIP2_REGISTRY[networkId]?.env === 'testnet';
}

/**
 * Clear warned networks set (for testing)
 */
export function _resetWarnedNetworks(): void {
  warnedNetworks.clear();
}
