/**
 * Generate TypeScript registry constants from specs/kernel/registries.json
 *
 * This script is the single source of truth for registry data.
 * Run: npx tsx scripts/codegen-registries.ts
 *
 * CI should run this and assert `git diff --exit-code` to detect drift.
 * The output is deterministic: sorted alphabetically, no timestamps.
 */

import * as fs from 'fs';
import * as path from 'path';

const SPEC_PATH = path.join(__dirname, '../specs/kernel/registries.json');
const OUTPUT_PATH = path.join(__dirname, '../packages/kernel/src/registries.generated.ts');
// JSON Schema for external validation: specs/kernel/registries.schema.json

// ---------------------------------------------------------------------------
// Spec types
// ---------------------------------------------------------------------------

interface RegistryEntry {
  id: string;
  category: string;
  description: string;
  reference: string | null;
  status: string;
}

interface ProofTypeEntry extends RegistryEntry {}

interface ReceiptTypeEntry {
  id: string;
  pillar: string;
  description: string;
  extension_group: string | null;
  status: string;
}

interface ExtensionGroupEntry {
  id: string;
  description: string;
  status: string;
}

interface PillarValues {
  _comment: string;
  values: string[];
}

interface RegistriesJson {
  $schema: string;
  version: string;
  description: string;
  payment_rails: RegistryEntry[];
  control_engines: RegistryEntry[];
  transport_methods: RegistryEntry[];
  agent_protocols: RegistryEntry[];
  proof_types: ProofTypeEntry[];
  pillar_values: PillarValues;
  receipt_types: { _comment: string; values: ReceiptTypeEntry[] };
  extension_groups: { _comment: string; values: ExtensionGroupEntry[] };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateEntry(entry: RegistryEntry, section: string): void {
  if (!entry.id || typeof entry.id !== 'string') {
    throw new Error(`${section}: entry missing id`);
  }
  if (!entry.category || typeof entry.category !== 'string') {
    throw new Error(`${section}/${entry.id}: missing category`);
  }
  if (!entry.description || typeof entry.description !== 'string') {
    throw new Error(`${section}/${entry.id}: missing description`);
  }
  if (entry.reference !== null && typeof entry.reference !== 'string') {
    throw new Error(`${section}/${entry.id}: reference must be string or null`);
  }
  if (entry.reference !== null && !entry.reference.startsWith('http')) {
    throw new Error(`${section}/${entry.id}: reference must be HTTP/HTTPS URL or null`);
  }
}

function validateReceiptType(entry: ReceiptTypeEntry): void {
  if (!entry.id || typeof entry.id !== 'string') {
    throw new Error(`receipt_types: entry missing id`);
  }
  if (!entry.pillar || typeof entry.pillar !== 'string') {
    throw new Error(`receipt_types/${entry.id}: missing pillar`);
  }
  if (entry.extension_group !== null && typeof entry.extension_group !== 'string') {
    throw new Error(`receipt_types/${entry.id}: extension_group must be string or null`);
  }
}

function validateExtensionGroup(entry: ExtensionGroupEntry): void {
  if (!entry.id || typeof entry.id !== 'string') {
    throw new Error(`extension_groups: entry missing id`);
  }
  if (!entry.description || typeof entry.description !== 'string') {
    throw new Error(`extension_groups/${entry.id}: missing description`);
  }
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

function main() {
  console.log('Reading specs/kernel/registries.json...');
  const specContent = fs.readFileSync(SPEC_PATH, 'utf-8');
  const spec: RegistriesJson = JSON.parse(specContent);

  console.log(`Spec version: ${spec.version}`);

  // Structural validation (required sections present with correct shapes)
  const requiredSections = [
    'payment_rails',
    'control_engines',
    'transport_methods',
    'agent_protocols',
    'proof_types',
  ] as const;
  for (const section of requiredSections) {
    if (!Array.isArray(spec[section])) {
      throw new Error(`Missing or invalid section: ${section} (must be an array)`);
    }
  }
  if (!spec.pillar_values?.values || !Array.isArray(spec.pillar_values.values)) {
    throw new Error('Missing or invalid section: pillar_values.values');
  }
  if (!spec.receipt_types?.values || !Array.isArray(spec.receipt_types.values)) {
    throw new Error('Missing or invalid section: receipt_types.values');
  }
  if (!spec.extension_groups?.values || !Array.isArray(spec.extension_groups.values)) {
    throw new Error('Missing or invalid section: extension_groups.values');
  }
  console.log('Structural validation passed.');
  // Full JSON Schema validation runs separately via validate-registries-schema.mjs
  // (wired into guard.sh and CI). The schema lives at specs/kernel/registries.schema.json.

  // Validate all entries
  for (const entry of spec.payment_rails) validateEntry(entry, 'payment_rails');
  for (const entry of spec.control_engines) validateEntry(entry, 'control_engines');
  for (const entry of spec.transport_methods) validateEntry(entry, 'transport_methods');
  for (const entry of spec.agent_protocols) validateEntry(entry, 'agent_protocols');
  for (const entry of spec.proof_types) validateEntry(entry, 'proof_types');
  for (const entry of spec.receipt_types.values) validateReceiptType(entry);
  for (const entry of spec.extension_groups.values) validateExtensionGroup(entry);

  // Check ID uniqueness within each section
  const sections: [string, { id: string }[]][] = [
    ['payment_rails', spec.payment_rails],
    ['control_engines', spec.control_engines],
    ['transport_methods', spec.transport_methods],
    ['agent_protocols', spec.agent_protocols],
    ['proof_types', spec.proof_types],
    ['receipt_types', spec.receipt_types.values],
    ['extension_groups', spec.extension_groups.values],
  ];

  for (const [name, entries] of sections) {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.id)) {
        throw new Error(`${name}: duplicate id "${entry.id}"`);
      }
      ids.add(entry.id);
    }
  }

  // Validate pillar values are sorted
  const pillars = spec.pillar_values.values;
  for (let i = 1; i < pillars.length; i++) {
    if (pillars[i] <= pillars[i - 1]) {
      throw new Error(`pillar_values: not sorted at index ${i} ("${pillars[i]}")`);
    }
  }

  // Generate output
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * PEAC Protocol Registries');
  lines.push(' *');
  lines.push(' * AUTO-GENERATED from specs/kernel/registries.json');
  lines.push(' * DO NOT EDIT MANUALLY - run: npx tsx scripts/codegen-registries.ts');
  lines.push(` * Spec version: ${spec.version}`);
  lines.push(' */');
  lines.push('');
  lines.push('import type {');
  lines.push('  PaymentRailEntry,');
  lines.push('  ControlEngineEntry,');
  lines.push('  TransportMethodEntry,');
  lines.push('  AgentProtocolEntry,');
  lines.push("} from './types.js';");
  lines.push('');

  // Proof type entry type (new, generated alongside data)
  lines.push('/** Proof type registry entry */');
  lines.push('export interface ProofTypeEntry {');
  lines.push('  id: string;');
  lines.push('  category: string;');
  lines.push('  description: string;');
  lines.push('  reference: string | null;');
  lines.push('  status: string;');
  lines.push('}');
  lines.push('');

  // Receipt type entry type
  lines.push('/** Receipt type registry entry (Wire 0.2) */');
  lines.push('export interface ReceiptTypeEntry {');
  lines.push('  id: string;');
  lines.push('  pillar: string;');
  lines.push('  description: string;');
  lines.push('  extension_group: string | null;');
  lines.push('  status: string;');
  lines.push('}');
  lines.push('');

  // Extension group entry type
  lines.push('/** Extension group registry entry (Wire 0.2) */');
  lines.push('export interface ExtensionGroupEntry {');
  lines.push('  id: string;');
  lines.push('  description: string;');
  lines.push('  status: string;');
  lines.push('}');
  lines.push('');

  // Generate registry arrays (sorted by id for determinism)
  generateRegistryArray(lines, 'PAYMENT_RAILS', 'PaymentRailEntry', spec.payment_rails);
  generateRegistryArray(lines, 'CONTROL_ENGINES', 'ControlEngineEntry', spec.control_engines);
  generateRegistryArray(lines, 'TRANSPORT_METHODS', 'TransportMethodEntry', spec.transport_methods);
  generateRegistryArray(lines, 'AGENT_PROTOCOLS', 'AgentProtocolEntry', spec.agent_protocols);
  generateRegistryArray(lines, 'PROOF_TYPES', 'ProofTypeEntry', spec.proof_types);

  // Receipt types
  lines.push('/** Receipt type registry (Wire 0.2, 10 pillar-aligned types) */');
  lines.push('export const RECEIPT_TYPES: readonly ReceiptTypeEntry[] = [');
  const sortedReceiptTypes = [...spec.receipt_types.values].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  for (const entry of sortedReceiptTypes) {
    lines.push('  {');
    lines.push(`    id: ${sq(entry.id)},`);
    lines.push(`    pillar: ${sq(entry.pillar)},`);
    lines.push(`    description: ${sq(entry.description)},`);
    lines.push(
      `    extension_group: ${entry.extension_group === null ? 'null' : sq(entry.extension_group!)},`
    );
    lines.push(`    status: ${sq(entry.status)},`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');

  // Extension groups
  lines.push('/** Extension group registry (Wire 0.2) */');
  lines.push('export const EXTENSION_GROUPS: readonly ExtensionGroupEntry[] = [');
  const sortedExtGroups = [...spec.extension_groups.values].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  for (const entry of sortedExtGroups) {
    lines.push('  {');
    lines.push(`    id: ${sq(entry.id)},`);
    lines.push(`    description: ${sq(entry.description)},`);
    lines.push(`    status: ${sq(entry.status)},`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');

  // Type-to-extension mapping (DD-173.3)
  lines.push('/**');
  lines.push(' * Type-to-extension group mapping for first-party receipt types.');
  lines.push(
    ' * Used by @peac/protocol.verifyLocal() for type-to-extension enforcement (DD-173.3).'
  );
  lines.push(' * Entries with extension_group === null are excluded (no enforcement yet).');
  lines.push(' */');
  lines.push('export const TYPE_TO_EXTENSION_MAP: ReadonlyMap<string, string> = new Map([');
  for (const entry of sortedReceiptTypes) {
    if (entry.extension_group !== null) {
      lines.push(`  [${sq(entry.id)}, ${sq(entry.extension_group!)}],`);
    }
  }
  lines.push(']);');
  lines.push('');

  // Pillar values
  lines.push('/** Closed pillar vocabulary (10 values, sorted alphabetically) */');
  lines.push('export const PILLAR_VALUES = [');
  for (const p of pillars) {
    lines.push(`  ${sq(p)},`);
  }
  lines.push('] as const;');
  lines.push('');

  // Aggregate export
  lines.push('/** All registries export */');
  lines.push('export const REGISTRIES = {');
  lines.push('  payment_rails: PAYMENT_RAILS,');
  lines.push('  control_engines: CONTROL_ENGINES,');
  lines.push('  transport_methods: TRANSPORT_METHODS,');
  lines.push('  agent_protocols: AGENT_PROTOCOLS,');
  lines.push('  proof_types: PROOF_TYPES,');
  lines.push('  receipt_types: RECEIPT_TYPES,');
  lines.push('  extension_groups: EXTENSION_GROUPS,');
  lines.push('  pillar_values: PILLAR_VALUES,');
  lines.push('} as const;');
  lines.push('');

  // Finder functions
  generateFinder(lines, 'findPaymentRail', 'PaymentRailEntry', 'PAYMENT_RAILS');
  generateFinder(lines, 'findControlEngine', 'ControlEngineEntry', 'CONTROL_ENGINES');
  generateFinder(lines, 'findTransportMethod', 'TransportMethodEntry', 'TRANSPORT_METHODS');
  generateFinder(lines, 'findAgentProtocol', 'AgentProtocolEntry', 'AGENT_PROTOCOLS');
  generateFinder(lines, 'findProofType', 'ProofTypeEntry', 'PROOF_TYPES');

  lines.push('/** Find receipt type by ID */');
  lines.push('export function findReceiptType(id: string): ReceiptTypeEntry | undefined {');
  lines.push('  return RECEIPT_TYPES.find((entry) => entry.id === id);');
  lines.push('}');
  lines.push('');

  lines.push('/** Find extension group by ID */');
  lines.push('export function findExtensionGroup(id: string): ExtensionGroupEntry | undefined {');
  lines.push('  return EXTENSION_GROUPS.find((entry) => entry.id === id);');
  lines.push('}');
  lines.push('');

  const content = lines.join('\n');

  console.log(`Writing ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, content);

  // Summary
  console.log('Generated registries:');
  console.log(`  payment_rails: ${spec.payment_rails.length} entries`);
  console.log(`  control_engines: ${spec.control_engines.length} entries`);
  console.log(`  transport_methods: ${spec.transport_methods.length} entries`);
  console.log(`  agent_protocols: ${spec.agent_protocols.length} entries`);
  console.log(`  proof_types: ${spec.proof_types.length} entries`);
  console.log(`  receipt_types: ${spec.receipt_types.values.length} entries`);
  console.log(`  extension_groups: ${spec.extension_groups.values.length} entries`);
  console.log(`  pillar_values: ${pillars.length} values`);
  console.log(
    `  type_to_extension_map: ${sortedReceiptTypes.filter((e) => e.extension_group !== null).length} mappings`
  );

  // Formatting is handled by repo tooling (lint-staged / pre-commit / format:check).
  // Codegen output uses single quotes and consistent style to minimize diffs.
  console.log('Done.');
}

function generateRegistryArray(
  lines: string[],
  constName: string,
  typeName: string,
  entries: RegistryEntry[]
): void {
  const sorted = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  lines.push(`/** ${constName.replace(/_/g, ' ').toLowerCase()} registry */`);
  lines.push(`export const ${constName}: readonly ${typeName}[] = [`);
  for (const entry of sorted) {
    lines.push('  {');
    lines.push(`    id: ${sq(entry.id)},`);
    lines.push(`    category: ${sq(entry.category)},`);
    lines.push(`    description: ${sq(entry.description)},`);
    lines.push(`    reference: ${entry.reference === null ? 'null' : sq(entry.reference!)},`);
    lines.push(`    status: ${sq(entry.status)},`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
}

function generateFinder(
  lines: string[],
  funcName: string,
  typeName: string,
  constName: string
): void {
  lines.push(`/** Find ${typeName.replace(/Entry$/, '').toLowerCase()} by ID */`);
  lines.push(`export function ${funcName}(id: string): ${typeName} | undefined {`);
  lines.push(`  return ${constName}.find((entry) => entry.id === id);`);
  lines.push('}');
  lines.push('');
}

/**
 * Single-quote a string for TypeScript output.
 * Escapes internal single quotes and backslashes.
 * Matches the repo's prettier singleQuote: true convention.
 */
function sq(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

main();
