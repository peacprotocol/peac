/**
 * Telemetry utilities for protocol package
 *
 * TelemetryHook is the protocol-local interface for observability.
 * Hooks are best-effort side effects: fire-and-forget, never awaited,
 * guarded against both sync throws and async rejections.
 */

import { createHash } from 'node:crypto';

/**
 * Input for receipt issued telemetry event
 */
export interface ReceiptIssuedHookInput {
  receiptHash: string;
  issuer?: string;
  kid?: string;
  durationMs?: number;
}

/**
 * Input for receipt verified telemetry event
 */
export interface ReceiptVerifiedHookInput {
  receiptHash: string;
  valid: boolean;
  reasonCode?: string;
  issuer?: string;
  kid?: string;
  durationMs?: number;
}

/**
 * Telemetry hook interface for protocol observability
 *
 * Implementations SHOULD be no-throw. Protocol guards all calls,
 * but well-behaved hooks should not throw.
 *
 * Hooks may be sync or async -- protocol will NOT await the result.
 */
export type TelemetryHook = {
  onReceiptIssued?(input: ReceiptIssuedHookInput): void | Promise<void>;
  onReceiptVerified?(input: ReceiptVerifiedHookInput): void | Promise<void>;
};

/**
 * Safely invoke a telemetry hook (fire-and-forget)
 *
 * Guards both sync throws and async rejections.
 * Telemetry MUST NOT break core flow.
 */
export function fireTelemetryHook<T>(
  fn: ((input: T) => void | Promise<void>) | undefined,
  input: T
): void {
  if (!fn) return;
  try {
    const result = fn(input);
    // Swallow async rejections
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    // Telemetry MUST NOT break core flow
  }
}

/**
 * Compute a SHA-256 hash of a receipt JWS
 *
 * Returns format: sha256:{hex prefix}
 * Uses first 16 chars of hex for brevity in logs/spans.
 */
export function hashReceipt(jws: string): string {
  const hash = createHash('sha256').update(jws).digest('hex');
  return `sha256:${hash.slice(0, 16)}`;
}
