/**
 * Parity corpus loader.
 *
 * INTERNAL TEST HELPER. Loads parity-corpus families under
 * specs/conformance/parity-corpus/ and validates each family's vectors.json
 * against its vectors.schema.json (JSON Schema 2020-12) using ajv strict +
 * ajv-formats.
 *
 * Used by the differential harness in __tests__/_internal/. Not exported
 * from packages/protocol/src/index.ts. Not part of the published surface.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

/** Canonical family identifiers (v0.13.1 floor + a2a-handoff added in v0.14.1). */
export const PARITY_FAMILIES = [
  'default-flows',
  'jose-hardening',
  'runtime-governance',
  'commerce-bridges',
  'a2a-handoff',
] as const;

export type ParityFamily = (typeof PARITY_FAMILIES)[number];

/** Floor vector counts per family (per plan amendment §0S.5; a2a-handoff added in v0.14.1). */
export const PARITY_FLOOR_COUNTS: Readonly<Record<ParityFamily, number>> = {
  'default-flows': 12,
  'jose-hardening': 8,
  'runtime-governance': 7,
  'commerce-bridges': 4,
  'a2a-handoff': 15,
};

export interface ParityVectorInput {
  readonly payload: Record<string, unknown>;
  readonly header?: Record<string, unknown>;
}

export interface ParityVectorExpected {
  readonly accepted: boolean;
  readonly errors?: ReadonlyArray<{ readonly code: string; readonly path?: string }>;
  readonly warnings?: ReadonlyArray<{ readonly code: string; readonly path?: string }>;
}

export interface ParityVector {
  readonly id: string;
  readonly description: string;
  readonly input: ParityVectorInput;
  readonly expected: ParityVectorExpected;
}

export interface ParityCorpusFamily {
  readonly family: ParityFamily;
  readonly description: string;
  readonly version: string;
  readonly generator?: string;
  readonly vectors: ReadonlyArray<ParityVector>;
}

/**
 * Resolve the parity-corpus root directory.
 *
 * Walks up from `process.cwd()` looking for `specs/conformance/parity-corpus/`.
 * Works whether tests run from the repo root or from any package directory.
 * Override allowed via the optional argument.
 */
export function resolveCorpusRoot(override?: string): string {
  if (override) return override;
  let cur = process.cwd();
  for (let i = 0; i < 16; i++) {
    const candidate = resolve(cur, 'specs', 'conformance', 'parity-corpus');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(
    `parity-corpus root not found by walking up from ${process.cwd()}; ` +
      `expected to find specs/conformance/parity-corpus/`
  );
}

/**
 * Load and schema-validate one parity family. Throws an Error with a
 * structured message if the family's vectors.json does not match its
 * vectors.schema.json or if the floor count is not met.
 */
export function loadFamily(family: ParityFamily, corpusRoot?: string): ParityCorpusFamily {
  const root = resolveCorpusRoot(corpusRoot);
  const familyDir = resolve(root, family);
  const vectorsPath = resolve(familyDir, 'vectors.json');
  const schemaPath = resolve(familyDir, 'vectors.schema.json');

  const schemaJson = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
  const vectorsJson = JSON.parse(readFileSync(vectorsPath, 'utf8')) as object;

  const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: false });
  // ajv-formats v3 default export is a function in ESM mode.
  (addFormats as unknown as (a: typeof ajv) => void)(ajv);
  const validate = ajv.compile(schemaJson);

  if (!validate(vectorsJson)) {
    const errs = (validate.errors ?? [])
      .map((e) => `${e.instancePath || '/'}: ${e.message ?? 'invalid'}`)
      .join('; ');
    throw new Error(`parity-corpus(${family}): vectors.json failed schema validation: ${errs}`);
  }

  const loaded = vectorsJson as ParityCorpusFamily;
  const floor = PARITY_FLOOR_COUNTS[family];
  if (loaded.vectors.length < floor) {
    throw new Error(
      `parity-corpus(${family}): vector count ${loaded.vectors.length} below floor ${floor}`
    );
  }

  // Defensive check: vector ids must be unique within a family.
  const seen = new Set<string>();
  for (const v of loaded.vectors) {
    if (seen.has(v.id)) {
      throw new Error(`parity-corpus(${family}): duplicate vector id ${v.id}`);
    }
    seen.add(v.id);
  }

  return loaded;
}

/** Load all four families. Returns them in declared family order. */
export function loadAllFamilies(corpusRoot?: string): ReadonlyArray<ParityCorpusFamily> {
  return PARITY_FAMILIES.map((f) => loadFamily(f, corpusRoot));
}
