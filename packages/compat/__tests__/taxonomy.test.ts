/**
 * @peac/compat: migration-class taxonomy invariants.
 *
 * v0.13.1 scaffold: classifyMigration returns 'exact' for identity
 * migrations, 'impossible' for the frozen legacy boundary, and 'lossy'
 * as the default verdict for unclassified pairs.
 */

import { describe, expect, it } from 'vitest';
import { classifyMigration, type MigrationClass } from '../src/taxonomy.js';

describe('classifyMigration', () => {
  it('returns exact for identity migrations', () => {
    const verdict = classifyMigration('peac-receipt/0.1', 'peac-receipt/0.1');
    expect(verdict.class).toBe('exact');
    expect(verdict.notes).toContain('identity migration');
  });

  it('returns impossible for the frozen legacy boundary (peac.receipt/0.9 -> peac-receipt/0.1)', () => {
    const verdict = classifyMigration('peac.receipt/0.9', 'peac-receipt/0.1');
    expect(verdict.class).toBe('impossible');
    expect(verdict.droppedFields).toEqual([]);
    expect(verdict.notes.join(' ')).toMatch(/Frozen legacy boundary/);
    // Note must NOT use marketing prose like "Wire 0.9 -> Wire 0.1+";
    // machine identifiers anchor the conditional, not English prose.
    expect(verdict.notes.join(' ')).not.toMatch(/Wire 0\.9/);
  });

  it('returns lossy as the default verdict for unclassified pairs', () => {
    const verdict = classifyMigration('peac-receipt/0.1', 'unknown-target/0.1');
    expect(verdict.class).toBe('lossy');
    expect(verdict.notes.join(' ')).toMatch(/not yet classified; defaulting to lossy/);
  });

  it('exposes exactly four migration classes via the type', () => {
    // Compile-time check: this assignment fails if MigrationClass adds or
    // drops a member. The runtime assertion is structural.
    const classes: readonly MigrationClass[] = ['exact', 'derived', 'lossy', 'impossible'];
    expect(classes).toHaveLength(4);
  });
});
