/**
 * x402 protocol constants and types
 *
 * Supports both x402 v1 (legacy X-PAYMENT-* headers) and v2 (Payment-* headers).
 * Default behavior is auto-detection with v1 fallback.
 */

/**
 * x402 protocol dialect
 *
 * - 'v1': Legacy X-PAYMENT-* headers (pre-Dec 2025)
 * - 'v2': New Payment-* headers (Dec 2025+)
 * - 'auto': Auto-detect from response headers (default)
 */
export type X402Dialect = 'v1' | 'v2' | 'auto';

/**
 * x402 v1 header names (legacy, pre-Dec 2025)
 */
export const X402_HEADERS_V1 = {
  paymentRequired: 'X-PAYMENT',
  paymentResponse: 'X-PAYMENT-RESPONSE',
} as const;

/**
 * x402 v2 header names (Dec 2025+)
 */
export const X402_HEADERS_V2 = {
  paymentRequired: 'Payment-Required',
  paymentSignature: 'Payment-Signature',
  paymentResponse: 'Payment-Response',
} as const;

/**
 * CAIP-2 network registry
 *
 * Maps canonical CAIP-2 identifiers to human-readable labels and environment.
 * Used for validation/logging only - network IDs are passed through unchanged.
 *
 * Reference: https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md
 */
export const CAIP2_REGISTRY: Record<string, { label: string; env: 'mainnet' | 'testnet' }> = {
  // EVM chains
  'eip155:8453': { label: 'Base', env: 'mainnet' },
  'eip155:84532': { label: 'Base Sepolia', env: 'testnet' },
  'eip155:43114': { label: 'Avalanche', env: 'mainnet' },
  'eip155:43113': { label: 'Avalanche Fuji', env: 'testnet' },
  // Solana
  'solana:mainnet': { label: 'Solana', env: 'mainnet' },
  'solana:devnet': { label: 'Solana Devnet', env: 'testnet' },
  // Lightning (v1 default)
  lightning: { label: 'Lightning', env: 'mainnet' },
};

/**
 * Default network for v1 x402 (Lightning)
 */
export const X402_V1_DEFAULT_NETWORK = 'lightning';
