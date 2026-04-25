/**
 * @peac/disc/types - Discovery result types for .well-known/peac.txt
 *
 * peac.txt is a POLICY DOCUMENT surface per docs/specs/PEAC-TXT.md.
 * It is NOT a key discovery surface. Key resolution uses the normative
 * chain: `iss` -> /.well-known/peac-issuer.json -> `jwks_uri` -> JWKS.
 *
 * `@peac/disc` is a thin loader/validator over peac-policy/0.1 bytes
 * (YAML or JSON). Full parsing is delegated to
 * `@peac/policy-kit.parsePolicyDocument`; the canonical `PolicyDocument`
 * type is re-exported from `@peac/policy-kit`.
 *
 * @see docs/specs/PEAC-TXT.md
 * @see docs/specs/PEAC-ISSUER.md
 */

import type { PolicyDocument } from '@peac/policy-kit';

export type { PolicyDocument };

/**
 * Result of `parse()`. On success, `data` is the validated
 * `peac-policy/0.1` `PolicyDocument`. On failure, `errors` explains why.
 * `warnings` carries non-fatal advisories; in particular, legacy
 * key-discovery lines (`verify`, `public_keys`, `jwks`) that appeared in
 * older peac.txt examples are listed here and also fire a structured
 * `process.emitWarning` with code `PEAC_LEGACY_PEAC_TXT_KEY_FIELD`
 * once per process.
 */
export interface ParseResult {
  valid: boolean;
  data?: PolicyDocument;
  errors?: string[];
  warnings?: string[];
}

export interface ValidationOptions {
  /** Soft line cap for advisory purposes (default 100, per PEAC-TXT.md §6.2). */
  recommendedMaxLines?: number;
}

/**
 * @deprecated Key discovery via peac.txt is retired. Use the normative
 * discovery chain `iss` -> /.well-known/peac-issuer.json -> `jwks_uri` ->
 * JWKS instead. This type is retained for one minor to keep existing import
 * paths compiling. Removal target: next cleanup release.
 */
export interface PublicKeyInfo {
  kid: string;
  alg: string;
  key: string;
}

/**
 * @deprecated pre-v0.12.14 alias for the legacy line-based PEAC discovery
 * shape. Use the `ParseResult.data` (`PolicyDocument`) returned by `parse()`.
 * Retained for one minor so existing import paths keep compiling; removal
 * target: next cleanup release.
 */
export interface PeacDiscovery {
  [key: string]: unknown;
}
