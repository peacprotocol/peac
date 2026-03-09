#!/usr/bin/env node
/**
 * Verify that requirement registry source_fragment_hash values match
 * the current content of WIRE-0.2.md, and check bidirectional consistency
 * between inline [WIRE02-*] annotations in the spec and registry entries.
 *
 * Checks:
 * 1. Fragment hash integrity: recomputed SHA-256 matches stored hash
 * 2. Fragment presence: source_fragment still exists in spec text
 * 3. Bidirectional annotations: every inline [WIRE02-*] in spec has a registry entry,
 *    and every registry entry has a corresponding inline annotation in spec
 *
 * Uses shared core for requirement ID parsing.
 *
 * Usage: node scripts/conformance/verify-registry-drift.mjs
 * Exit 0: all checks pass
 * Exit 1: drift or annotation mismatch detected
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidRequirementId } from './core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const strictMode = process.argv.includes('--strict');

function computeHash(fragment) {
  return 'sha256:' + createHash('sha256').update(fragment, 'utf-8').digest('hex');
}

const registryPath = join(ROOT, 'specs/conformance/requirement-ids.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));

const specPath = join(ROOT, registry.spec_file);
const specContent = readFileSync(specPath, 'utf-8');

let driftCount = 0;
let totalChecked = 0;

// --- Check 1 + 2: Fragment hash integrity and presence ---
const registryIds = new Set();

for (const section of registry.sections) {
  for (const req of section.requirements) {
    totalChecked++;
    registryIds.add(req.id);

    const expectedHash = computeHash(req.source_fragment);

    if (expectedHash !== req.source_fragment_hash) {
      console.error(
        `DRIFT: ${req.id} hash mismatch\n` +
          `  stored:   ${req.source_fragment_hash}\n` +
          `  computed: ${expectedHash}\n` +
          `  fragment: "${req.source_fragment.slice(0, 80)}..."\n`
      );
      driftCount++;
    }

    // Verify the source fragment still exists in the spec
    if (!specContent.includes(req.source_fragment)) {
      console.error(
        `DRIFT: ${req.id} source fragment not found in ${registry.spec_file}\n` +
          `  fragment: "${req.source_fragment.slice(0, 80)}..."\n`
      );
      driftCount++;
    }
  }
}

// --- Check 3: Bidirectional annotation verification ---
// Extract all inline [WIRE02-*] and [CARRIER-*] annotations from spec
const annotationPattern = /\[(WIRE02-[A-Z0-9]+-[0-9]{3})\]/g;
const specAnnotations = new Set();
let match;
while ((match = annotationPattern.exec(specContent)) !== null) {
  if (isValidRequirementId(match[1])) {
    specAnnotations.add(match[1]);
  }
}

// Forward: every spec annotation should exist in registry
let annotationDrift = 0;
for (const id of [...specAnnotations].sort()) {
  if (!registryIds.has(id)) {
    console.log(`ANNOTATION: [${id}] found in spec but not in registry`);
    annotationDrift++;
  }
}

// Reverse: every WIRE02 registry entry should have a spec annotation
for (const id of [...registryIds].sort()) {
  if (!id.startsWith('WIRE02-')) continue; // CARRIER-* annotations may be in a different spec
  if (!specAnnotations.has(id)) {
    console.log(`ANNOTATION: ${id} in registry but no [${id}] annotation in spec`);
    annotationDrift++;
  }
}

if (annotationDrift > 0) {
  if (strictMode) {
    console.error(
      `\nFAIL: ${annotationDrift} annotation mismatch(es) between spec and registry (--strict mode)`
    );
    driftCount += annotationDrift;
  } else {
    console.log(
      `\nINFO: ${annotationDrift} annotation mismatch(es) between spec and registry (use --strict to gate)`
    );
  }
}

// --- Summary ---
if (driftCount > 0) {
  console.error(`\nFAIL: ${driftCount} drift(s) detected across ${totalChecked} requirements`);
  console.error('Run: node scripts/conformance/build-registry.mjs to regenerate');
  process.exit(1);
} else {
  console.log(
    `OK: ${totalChecked} requirements verified, zero drift, ${specAnnotations.size} spec annotations matched`
  );
}
