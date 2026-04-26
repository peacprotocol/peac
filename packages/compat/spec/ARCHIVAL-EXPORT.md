# Archival-export format (internal scaffold)

Internal scaffold for v0.13.1. v0.13.2+ finalizes the format and adds
reader/writer implementations.

The `peac-archival/0.1-internal` format wraps a set of records with their
migration verdicts for archival-and-restore workflows. The type surface
is defined in `packages/compat/src/archival-export.ts`:

```ts
interface ArchivalRecord {
  recordRef: string;
  originalWire: string;
  archivedAt: string;
  migrationVerdict?: { class: MigrationClass; notes: readonly string[] };
  payload: unknown;
}

interface ArchivalBundle {
  version: 'peac-archival/0.1-internal';
  createdAt: string;
  records: readonly ArchivalRecord[];
}
```

v0.13.1 only sets the type surface. Reader / writer implementations,
canonicalization rules, and the normative spec under `docs/specs/`
land in a future release.

The `-internal` suffix on the version identifier signals this is a
workspace-private scaffold; it is NOT a stable archival format and is
NOT intended for cross-organization interchange.
