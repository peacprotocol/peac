/**
 * @peac/mappings-intoto
 *
 * Bidirectional mapping between in-toto v1.0 attestation statements
 * and PEAC provenance extension fields.
 *
 * Maps envelope-level fields only (subjects, predicate type).
 * Full predicate body mapping is out of scope.
 *
 * @packageDocumentation
 */

import { PROVENANCE_EXTENSION_KEY } from '@peac/schema';
import type { ProvenanceExtension } from '@peac/schema';

import { INTOTO_STATEMENT_TYPE } from './types.js';
import type { InTotoStatement, InTotoResourceDescriptor } from './types.js';

export { INTOTO_STATEMENT_TYPE } from './types.js';
export type { InTotoStatement, InTotoResourceDescriptor } from './types.js';

// ---------------------------------------------------------------------------
// in-toto -> PEAC
// ---------------------------------------------------------------------------

/**
 * Map an in-toto v1.0 Statement to a PEAC ProvenanceExtension.
 *
 * Maps envelope-level fields:
 * - subject[0].uri -> source_ref (first subject; multi-subject uses first)
 * - subject[0].digest -> source_ref (if uri absent; prefers sha256, then lexicographic first)
 * - predicateType -> verification_method (as metadata, not enforcement)
 *
 * @param statement - in-toto v1.0 Statement
 * @returns Object with extensionKey and mapped provenance extension
 * @throws Error if statement._type is not in-toto v1.0
 */
export function toPeacFromInToto(statement: InTotoStatement): {
  extensionKey: typeof PROVENANCE_EXTENSION_KEY;
  extension: ProvenanceExtension;
} {
  if (statement._type !== INTOTO_STATEMENT_TYPE) {
    throw new Error(
      `Expected in-toto v1.0 Statement (_type: ${INTOTO_STATEMENT_TYPE}), got: ${statement._type}`
    );
  }

  if (!statement.subject || statement.subject.length === 0) {
    throw new Error('in-toto Statement must have at least one subject');
  }

  const primarySubject = statement.subject[0];
  const sourceRef = primarySubject.uri ?? formatDigest(primarySubject.digest);

  const extension: ProvenanceExtension = {
    source_type: 'derived',
    ...(sourceRef && { source_ref: sourceRef }),
    ...(statement.predicateType && { verification_method: statement.predicateType }),
  };

  return {
    extensionKey: PROVENANCE_EXTENSION_KEY,
    extension,
  };
}

// ---------------------------------------------------------------------------
// PEAC -> in-toto
// ---------------------------------------------------------------------------

/**
 * Map a PEAC ProvenanceExtension back to an in-toto v1.0 Statement skeleton.
 *
 * Produces an envelope with subjects and predicate type. The predicate
 * body is empty (callers populate it with domain-specific content).
 *
 * @param extension - PEAC provenance extension fields
 * @returns in-toto v1.0 Statement skeleton
 */
export function fromPeacToInToto(extension: ProvenanceExtension): InTotoStatement {
  const subject: InTotoResourceDescriptor[] = [];

  if (extension.source_ref) {
    // URIs contain "://" (e.g., https://...), digests use "alg:hex" (e.g., sha256:abc)
    if (extension.source_ref.includes('://')) {
      subject.push({ uri: extension.source_ref });
    } else if (extension.source_ref.includes(':')) {
      const [alg, value] = extension.source_ref.split(':', 2);
      subject.push({ digest: { [alg]: value } });
    } else {
      subject.push({ uri: extension.source_ref });
    }
  } else {
    subject.push({ uri: 'unknown' });
  }

  return {
    _type: INTOTO_STATEMENT_TYPE,
    subject,
    predicateType: extension.verification_method ?? 'https://in-toto.io/attestation/v1',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a digest map to "alg:value" string.
 * Prefers sha256 if present; otherwise uses lexicographically first algorithm.
 */
function formatDigest(digest: Record<string, string> | undefined): string | undefined {
  if (!digest) return undefined;
  if (digest.sha256) return `sha256:${digest.sha256}`;
  const entries = Object.entries(digest).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return undefined;
  return `${entries[0][0]}:${entries[0][1]}`;
}
