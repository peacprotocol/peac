/**
 * Record profile detection registry.
 *
 * Table-driven profile detection for recognized type URI prefixes.
 * Standalone module: reusable by verify API, CLI, and future consumers.
 *
 * PEAC validates the structure and signature of the PEAC record,
 * not the truth of the upstream governance decision.
 */

export interface RecordProfileMatcher {
  /** Type URI prefix to match against. */
  prefix: string;
  /** Profile name returned on match. */
  profile: string;
  /** Extract family name from the matched type URI. */
  familyExtractor: (type: string) => string;
}

export interface RecordProfileMeta {
  /** Recognized record profile. */
  profile: string;
  /** Record family within the profile. */
  family: string;
}

/**
 * Registered profile matchers. New adapters append entries here.
 * Order matters: first match wins.
 */
export const RECORD_PROFILE_MATCHERS: RecordProfileMatcher[] = [
  {
    prefix: 'org.peacprotocol/runtime-governance-',
    profile: 'runtime-governance',
    familyExtractor: (type) => type.slice('org.peacprotocol/runtime-governance-'.length),
  },
  {
    prefix: 'org.peacprotocol/managed-agent-',
    profile: 'managed-agent',
    familyExtractor: (type) => type.slice('org.peacprotocol/managed-agent-'.length),
  },
];

/**
 * Detect record profile from a receipt type URI.
 * Returns undefined for unrecognized types.
 * Does NOT change verification outcome; purely informational metadata.
 */
export function detectRecordProfile(type: string | undefined): RecordProfileMeta | undefined {
  if (!type) return undefined;
  for (const matcher of RECORD_PROFILE_MATCHERS) {
    if (type.startsWith(matcher.prefix)) {
      return {
        profile: matcher.profile,
        family: matcher.familyExtractor(type),
      };
    }
  }
  return undefined;
}
