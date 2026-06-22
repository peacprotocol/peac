/**
 * Single source of truth for the @peac/telemetry-otel package version.
 *
 * Tracks the PEAC package / release version (docs/releases/current.json),
 * NOT the OpenTelemetry API/SDK version. Kept in sync by
 * scripts/verify-doc-version-currency.mjs.
 */
export const TELEMETRY_OTEL_VERSION = '0.15.2';
