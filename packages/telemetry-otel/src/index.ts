/**
 * @peac/telemetry-otel - OpenTelemetry adapter for PEAC telemetry
 *
 * This package bridges PEAC telemetry events to OpenTelemetry spans,
 * events, and metrics. It provides:
 *
 * - Privacy-preserving attribute filtering
 * - W3C Trace Context propagation helpers
 * - Baseline metrics without requiring active spans
 * - Zero-overhead when disabled
 *
 * @example
 * ```typescript
 * import { setTelemetryProvider } from '@peac/telemetry';
 * import { createOtelProvider } from '@peac/telemetry-otel';
 *
 * // Create and register the OTel provider
 * const provider = createOtelProvider({
 *   serviceName: 'my-peac-service',
 *   privacyMode: 'strict', // Default: hash all identifiers
 * });
 *
 * setTelemetryProvider(provider);
 * ```
 */

export const TELEMETRY_OTEL_VERSION = '0.9.22';

// Main provider
export { createOtelProvider, type OtelProviderOptions } from './provider.js';

// W3C Trace Context utilities
export {
  validateTraceparent,
  parseTraceparent,
  isSampled,
  extractTraceparentFromHeaders,
  extractTracestateFromHeaders,
  createTraceContextExtensions,
  TRACE_CONTEXT_KEYS,
  type TraceparentParts,
} from './trace-context.js';

// Privacy utilities
export {
  createPrivacyFilter,
  hashIssuer,
  hashKid,
  shouldEmitAttribute,
  type FilteredAttributes,
} from './privacy.js';

// Metrics utilities
export {
  createMetrics,
  recordReceiptIssued,
  recordReceiptVerified,
  recordAccessDecision,
  METRIC_NAMES,
  type PeacMetrics,
} from './metrics.js';
