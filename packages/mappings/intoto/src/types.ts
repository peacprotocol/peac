/**
 * in-toto Attestation Framework v1.0 types.
 *
 * Plain TypeScript types mirroring the in-toto v1.0 Statement spec.
 * These are external format types, not PEAC schemas.
 *
 * @see https://github.com/in-toto/attestation/tree/main/spec/v1
 */

/** in-toto v1.0 Statement type identifier */
export const INTOTO_STATEMENT_TYPE = 'https://in-toto.io/Statement/v1' as const;

/**
 * in-toto v1.0 ResourceDescriptor.
 *
 * Describes a software artifact with content-based addressing.
 */
export interface InTotoResourceDescriptor {
  /** URI identifying the artifact */
  uri?: string;
  /** Content-based digest(s) of the artifact */
  digest?: Record<string, string>;
  /** Human-readable name */
  name?: string;
  /** URI for download */
  downloadLocation?: string;
  /** Media type */
  mediaType?: string;
  /** Annotations */
  annotations?: Record<string, unknown>;
}

/**
 * in-toto v1.0 Statement (envelope without signature).
 *
 * The Statement binds subjects to a predicate via a typed envelope.
 * Predicate body is opaque JSON; this package maps envelope-level
 * fields only (not full predicate parsing).
 */
export interface InTotoStatement {
  /** Must be INTOTO_STATEMENT_TYPE for v1.0 */
  _type: typeof INTOTO_STATEMENT_TYPE;
  /** Subjects: software artifacts the predicate applies to */
  subject: InTotoResourceDescriptor[];
  /** Predicate type URI */
  predicateType: string;
  /** Predicate body (opaque, type-dependent) */
  predicate?: Record<string, unknown>;
}
