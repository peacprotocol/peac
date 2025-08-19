/**
 * PEAC Protocol v0.9.6 Telemetry Module
 *
 * Provides enterprise-grade observability with:
 * - Distributed tracing with W3C Trace Context
 * - Performance monitoring and SLI tracking
 * - Business metrics correlation
 * - Error tracking and debugging
 * - Multi-vendor export compatibility
 */

export * from './tracing';

// Re-export for convenience
export { logger } from '../logging';
export { prometheus } from '../metrics/prom';
