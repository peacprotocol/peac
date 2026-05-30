#!/usr/bin/env node
/**
 * Ecosystem Record Carrier Validator
 *
 * Validates:
 *   1. Ecosystem record carriers (docs/interop/ecosystem-record-carriers.json):
 *      JSON Schema validation, record-carrier release invariant, immutable pointers
 *   2. Reference integrations (docs/maintainers/reference-integrations.md):
 *      file exists, has validated surfaces, has maintainer attestation
 *   3. Public integration references (docs/interop/public-integration-reference-format.md):
 *      6-field reference format enforced when entries are present
 *   4. Markdown parity: ecosystem-record-carriers.md matches JSON
 *      (run with --generate to regenerate)
 *
 * Note: the internal release-gate field is `dd90_gate` in the JSON
 * (release-engineering identifier); public generated markdown uses neutral
 * "record-carrying surface" / "supporting evidence input" classification only.
 *
 * Exit codes:
 *   0  All checks pass
 *   1  Validation failure
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const EVIDENCE_JSON = resolve(REPO_ROOT, 'docs/interop/ecosystem-record-carriers.json');
const EVIDENCE_SCHEMA = resolve(REPO_ROOT, 'docs/interop/ecosystem-record-carriers.schema.json');
const EVIDENCE_MD = resolve(REPO_ROOT, 'docs/interop/ecosystem-record-carriers.md');
const PUBLIC_REFERENCES_MD = resolve(
  REPO_ROOT,
  'docs/interop/public-integration-reference-format.md'
);
const REFERENCE_MD = resolve(REPO_ROOT, 'docs/maintainers/reference-integrations.md');

const REQUIRED_ECOSYSTEMS = 2;
const REQUIRED_PUBLIC_REFERENCES = 0;

const REQUIRED_FIELDS = [
  'Project',
  'PEAC Surface',
  'Interoperability Summary',
  'Date',
  'Public Reference URL',
  'Public Role / Context',
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/.+/;
const SHA_RE = /^[0-9a-f]{8,40}$/;

// ---------------------------------------------------------------------------
// Integration evidence (structured JSON + schema + pointer checks)
// ---------------------------------------------------------------------------

function validateIntegrationEvidence() {
  const errors = [];

  if (!existsSync(EVIDENCE_JSON)) {
    return { ok: false, errors: [`Missing ${EVIDENCE_JSON}`], data: null };
  }

  let data;
  try {
    data = JSON.parse(readFileSync(EVIDENCE_JSON, 'utf-8'));
  } catch (err) {
    return {
      ok: false,
      errors: [`Invalid JSON in ${EVIDENCE_JSON}: ${err.message}`],
      data: null,
    };
  }

  // Schema validation
  if (existsSync(EVIDENCE_SCHEMA)) {
    const schema = JSON.parse(readFileSync(EVIDENCE_SCHEMA, 'utf-8'));
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    if (!validate(data)) {
      for (const err of validate.errors) {
        errors.push(`Schema: ${err.instancePath || '/'} ${err.message}`);
      }
    }
  } else {
    errors.push(`Missing schema file: ${EVIDENCE_SCHEMA}`);
  }

  if (!Array.isArray(data.integrations)) {
    return {
      ok: false,
      errors: [...errors, 'integrations must be an array'],
      data,
    };
  }

  const dd90 = data.integrations.filter((i) => i.dd90_gate === true);

  if (dd90.length < REQUIRED_ECOSYSTEMS) {
    errors.push('record-carrier release invariant not satisfied');
  }

  // Immutable pointer checks
  for (const integration of data.integrations) {
    const name = integration.ecosystem || '(unnamed)';

    // pr_commit must be valid hex SHA
    if (integration.pr_commit && !SHA_RE.test(integration.pr_commit)) {
      errors.push(
        `${name}: pr_commit "${integration.pr_commit}" is not a valid hex SHA (8-40 chars)`
      );
    }

    // test_files must exist on disk
    if (Array.isArray(integration.test_files)) {
      for (const tf of integration.test_files) {
        const fullPath = resolve(REPO_ROOT, tf);
        if (!existsSync(fullPath)) {
          errors.push(`${name}: test_file not found: ${tf}`);
        }
      }
    }

    // spec_refs must exist on disk
    if (Array.isArray(integration.spec_refs)) {
      for (const sr of integration.spec_refs) {
        const fullPath = resolve(REPO_ROOT, sr);
        if (!existsSync(fullPath)) {
          errors.push(`${name}: spec_ref not found: ${sr}`);
        }
      }
    }

    // evidence text must be non-empty
    if (typeof integration.evidence === 'string' && integration.evidence.trim().length === 0) {
      errors.push(`${name}: evidence text is empty`);
    }

    // supporting evidence inputs should have rationale
    if (integration.dd90_gate === false && !integration.rationale) {
      errors.push(`${name}: supporting evidence input should include rationale for classification`);
    }
  }

  return {
    ok: errors.length === 0,
    ecosystemCount: dd90.length,
    totalIntegrations: data.integrations.length,
    errors,
    data,
  };
}

// ---------------------------------------------------------------------------
// Markdown generation from JSON
// ---------------------------------------------------------------------------

function generateMarkdown(data) {
  const dd90 = data.integrations.filter((i) => i.dd90_gate === true);
  const nonDd90 = data.integrations.filter((i) => i.dd90_gate !== true);

  const lines = [];
  lines.push('# Ecosystem Record Carrier Classification');
  lines.push('');
  lines.push(
    '> **Purpose:** Classifies public PEAC ecosystem surfaces by whether they produce, carry, or consume Wire records.'
  );
  lines.push(
    '> **Rule:** This is a technical interoperability reference for repository-defined record surfaces.'
  );
  lines.push(
    '> **Source:** Generated from `docs/interop/ecosystem-record-carriers.json`. Do not edit manually.'
  );
  lines.push('');
  lines.push('## Record-carrying ecosystem surfaces');
  lines.push('');

  for (const i of dd90) {
    lines.push(`### ${i.ecosystem} (${i.full_name})`);
    lines.push('');
    lines.push(`- **PR:** #${i.pr} (commit \`${i.pr_commit}\`)`);
    lines.push(`- **Surface:** ${i.surface}`);
    lines.push(`- **Evidence:** ${i.evidence}`);
    lines.push(`- **Wire version:** Wire ${i.wire_version}`);
    lines.push('- **Classification:** record-carrying surface');
    lines.push(`- **Test files:** ${i.test_files.map((f) => '`' + f + '`').join(', ')}`);
    lines.push(`- **Spec refs:** ${i.spec_refs.map((f) => '`' + f + '`').join(', ')}`);
    lines.push('');
  }

  if (nonDd90.length > 0) {
    lines.push('## Supporting evidence inputs');
    lines.push('');

    for (const i of nonDd90) {
      lines.push(`### ${i.ecosystem} (${i.full_name})`);
      lines.push('');
      lines.push(`- **PR:** #${i.pr} (commit \`${i.pr_commit}\`)`);
      lines.push(`- **Surface:** ${i.surface}`);
      lines.push(`- **Evidence:** ${i.evidence}`);
      lines.push(
        `- **Wire version:** ${i.wire_version ? 'Wire ' + i.wire_version : 'N/A (identity input, not record output)'}`
      );
      lines.push('- **Classification:** supporting evidence input');
      if (i.rationale) {
        lines.push(`- **Rationale:** ${i.rationale}`);
      }
      lines.push(`- **Test files:** ${i.test_files.map((f) => '`' + f + '`').join(', ')}`);
      lines.push(`- **Spec refs:** ${i.spec_refs.map((f) => '`' + f + '`').join(', ')}`);
      lines.push('');
    }
  }

  lines.push('## Classification Rules');
  lines.push('');
  for (let idx = 0; idx < data.classification_rules.length; idx++) {
    lines.push(`${idx + 1}. ${data.classification_rules[idx]}`);
  }
  lines.push('');

  return lines.join('\n');
}

function checkMarkdownParity(data) {
  const expected = generateMarkdown(data);

  if (!existsSync(EVIDENCE_MD)) {
    return { ok: false, error: `Missing ${EVIDENCE_MD}. Run with --generate to create it.` };
  }

  const actual = readFileSync(EVIDENCE_MD, 'utf-8');
  if (actual !== expected) {
    return {
      ok: false,
      error:
        'ecosystem-record-carriers.md is out of sync with ecosystem-record-carriers.json. Run: node scripts/release/validate-ecosystem-record-carriers.mjs --generate',
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reference integration validations (first-party maintainer evidence)
// ---------------------------------------------------------------------------

function validateReferenceIntegrations() {
  if (!existsSync(REFERENCE_MD)) {
    return { ok: false, error: `Missing ${REFERENCE_MD}` };
  }

  const content = readFileSync(REFERENCE_MD, 'utf-8');
  const lines = content.split('\n');

  // Must have at least one validated surface section (### heading)
  const surfaceHeadings = lines.filter((l) => l.startsWith('### '));
  if (surfaceHeadings.length === 0) {
    return {
      ok: false,
      error: 'reference-integrations.md has no validated surface sections (### headings)',
    };
  }

  // Must have a maintainer attestation section
  const hasAttestation = lines.some((l) => l.startsWith('## Maintainer Attestation'));
  if (!hasAttestation) {
    return {
      ok: false,
      error: 'reference-integrations.md is missing the "## Maintainer Attestation" section',
    };
  }

  return { ok: true, surfaceCount: surfaceHeadings.length };
}

// ---------------------------------------------------------------------------
// External confirmations (structured markdown)
// ---------------------------------------------------------------------------

function parsePublicIntegrationReferences() {
  if (!existsSync(PUBLIC_REFERENCES_MD)) {
    return { ok: false, entries: [], errors: [`Missing ${PUBLIC_REFERENCES_MD}`] };
  }

  const content = readFileSync(PUBLIC_REFERENCES_MD, 'utf-8');
  const lines = content.split('\n');

  const entries = [];
  const errors = [];
  let inComment = false;
  let currentEntry = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip HTML comment blocks
    if (line.includes('<!--')) inComment = true;
    if (line.includes('-->')) {
      inComment = false;
      continue;
    }
    if (inComment) continue;

    // Detect entry heading
    if (line.startsWith('### ')) {
      if (currentEntry) {
        entries.push(currentEntry);
      }
      currentEntry = {
        name: line.slice(4).trim(),
        line: i + 1,
        fields: {},
      };
      continue;
    }

    // Detect field within entry
    if (currentEntry) {
      const fieldMatch = line.match(/^-\s+\*\*(.+?):\*\*\s*(.+)/);
      if (fieldMatch) {
        currentEntry.fields[fieldMatch[1]] = fieldMatch[2].trim();
      }
    }
  }

  if (currentEntry) {
    entries.push(currentEntry);
  }

  // Entries come only from `### ` headings; the reference-format doc has none
  // by default, so this is empty until real public references are added.
  const realEntries = entries;

  // Validate each entry against the 6-field reference format
  for (const entry of realEntries) {
    for (const field of REQUIRED_FIELDS) {
      if (!entry.fields[field]) {
        errors.push(`"${entry.name}" (line ${entry.line}): missing required field "${field}"`);
      }
    }

    // Validate Date format
    const date = entry.fields['Date'];
    if (date && !ISO_DATE_RE.test(date)) {
      errors.push(
        `"${entry.name}" (line ${entry.line}): Date must be ISO 8601 (YYYY-MM-DD), got "${date}"`
      );
    }

    // Validate Public Reference URL
    const link = entry.fields['Public Reference URL'];
    if (link && link !== 'private' && !URL_RE.test(link)) {
      errors.push(
        `"${entry.name}" (line ${entry.line}): Public Reference URL must be a URL (https://...) or "private", got "${link}"`
      );
    }
  }

  return {
    ok: realEntries.length >= REQUIRED_PUBLIC_REFERENCES && errors.length === 0,
    entries: realEntries,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const generateMode = args.includes('--generate');
  let failed = false;

  // 1. Integration evidence
  const evidence = validateIntegrationEvidence();
  if (evidence.ok) {
    console.log('Ecosystem record carriers: release gate satisfied');
  } else {
    console.error('Ecosystem record carriers FAILED:');
    for (const err of evidence.errors) {
      console.error(`  ${err}`);
    }
    failed = true;
  }

  // 2. Markdown generation or parity check
  if (evidence.data) {
    if (generateMode) {
      const md = generateMarkdown(evidence.data);
      writeFileSync(EVIDENCE_MD, md, 'utf-8');
      console.log(`Generated ${EVIDENCE_MD}`);
    } else {
      const parity = checkMarkdownParity(evidence.data);
      if (parity.ok) {
        console.log('Markdown parity: OK');
      } else {
        console.error(`Markdown parity FAILED: ${parity.error}`);
        failed = true;
      }
    }
  }

  // 3. Reference integration validations
  const reference = validateReferenceIntegrations();
  if (reference.ok) {
    console.log('Reference surfaces: validated');
  } else {
    console.error(`Reference integrations FAILED: ${reference.error}`);
    failed = true;
  }

  // 4. Public integration references (format-validated when present)
  const confirmations = parsePublicIntegrationReferences();
  if (confirmations.entries.length === 0) {
    console.log('Public integration references: format check OK');
  } else if (confirmations.errors.length > 0) {
    // Entries exist but are malformed: this IS a hard failure to prevent
    // low-quality entries from accumulating unchecked
    console.error('Public integration references: format errors:');
    for (const err of confirmations.errors) {
      console.error(`  ${err}`);
    }
    failed = true;
  } else {
    console.log('Public integration references: format check OK');
  }

  process.exit(failed ? 1 : 0);
}

main();
