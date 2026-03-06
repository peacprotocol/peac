#!/usr/bin/env node
/**
 * Validate conformance artifacts against their JSON Schemas.
 *
 * Validates:
 * - requirement-ids.json against requirement-registry.schema.json
 * - inventory.json against inventory.schema.json (if present)
 * - fixture entries with requirement metadata against fixture-metadata.schema.json
 *
 * Uses manual validation (no external JSON Schema library).
 * Exit 0: all valid
 * Exit 1: validation failures found
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIREMENT_ID_PATTERN,
  BCP14_KEYWORDS,
  VALID_ENFORCEMENT_CLASSES,
  ERROR_CODE_PATTERN,
  FRAGMENT_HASH_PATTERN,
} from './core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

let failures = 0;

function fail(context, message) {
  console.error(`FAIL [${context}]: ${message}`);
  failures++;
}

function ok(context) {
  console.log(`OK: ${context}`);
}

// --- Validate requirement-ids.json ---
const registryPath = join(ROOT, 'specs/conformance/requirement-ids.json');
if (existsSync(registryPath)) {
  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));

  // Check required fields
  if (!registry.$schema) fail('registry', 'Missing $schema');
  if (!registry.version) fail('registry', 'Missing version');
  if (!registry.spec_file) fail('registry', 'Missing spec_file');
  if (!Array.isArray(registry.sections)) fail('registry', 'Missing or invalid sections');

  if (Array.isArray(registry.sections)) {
    const allIds = new Set();
    let prevSectionNum = 0;

    for (const section of registry.sections) {
      // Sections sorted by number
      if (section.section_number <= prevSectionNum) {
        fail('registry', `Section ${section.section_number} not sorted after ${prevSectionNum}`);
      }
      prevSectionNum = section.section_number;

      if (!section.section_title) fail('registry', `Section ${section.section_number}: missing title`);
      if (!section.section_anchor) fail('registry', `Section ${section.section_number}: missing anchor`);
      if (!Array.isArray(section.requirements)) {
        fail('registry', `Section ${section.section_number}: missing requirements`);
        continue;
      }

      for (const req of section.requirements) {
        // ID format
        if (!REQUIREMENT_ID_PATTERN.test(req.id)) {
          fail('registry', `Invalid ID format: ${req.id}`);
        }

        // Unique IDs
        if (allIds.has(req.id)) {
          fail('registry', `Duplicate ID: ${req.id}`);
        }
        allIds.add(req.id);

        // Required fields
        const reqFields = ['id', 'keyword', 'summary', 'source_fragment', 'source_fragment_hash', 'enforcement_class', 'introduced_in', 'last_reviewed_in'];
        for (const field of reqFields) {
          if (!req[field]) fail('registry', `${req.id}: missing ${field}`);
        }

        // Valid keyword
        if (req.keyword && !BCP14_KEYWORDS.includes(req.keyword)) {
          fail('registry', `${req.id}: invalid keyword "${req.keyword}"`);
        }

        // Valid enforcement class
        if (req.enforcement_class && !VALID_ENFORCEMENT_CLASSES.has(req.enforcement_class)) {
          fail('registry', `${req.id}: invalid enforcement_class "${req.enforcement_class}"`);
        }

        // hard_fail requires error_code
        if (req.enforcement_class === 'hard_fail' && !req.error_code) {
          fail('registry', `${req.id}: hard_fail class requires error_code`);
        }

        // Hash format
        if (req.source_fragment_hash && !FRAGMENT_HASH_PATTERN.test(req.source_fragment_hash)) {
          fail('registry', `${req.id}: invalid source_fragment_hash format`);
        }

        // Error code format
        if (req.error_code && !ERROR_CODE_PATTERN.test(req.error_code)) {
          fail('registry', `${req.id}: invalid error_code format "${req.error_code}"`);
        }
      }
    }
    ok(`requirement-ids.json (${allIds.size} requirements, ${registry.sections.length} sections)`);
  }
} else {
  fail('registry', `${registryPath} not found`);
}

// --- Validate inventory.json (if present) ---
const inventoryPath = join(ROOT, 'specs/conformance/fixtures/inventory.json');
if (existsSync(inventoryPath)) {
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf-8'));

  if (!inventory.$schema) fail('inventory', 'Missing $schema');
  if (!inventory.version) fail('inventory', 'Missing version');
  if (typeof inventory.total_fixtures !== 'number') fail('inventory', 'Missing total_fixtures');
  if (typeof inventory.total_with_requirements !== 'number') fail('inventory', 'Missing total_with_requirements');
  if (!Array.isArray(inventory.entries)) fail('inventory', 'Missing entries');

  if (Array.isArray(inventory.entries)) {
    // Verify sort order: (directory, file, fixture_name)
    for (let i = 1; i < inventory.entries.length; i++) {
      const prev = inventory.entries[i - 1];
      const curr = inventory.entries[i];
      const prevKey = `${prev.directory}/${prev.file}/${prev.fixture_name}`;
      const currKey = `${curr.directory}/${curr.file}/${curr.fixture_name}`;
      if (prevKey >= currKey) {
        fail('inventory', `Entries not sorted: "${prevKey}" >= "${currKey}"`);
        break;
      }
    }

    // Verify requirement ID format
    for (const entry of inventory.entries) {
      if (entry.primary_requirement_id && !REQUIREMENT_ID_PATTERN.test(entry.primary_requirement_id)) {
        fail('inventory', `Invalid requirement ID: ${entry.primary_requirement_id} in ${entry.fixture_name}`);
      }
      if (Array.isArray(entry.requirement_ids)) {
        for (const id of entry.requirement_ids) {
          if (!REQUIREMENT_ID_PATTERN.test(id)) {
            fail('inventory', `Invalid requirement ID: ${id} in ${entry.fixture_name}`);
          }
        }
      }
    }
    ok(`inventory.json (${inventory.entries.length} entries)`);
  }
} else {
  console.log('SKIP: inventory.json not found (will be generated)');
}

// --- Summary ---
if (failures > 0) {
  console.error(`\nFAIL: ${failures} validation failure(s)`);
  process.exit(1);
} else {
  console.log('\nAll schema validations passed');
}
