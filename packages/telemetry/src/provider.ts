/**
 * @peac/telemetry - Provider registry
 *
 * Zero-throw provider ref pattern for hot-path performance.
 * When undefined, telemetry is disabled with NO function calls.
 */

import type { TelemetryProvider } from './types.js';

/**
 * Singleton provider reference for zero-overhead hot path.
 *
 * When undefined, telemetry is disabled with NO function calls
 * beyond the initial `if (!p)` check.
 *
 * @example
 * ```typescript
 * // In hot path (issue/verify)
 * const p = providerRef.current;
 * if (p) {
 *   try {
 *     p.onReceiptIssued({ receiptHash: '...' });
 *   } catch {
 *     // Telemetry MUST NOT break core flow
 *   }
 * }
 * ```
 */
export const providerRef: { current?: TelemetryProvider } = {
  current: undefined,
};

/**
 * Set the telemetry provider.
 *
 * Idempotent, no-throw, safe to call multiple times.
 * Pass undefined to disable telemetry.
 *
 * @param provider - The provider to use, or undefined to disable
 */
export function setTelemetryProvider(provider: TelemetryProvider | undefined): void {
  providerRef.current = provider;
}

/**
 * Get the current telemetry provider.
 *
 * Returns undefined if no provider is set (telemetry disabled).
 *
 * For hot paths, prefer direct access to `providerRef.current`
 * to avoid the function call overhead.
 */
export function getTelemetryProvider(): TelemetryProvider | undefined {
  return providerRef.current;
}

/**
 * Check if telemetry is enabled.
 *
 * Convenience function for conditional logic outside hot paths.
 */
export function isTelemetryEnabled(): boolean {
  return providerRef.current !== undefined;
}
