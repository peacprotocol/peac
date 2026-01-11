/**
 * PEAC Protocol Implementation
 * Receipt issuance and verification with JWKS caching
 */

export * from './issue';
export * from './verify';
export * from './verify-local';
export * from './headers';
export * from './discovery';

// Re-export crypto utilities for single-package quickstart
export { generateKeypair, verify } from '@peac/crypto';
