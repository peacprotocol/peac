/**
 * SLSA v1.2 provenance types.
 *
 * Plain TypeScript types mirroring the SLSA v1.2 provenance model.
 * These are external format types, not PEAC schemas.
 *
 * @see https://slsa.dev/spec/v1.0/
 */

/** SLSA provenance predicate type (v1.0 URI, covers v1.x specs) */
export const SLSA_PROVENANCE_PREDICATE_TYPE = 'https://slsa.dev/provenance/v1' as const;

/**
 * SLSA v1.2 build definition.
 *
 * Describes how the artifact was built.
 */
export interface SlsaBuildDefinition {
  /** Build type URI (identifies the build system) */
  buildType: string;
  /** External parameters that influenced the build */
  externalParameters?: Record<string, unknown>;
  /** Internal parameters set by the build platform */
  internalParameters?: Record<string, unknown>;
  /** Build dependencies */
  resolvedDependencies?: SlsaResourceDescriptor[];
}

/**
 * SLSA v1.2 run details.
 *
 * Metadata about the build execution.
 */
export interface SlsaRunDetails {
  /** Builder identity and version */
  builder: {
    id: string;
    version?: Record<string, string>;
    builderDependencies?: SlsaResourceDescriptor[];
  };
  /** Build metadata */
  metadata?: {
    invocationId?: string;
    startedOn?: string;
    finishedOn?: string;
  };
  /** Byproducts of the build */
  byproducts?: SlsaResourceDescriptor[];
}

/**
 * SLSA resource descriptor (shared with in-toto v1.0).
 */
export interface SlsaResourceDescriptor {
  uri?: string;
  digest?: Record<string, string>;
  name?: string;
  downloadLocation?: string;
  mediaType?: string;
  annotations?: Record<string, unknown>;
}

/**
 * SLSA v1.2 provenance predicate body.
 *
 * This is the predicate inside an in-toto Statement when
 * predicateType is `https://slsa.dev/provenance/v1`.
 */
export interface SlsaProvenance {
  /** Build definition */
  buildDefinition: SlsaBuildDefinition;
  /** Run details */
  runDetails: SlsaRunDetails;
}
