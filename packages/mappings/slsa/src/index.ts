/**
 * @peac/mappings-slsa
 *
 * Bidirectional mapping between SLSA v1.2 provenance predicates
 * and PEAC provenance extension fields.
 *
 * Maps build definition, run details, and SLSA level metadata
 * to the ProvenanceExtension.slsa field and related fields.
 *
 * @packageDocumentation
 */

import { PROVENANCE_EXTENSION_KEY } from '@peac/schema';
import type { ProvenanceExtension, SlsaLevel } from '@peac/schema';

import type { SlsaProvenance } from './types.js';

export { SLSA_PROVENANCE_PREDICATE_TYPE } from './types.js';
export type {
  SlsaProvenance,
  SlsaBuildDefinition,
  SlsaRunDetails,
  SlsaResourceDescriptor,
} from './types.js';

// ---------------------------------------------------------------------------
// SLSA -> PEAC
// ---------------------------------------------------------------------------

/**
 * Options for SLSA to PEAC mapping.
 */
export interface ToPeacFromSlsaOptions {
  /** SLSA track (e.g., 'build', 'source'). Default: 'build'. */
  track?: string;
  /** SLSA level within the track (0-4). */
  level: number;
}

/**
 * Map SLSA v1.2 provenance to a PEAC ProvenanceExtension.
 *
 * Maps:
 * - buildDefinition.buildType -> source_ref
 * - runDetails.builder.id -> verification_method
 * - SLSA track/level/version -> slsa field
 * - runDetails.metadata.invocationId -> source_ref (if buildType absent)
 *
 * @param provenance - SLSA v1.2 provenance predicate
 * @param options - SLSA level and track metadata
 * @returns Object with extensionKey and mapped provenance extension
 */
export function toPeacFromSlsa(
  provenance: SlsaProvenance,
  options: ToPeacFromSlsaOptions
): {
  extensionKey: typeof PROVENANCE_EXTENSION_KEY;
  extension: ProvenanceExtension;
} {
  const track = options.track ?? 'build';

  const slsa: SlsaLevel = {
    track,
    level: options.level,
    version: '1.2',
  };

  // Derive source_ref from resolved dependencies (canonical source),
  // not from buildType (which identifies the build template/process).
  const sourceRef = extractCanonicalSource(provenance.buildDefinition);

  const extension: ProvenanceExtension = {
    source_type: 'derived',
    ...(sourceRef && { source_ref: sourceRef }),
    verification_method: provenance.runDetails.builder.id,
    slsa,
  };

  return {
    extensionKey: PROVENANCE_EXTENSION_KEY,
    extension,
  };
}

// ---------------------------------------------------------------------------
// PEAC -> SLSA
// ---------------------------------------------------------------------------

/**
 * Map a PEAC ProvenanceExtension back to a SLSA v1.2 provenance skeleton.
 *
 * Produces a provenance predicate with build definition and run details.
 * The predicate body is minimal (callers add domain-specific content).
 *
 * @param extension - PEAC provenance extension fields
 * @returns SLSA v1.2 provenance predicate skeleton
 */
export function fromPeacToSlsa(extension: ProvenanceExtension): SlsaProvenance {
  const resolvedDependencies = extension.source_ref ? [{ uri: extension.source_ref }] : undefined;

  return {
    buildDefinition: {
      buildType: 'unknown',
      ...(resolvedDependencies && { resolvedDependencies }),
    },
    runDetails: {
      builder: {
        id: extension.verification_method ?? 'unknown',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { SlsaBuildDefinition } from './types.js';

/**
 * Extract a canonical source reference from resolved dependencies.
 *
 * Prefers the first dependency with a URI. Falls back to the first
 * dependency with a digest (formatted as "alg:value", preferring sha256).
 * Returns undefined if no canonical source is found (source_ref is
 * omitted rather than overloading buildType).
 */
function extractCanonicalSource(buildDef: SlsaBuildDefinition): string | undefined {
  const deps = buildDef.resolvedDependencies;
  if (!deps || deps.length === 0) return undefined;

  // Prefer first dependency with a URI
  for (const dep of deps) {
    if (dep.uri) return dep.uri;
  }

  // Fall back to first dependency with a digest
  for (const dep of deps) {
    if (dep.digest) {
      return formatDigest(dep.digest);
    }
  }

  return undefined;
}

/**
 * Format a digest map to "alg:value" string, preferring sha256.
 */
function formatDigest(digest: Record<string, string>): string | undefined {
  if (digest.sha256) return `sha256:${digest.sha256}`;
  const entries = Object.entries(digest).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return undefined;
  return `${entries[0][0]}:${entries[0][1]}`;
}
