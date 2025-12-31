/**
 * @peac/telemetry
 *
 * Telemetry interfaces and no-op implementation for PEAC protocol.
 *
 * This package provides:
 * - Core telemetry interfaces (TelemetryProvider, inputs, config)
 * - No-op provider for when telemetry is disabled
 * - Provider registry for global telemetry configuration
 * - Attribute constants for consistent naming
 *
 * @example
 * ```typescript
 * import {
 *   setTelemetryProvider,
 *   providerRef,
 *   noopProvider,
 *   PEAC_ATTRS,
 * } from '@peac/telemetry';
 *
 * // Enable telemetry with a custom provider
 * setTelemetryProvider(myOtelProvider);
 *
 * // In hot path (zero overhead when disabled)
 * const p = providerRef.current;
 * if (p) {
 *   try {
 *     p.onReceiptIssued({ receiptHash: '...' });
 *   } catch {
 *     // Telemetry MUST NOT break core flow
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  TelemetryDecision,
  PrivacyMode,
  TelemetryConfig,
  TelemetryProvider,
  ReceiptIssuedInput,
  ReceiptVerifiedInput,
  AccessDecisionInput,
  HttpContext,
  PaymentContext,
} from './types.js';

// No-op provider
export { noopProvider } from './noop.js';

// Provider registry
export {
  providerRef,
  setTelemetryProvider,
  getTelemetryProvider,
  isTelemetryEnabled,
} from './provider.js';

// Attribute constants
export {
  PEAC_ATTRS,
  PEAC_EVENTS,
  PEAC_METRICS,
  TRACE_CONTEXT_EXTENSIONS,
} from './attributes.js';
