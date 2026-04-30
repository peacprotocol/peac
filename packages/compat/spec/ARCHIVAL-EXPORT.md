# Archival-export package contract

`@peac/compat` is a workspace-private package. It is not published to npm, not part of PEAC's public protocol surface, and not a stable cross-organization interchange format. The `peac-archival/0.1-internal` identifier is a workspace-private record shape used by local migration and archival tooling tests.

## Type surface

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

The type surface is defined in `packages/compat/src/archival-export.ts`.

## Reader / writer behaviour

`serializeArchivalBundle(bundle)` returns a deterministic JSON string with stable key order. The writer validates the bundle before serializing, so it never emits malformed output. Two calls with the same bundle produce byte-identical output, regardless of input key order, and regardless of wall-clock time. The writer emits no random or `Date.now()`-derived field.

`parseArchivalBundle(input)` parses a string into an `ArchivalBundle`. It throws an `Error` whose message starts with one of the validation failure codes below if the input is not parseable JSON or does not match the contract.

`validateArchivalBundle(input)` validates an `unknown` value and returns a discriminated union:

```ts
type ArchivalValidationResult =
  | { ok: true; bundle: ArchivalBundle }
  | { ok: false; code: ArchivalValidationFailure; message: string };
```

The validator is the only entry point that does not throw on bad input; both reader and writer use it internally.

## Validation failure classes

| Code                             | Trigger                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `archival_invalid_input`         | top-level value is not a plain object, or the parser fails on malformed JSON        |
| `archival_invalid_version`       | `version` field is not exactly `peac-archival/0.1-internal`                         |
| `archival_invalid_created_at`    | `createdAt` is not a non-empty bounded string                                       |
| `archival_invalid_records`       | `records` is missing or not an array                                                |
| `archival_invalid_record`        | a record is not a plain object                                                      |
| `archival_invalid_record_ref`    | `recordRef` is not a non-empty bounded string                                       |
| `archival_invalid_original_wire` | `originalWire` is not a non-empty bounded string                                    |
| `archival_invalid_archived_at`   | `archivedAt` is not a non-empty bounded string                                      |
| `archival_invalid_payload`       | `payload` is missing or not JSON-compatible                                         |
| `archival_invalid_verdict`       | `migrationVerdict` is present but not a plain object                                |
| `archival_invalid_verdict_class` | `migrationVerdict.class` is not one of `exact` / `derived` / `lossy` / `impossible` |
| `archival_invalid_notes`         | `migrationVerdict.notes` is not an array of non-empty bounded strings               |

Per-field length cap is 1024 characters; per-note length cap is 1024 characters. The caps are package-local; they exist to keep validator memory bounded and are not a normative public limit.

## Boundaries

- Workspace-private package contract. Not published; absent from `scripts/publish-manifest.json`.
- Not a public protocol surface. The reader / writer / validator surface is exposed only to other workspace packages and tests.
- Not a stable interchange format. The `-internal` suffix on the version identifier signals the workspace-private status.
- No published package depends on this package at runtime. `@peac/protocol` does not import from this package.
- The validator and reader are pure: no network I/O, no filesystem I/O, no logging of raw secrets.
