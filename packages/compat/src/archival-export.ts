import type { MigrationClass } from './taxonomy.js';

/**
 * Internal scaffold for the archival-export format. Future releases finalize
 * this into a normative document under docs/specs/ and add reader/writer
 * implementations. v0.13.1 only defines the type surface so consumers can
 * compile against it.
 */
export interface ArchivalRecord {
  readonly recordRef: string;
  readonly originalWire: string;
  readonly archivedAt: string;
  readonly migrationVerdict?: { class: MigrationClass; notes: readonly string[] };
  readonly payload: unknown;
}

export interface ArchivalBundle {
  readonly version: 'peac-archival/0.1-internal';
  readonly createdAt: string;
  readonly records: readonly ArchivalRecord[];
}
