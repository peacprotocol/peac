/**
 * Migration class for cross-version / cross-codec record translation.
 *
 * - exact: target representation preserves all source bits and semantics;
 *   round-trip is byte-identical.
 * - derived: target preserves all source semantics; bit-level representation
 *   differs (e.g., reordered JCS-canonicalized fields). Round-trip from target
 *   back to source is not byte-identical but is semantically lossless.
 * - lossy: target preserves all required semantics for the target's profile;
 *   source-specific fields without a target equivalent are dropped or
 *   summarized. Round-trip is impossible.
 * - impossible: source cannot be represented in the target without loss of
 *   required semantics. Migration MUST refuse.
 */
export type MigrationClass = 'exact' | 'derived' | 'lossy' | 'impossible';

export interface MigrationVerdict {
  readonly class: MigrationClass;
  readonly notes: readonly string[];
  readonly droppedFields?: readonly string[];
}

/**
 * Internal helper: compute a migration verdict for a (sourceWire, targetWire)
 * pair. v0.13.1 scaffold: returns 'exact' for identity migrations, 'impossible'
 * for the frozen legacy boundary, 'lossy' as the default-unclassified verdict.
 *
 * Future releases extend this with cross-version and cross-codec verdicts as
 * they are designed; v0.13.1 only sets the type surface.
 */
export function classifyMigration(sourceWire: string, targetWire: string): MigrationVerdict {
  if (sourceWire === targetWire) {
    return { class: 'exact', notes: ['identity migration'] };
  }
  if (sourceWire === 'peac.receipt/0.9' && targetWire === 'peac-receipt/0.1') {
    return {
      class: 'impossible',
      notes: [
        'Frozen legacy boundary: source and target identifiers are verify-only; no automatic migration is defined.',
      ],
      droppedFields: [],
    };
  }
  return {
    class: 'lossy',
    notes: [`Migration ${sourceWire} -> ${targetWire} not yet classified; defaulting to lossy.`],
  };
}
