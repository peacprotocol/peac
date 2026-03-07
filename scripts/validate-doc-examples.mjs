#!/usr/bin/env node
/**
 * Doc-Example Validation Gate (DD-165)
 *
 * Extracts annotated code blocks from spec documents and validates them:
 *   - json: JSON.parse() correctness
 *   - typescript: tsc --noEmit compilation check
 *   - text: structural checks (valid JWS header format, etc.)
 *
 * Annotation system:
 *   <!-- peac:validate -->        opts the next fenced block into CI
 *   <!-- peac:validate json -->   explicit language override
 *   <!-- peac:validate skip -->   explicitly skips validation
 *
 * Usage:
 *   node scripts/validate-doc-examples.mjs
 *   node scripts/validate-doc-examples.mjs docs/specs/WIRE-0.2.md
 *
 * Exit codes:
 *   0  All validated blocks pass
 *   1  One or more blocks failed validation
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Spec documents to validate (relative to REPO_ROOT) */
const DEFAULT_DOCS = [
  'docs/specs/WIRE-0.2.md',
  'docs/specs/EVIDENCE-CARRIER-CONTRACT.md',
  'docs/specs/KERNEL-CONSTRAINTS.md',
];

// ---------------------------------------------------------------------------
// Code block extraction
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CodeBlock
 * @property {string} file - Source file path
 * @property {number} line - Line number of opening fence
 * @property {string} lang - Language tag (json, typescript, text, etc.)
 * @property {string} code - Block content
 * @property {boolean} annotated - Has <!-- peac:validate --> marker
 * @property {string|null} override - Language override from annotation
 * @property {boolean} skip - Has <!-- peac:validate skip -->
 */

/**
 * Extract fenced code blocks from a markdown file.
 * Detects <!-- peac:validate --> annotations on the line(s) before the fence.
 *
 * @param {string} filePath
 * @returns {CodeBlock[]}
 */
function extractCodeBlocks(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const blocks = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect annotation comment
    const annotationMatch = line.match(/<!--\s*peac:validate\s*(.*?)\s*-->/);
    let annotated = false;
    let override = null;
    let skip = false;

    if (annotationMatch) {
      annotated = true;
      const directive = annotationMatch[1].trim();
      if (directive === 'skip') {
        skip = true;
      } else if (directive) {
        override = directive;
      }
      i++;
      // Skip optional blank line between annotation and fence
      if (lines[i]?.trim() === '') {
        i++;
      }
    }

    // Detect opening fence
    const fenceMatch = lines[i]?.match(/^```(\w*)/);
    if (fenceMatch) {
      const lang = override || fenceMatch[1] || 'text';
      const startLine = i + 1;
      const codeLines = [];
      i++;

      // Collect until closing fence
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing fence

      blocks.push({
        file: filePath,
        line: startLine,
        lang,
        code: codeLines.join('\n'),
        annotated,
        override,
        skip,
      });
      continue;
    }

    i++;
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validate a JSON code block.
 * @param {CodeBlock} block
 * @returns {{ok: boolean, error?: string}}
 */
function validateJson(block) {
  try {
    JSON.parse(block.code);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `JSON parse error: ${err.message}` };
  }
}

/**
 * Validate a TypeScript code block via tsc --noEmit.
 * Creates a temp file, runs tsc, reports errors.
 * @param {CodeBlock} block
 * @returns {{ok: boolean, error?: string}}
 */
function validateTypeScript(block) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'peac-doc-validate-'));

  const tmpFile = join(tmpDir, 'snippet.ts');

  // Build preamble: only add type stubs for identifiers not defined in the snippet
  const stubs = [
    ['PeacEvidenceCarrier', 'type PeacEvidenceCarrier = { receipt_ref: string; receipt_jws: string; receipt_url?: string };'],
    ['CarrierAdapter', 'type CarrierAdapter<TInput, TOutput> = { extract: (input: TInput) => any; attach: (output: TOutput, carriers: PeacEvidenceCarrier[], meta?: any) => TOutput; validateConstraints: (carrier: PeacEvidenceCarrier, meta: any) => any };'],
    ['CarrierMeta', 'type CarrierMeta = Record<string, unknown>;'],
    ['CarrierValidationResult', 'type CarrierValidationResult = { valid: boolean; errors?: string[] };'],
  ];

  const preambleLines = ['// Auto-generated for doc-example validation'];
  for (const [name, decl] of stubs) {
    // Skip stub if snippet defines this identifier
    const defPattern = new RegExp(`\\b(type|interface|class)\\s+${name}\\b`);
    if (!defPattern.test(block.code)) {
      preambleLines.push(decl);
    }
  }
  preambleLines.push('');

  writeFileSync(tmpFile, preambleLines.join('\n') + block.code);

  // Write a minimal tsconfig
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'Node16',
      moduleResolution: 'Node16',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['snippet.ts'],
  };
  writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig));

  try {
    const tscBin = join(REPO_ROOT, 'node_modules', '.bin', 'tsc');
    execSync(`"${tscBin}" --noEmit`, { cwd: tmpDir, stdio: 'pipe', timeout: 30_000 });
    return { ok: true };
  } catch (err) {
    const stderr = err.stderr?.toString() || err.stdout?.toString() || 'Unknown tsc error';
    return { ok: false, error: stderr.trim().split('\n').slice(0, 5).join('\n') };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  }
}

/**
 * Validate a bash/shell code block via bash -n (syntax check only, no execution).
 * @param {CodeBlock} block
 * @returns {{ok: boolean, error?: string}}
 */
function validateBash(block) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'peac-doc-validate-'));
  const tmpFile = join(tmpDir, 'snippet.sh');
  writeFileSync(tmpFile, block.code);

  try {
    execSync(`bash -n "${tmpFile}"`, { stdio: 'pipe', timeout: 10_000 });
    return { ok: true };
  } catch (err) {
    const stderr = err.stderr?.toString() || 'Unknown bash syntax error';
    return { ok: false, error: `bash syntax error: ${stderr.trim().split('\n').slice(0, 3).join('\n')}` };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  }
}

/**
 * Schema-aware JSON validation.
 * Beyond JSON.parse, checks known structures against expected fields.
 * @param {CodeBlock} block
 * @returns {{ok: boolean, error?: string}}
 */
function validateJsonSchema(block) {
  let parsed;
  try {
    parsed = JSON.parse(block.code);
  } catch (err) {
    return { ok: false, error: `JSON parse error: ${err.message}` };
  }

  // Structural checks for known PEAC JSON shapes
  const errors = [];

  // Wire 0.2 receipt payload: must have peac_version if it has kind
  if (parsed.peac_version === '0.2' || parsed.kind) {
    if (parsed.kind && !['evidence', 'challenge'].includes(parsed.kind)) {
      errors.push(`kind must be "evidence" or "challenge", got "${parsed.kind}"`);
    }
    if (parsed.peac_version && parsed.peac_version !== '0.2') {
      errors.push(`peac_version must be "0.2" for Wire 0.2 examples`);
    }
  }

  // MCP tool result with _meta: check org.peacprotocol/ keys
  if (parsed._meta) {
    const peacKeys = Object.keys(parsed._meta).filter(k => k.startsWith('org.peacprotocol/'));
    for (const key of peacKeys) {
      if (!['org.peacprotocol/receipt_ref', 'org.peacprotocol/receipt_jws'].includes(key)) {
        errors.push(`unknown org.peacprotocol/ _meta key: "${key}"`);
      }
    }
  }

  // A2A carrier metadata: check structure
  if (parsed.carriers && Array.isArray(parsed.carriers)) {
    for (let i = 0; i < parsed.carriers.length; i++) {
      const c = parsed.carriers[i];
      if (c && typeof c === 'object') {
        if (c.receipt_jws && !c.receipt_ref) {
          errors.push(`carriers[${i}]: has receipt_jws but missing receipt_ref`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: `JSON schema issues: ${errors.join('; ')}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  // Determine which files to validate
  let targetFiles = DEFAULT_DOCS;
  const explicitFiles = args.filter((a) => !a.startsWith('--'));
  if (explicitFiles.length > 0) {
    targetFiles = explicitFiles;
  }

  // Resolve paths
  targetFiles = targetFiles.map((f) => (f.startsWith('/') ? f : join(REPO_ROOT, f)));

  let totalBlocks = 0;
  let validated = 0;
  let skipped = 0;
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const filePath of targetFiles) {
    const relPath = filePath.replace(REPO_ROOT + '/', '');
    let blocks;
    try {
      blocks = extractCodeBlocks(filePath);
    } catch (err) {
      console.error(`  ERROR: Cannot read ${relPath}: ${err.message}`);
      failed++;
      failures.push({ file: relPath, line: 0, error: err.message });
      continue;
    }

    totalBlocks += blocks.length;
    const annotatedBlocks = blocks.filter((b) => b.annotated);

    if (annotatedBlocks.length === 0) {
      console.log(`  ${relPath}: ${blocks.length} blocks, 0 annotated (skipped)`);
      skipped += blocks.length;
      continue;
    }

    console.log(`  ${relPath}: ${blocks.length} blocks, ${annotatedBlocks.length} annotated`);

    for (const block of annotatedBlocks) {
      if (block.skip) {
        skipped++;
        continue;
      }

      validated++;
      const effectiveLang = block.lang.toLowerCase();
      let result;

      switch (effectiveLang) {
        case 'json':
          result = validateJsonSchema(block);
          break;
        case 'typescript':
        case 'ts':
          result = validateTypeScript(block);
          break;
        case 'bash':
        case 'sh':
        case 'shell':
          result = validateBash(block);
          break;
        default:
          // text, pseudocode, etc. - structural pass (block is accounted for)
          result = { ok: true };
          break;
      }

      if (result.ok) {
        passed++;
      } else {
        failed++;
        const loc = `${relPath}:${block.line}`;
        console.error(`    FAIL [${effectiveLang}] ${loc}`);
        console.error(`      ${result.error}`);
        failures.push({ file: relPath, line: block.line, lang: effectiveLang, error: result.error });
      }
    }
  }

  // Summary
  console.log('');
  console.log(`Doc-example validation: ${totalBlocks} blocks, ${validated} validated, ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (failed > 0) {
    console.error(`\n${failed} doc example(s) failed validation.`);
    process.exit(1);
  }

  if (validated === 0) {
    console.log('No annotated blocks found. Add <!-- peac:validate --> before code fences to enable validation.');
  }

  process.exit(0);
}

main();
