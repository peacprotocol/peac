/**
 * PEAC Protocol v0.9.6 Validation Module
 *
 * Provides comprehensive input validation using Zod schemas with:
 * - Type-safe request validation
 * - RFC-compliant format validation
 * - Detailed error reporting
 * - Performance optimized schemas
 * - Enterprise security patterns
 */

export * from './schemas';
export * from './middleware';

// Re-export commonly used Zod types for convenience
export { z, ZodError, ZodSchema } from 'zod';
