/**
 * RSL (Robots Specification Layer) type definitions
 *
 * RSL is a machine-readable licensing specification for web content.
 * This module defines types for RSL usage tokens that can be mapped
 * to PEAC ControlPurpose values.
 *
 * @see https://www.robots.dev/rsl (RSL specification)
 */

/**
 * RSL usage token type
 *
 * Standard RSL usage tokens that control how content may be used.
 *
 * Well-known tokens:
 * - "ai-train": AI/ML model training
 * - "ai-input": RAG/grounding (using content as input to AI)
 * - "ai-search": AI-powered search
 * - "search": Traditional search engine indexing
 * - "ai-all": Shorthand for ai-train + ai-input + ai-search
 */
export type RslUsageToken = 'ai-train' | 'ai-input' | 'ai-search' | 'search' | 'ai-all';

/**
 * RSL rule structure (simplified)
 *
 * Represents a single RSL rule from a robots.txt License: directive
 * or llms.txt configuration.
 *
 * Note: This is a minimal subset for v0.9.17 alignment. Full RSL
 * support (OLP, CAP, EMS) is out of scope for this version.
 */
export interface RslRule {
  /** Usage tokens that apply to this rule */
  tokens: RslUsageToken[];

  /** Whether this rule allows or disallows the usage (default: allow) */
  allow?: boolean;

  /** Optional scope pattern (URL path pattern) */
  scope?: string;
}

/**
 * RSL mapping result
 *
 * Result of mapping RSL usage tokens to PEAC ControlPurpose values.
 */
export interface RslMappingResult {
  /** Mapped PEAC ControlPurpose values */
  purposes: import('@peac/schema').ControlPurpose[];

  /** Any unknown tokens that were encountered (logged as warnings) */
  unknownTokens: string[];
}
