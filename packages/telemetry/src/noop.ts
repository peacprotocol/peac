/**
 * @peac/telemetry - No-op telemetry provider
 *
 * This provider does nothing. Use it when telemetry is disabled
 * or when you need a fallback provider.
 */

import type { TelemetryProvider } from './types.js';

/**
 * No-op telemetry provider
 *
 * All methods are empty functions that do nothing.
 * Use this as the default when no telemetry is configured.
 */
export const noopProvider: TelemetryProvider = {
  onReceiptIssued: () => {},
  onReceiptVerified: () => {},
  onAccessDecision: () => {},
};
