// Archival-export package contract.
//
// Workspace-private package contract; not a public protocol surface, not a
// stable cross-organization interchange format, and not published. The
// `peac-archival/0.1-internal` identifier is a workspace-private record
// shape used by local migration and archival tooling tests.

import type { MigrationClass } from './taxonomy.js';

export const ARCHIVAL_BUNDLE_VERSION = 'peac-archival/0.1-internal';
const VALID_MIGRATION_CLASSES: readonly MigrationClass[] = [
  'exact',
  'derived',
  'lossy',
  'impossible',
];
const FIELD_MAX_LENGTH = 1024;
const NOTE_MAX_LENGTH = 1024;

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

export type ArchivalValidationFailure =
  | 'archival_invalid_input'
  | 'archival_invalid_version'
  | 'archival_invalid_created_at'
  | 'archival_invalid_records'
  | 'archival_invalid_record'
  | 'archival_invalid_record_ref'
  | 'archival_invalid_original_wire'
  | 'archival_invalid_archived_at'
  | 'archival_invalid_payload'
  | 'archival_invalid_verdict'
  | 'archival_invalid_verdict_class'
  | 'archival_invalid_notes';

export type ArchivalValidationResult =
  | { readonly ok: true; readonly bundle: ArchivalBundle }
  | { readonly ok: false; readonly code: ArchivalValidationFailure; readonly message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isBoundedString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function isJsonCompatible(v: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (v === null) return true;
  const t = typeof v;
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(v as number);
  if (Array.isArray(v)) {
    if (seen.has(v)) return false;
    seen.add(v);
    try {
      for (let i = 0; i < v.length; i += 1) {
        // Reject sparse arrays: every index from 0 to length - 1 must be
        // an own property. Array.prototype.every / map skip holes, which
        // can let `new Array(N)` or `[ , "x" ]` round-trip ambiguously
        // through the deterministic writer.
        if (!Object.prototype.hasOwnProperty.call(v, i)) return false;
        if (!isJsonCompatible(v[i], seen)) return false;
      }
      return true;
    } finally {
      seen.delete(v);
    }
  }
  if (isPlainObject(v)) {
    if (seen.has(v)) return false;
    seen.add(v);
    try {
      for (const entry of Object.values(v)) {
        if (!isJsonCompatible(entry, seen)) return false;
      }
      return true;
    } finally {
      seen.delete(v);
    }
  }
  return false;
}

function fail(code: ArchivalValidationFailure, message: string): ArchivalValidationResult {
  return { ok: false, code, message };
}

interface RecordValidationOk {
  readonly ok: true;
  readonly record: ArchivalRecord;
}

type RecordValidationResult =
  | RecordValidationOk
  | { readonly ok: false; readonly code: ArchivalValidationFailure; readonly message: string };

function validateRecord(rec: unknown, index: number): RecordValidationResult {
  if (!isPlainObject(rec)) {
    return {
      ok: false,
      code: 'archival_invalid_record',
      message: `records[${index}] must be a plain object`,
    };
  }
  if (!isBoundedString(rec.recordRef, FIELD_MAX_LENGTH)) {
    return {
      ok: false,
      code: 'archival_invalid_record_ref',
      message: `records[${index}].recordRef must be a non-empty bounded string`,
    };
  }
  if (!isBoundedString(rec.originalWire, FIELD_MAX_LENGTH)) {
    return {
      ok: false,
      code: 'archival_invalid_original_wire',
      message: `records[${index}].originalWire must be a non-empty bounded string`,
    };
  }
  if (!isBoundedString(rec.archivedAt, FIELD_MAX_LENGTH)) {
    return {
      ok: false,
      code: 'archival_invalid_archived_at',
      message: `records[${index}].archivedAt must be a non-empty bounded string`,
    };
  }
  if (rec.payload === undefined || !isJsonCompatible(rec.payload)) {
    return {
      ok: false,
      code: 'archival_invalid_payload',
      message: `records[${index}].payload must be JSON-compatible`,
    };
  }

  let migrationVerdict: ArchivalRecord['migrationVerdict'];
  if (rec.migrationVerdict !== undefined) {
    const v = rec.migrationVerdict;
    if (!isPlainObject(v)) {
      return {
        ok: false,
        code: 'archival_invalid_verdict',
        message: `records[${index}].migrationVerdict must be a plain object when present`,
      };
    }
    if (
      typeof v.class !== 'string' ||
      !(VALID_MIGRATION_CLASSES as readonly string[]).includes(v.class)
    ) {
      return {
        ok: false,
        code: 'archival_invalid_verdict_class',
        message: `records[${index}].migrationVerdict.class must be one of ${VALID_MIGRATION_CLASSES.join(', ')}`,
      };
    }
    if (!Array.isArray(v.notes)) {
      return {
        ok: false,
        code: 'archival_invalid_notes',
        message: `records[${index}].migrationVerdict.notes must be an array of bounded strings`,
      };
    }
    for (let n = 0; n < v.notes.length; n += 1) {
      if (!isBoundedString(v.notes[n], NOTE_MAX_LENGTH)) {
        return {
          ok: false,
          code: 'archival_invalid_notes',
          message: `records[${index}].migrationVerdict.notes[${n}] must be a non-empty bounded string of <= ${NOTE_MAX_LENGTH} chars`,
        };
      }
    }
    migrationVerdict = {
      class: v.class as MigrationClass,
      notes: v.notes as readonly string[],
    };
  }

  const record: ArchivalRecord = {
    recordRef: rec.recordRef,
    originalWire: rec.originalWire,
    archivedAt: rec.archivedAt,
    payload: rec.payload,
    ...(migrationVerdict !== undefined ? { migrationVerdict } : {}),
  };
  return { ok: true, record };
}

/**
 * Validate an unknown value against the archival-bundle contract. Returns
 * a discriminated union so callers can branch on `result.ok` without
 * exception handling.
 */
export function validateArchivalBundle(input: unknown): ArchivalValidationResult {
  if (!isPlainObject(input)) {
    return fail('archival_invalid_input', 'bundle must be a plain object');
  }
  if (input.version !== ARCHIVAL_BUNDLE_VERSION) {
    return fail('archival_invalid_version', `version must be exactly "${ARCHIVAL_BUNDLE_VERSION}"`);
  }
  if (!isBoundedString(input.createdAt, FIELD_MAX_LENGTH)) {
    return fail('archival_invalid_created_at', 'createdAt must be a non-empty bounded string');
  }
  if (!Array.isArray(input.records)) {
    return fail('archival_invalid_records', 'records must be an array');
  }
  const records: ArchivalRecord[] = [];
  for (let i = 0; i < input.records.length; i += 1) {
    const recordResult = validateRecord(input.records[i], i);
    if (!recordResult.ok) return recordResult;
    records.push(recordResult.record);
  }
  return {
    ok: true,
    bundle: {
      version: ARCHIVAL_BUNDLE_VERSION,
      createdAt: input.createdAt,
      records,
    },
  };
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return (
      '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
    );
  }
  return 'null';
}

/**
 * Serialize an archival bundle to a deterministic JSON string with stable
 * key order. Throws if the input bundle does not validate; the writer
 * never emits malformed output.
 */
export function serializeArchivalBundle(bundle: ArchivalBundle): string {
  const result = validateArchivalBundle(bundle);
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return stableStringify(result.bundle);
}

/**
 * Parse a JSON string into an archival bundle. Throws if the input is not
 * parseable JSON or fails validation.
 */
export function parseArchivalBundle(input: string): ArchivalBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    throw new Error(`archival_invalid_input: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = validateArchivalBundle(parsed);
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result.bundle;
}
