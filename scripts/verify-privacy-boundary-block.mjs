#!/usr/bin/env node
/**
 * verify-privacy-boundary-block.mjs
 *
 * Privacy-doc boundary-block lint. Every `docs/privacy/*.md` that is
 * not the index README must lead with a boundary-first framing block
 * containing three sections:
 *
 *   - What PEAC does
 *   - What PEAC does not do
 *   - What deployers / controllers / processors (above PEAC) still own
 *
 * The headings can be H2 (## What PEAC does), H3 (### ...), bold
 * labels (**What PEAC does**), or plain ALL-CAPS labels. The check
 * is intentionally permissive about heading style but strict about
 * presence and order: all three must appear in the top ~60 lines,
 * and "does" must appear before "does not do", which must appear
 * before the "still own" clause.
 *
 * Exit codes:
 *   0 - clean (or no privacy docs present)
 *   1 - one or more docs fail the check
 *   2 - script error
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const PRIVACY_DIR = join(REPO_ROOT, 'docs', 'privacy');

if (!existsSync(PRIVACY_DIR)) {
  console.log('verify-privacy-boundary-block: docs/privacy/ not present; skipping.');
  process.exit(0);
}

const files = readdirSync(PRIVACY_DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => join(PRIVACY_DIR, f))
  .sort();

if (files.length === 0) {
  console.log('verify-privacy-boundary-block: no docs/privacy/*.md bodies to check.');
  process.exit(0);
}

const DOES = /what\s+peac\s+does\b/i;
const DOES_NOT = /what\s+peac\s+does\s+not\s+do\b/i;
const STILL_OWN = /what\s+deployers.*still\s+own\b/i;

/**
 * Substance check (in addition to heading presence): every privacy
 * doc must explicitly state somewhere in its body that one of
 * lawful basis / legal review / controller obligations / DPIA
 * decisions / lawful-basis decisions / DPA negotiation remains
 * operator- (or controller- / processor- / deployer-) owned. The
 * regex is permissive about phrasing but strict that one of the
 * load-bearing words must appear in a sentence that names the
 * owning party.
 */
const OPERATOR_OWNS = new RegExp(
  String.raw`(operator|controller|processor|deployer)[^.\n]{0,200}\b(lawful\s*basis|legal\s+review|controller\s+obligation|dpia|dpa|lawful-basis|controller-obligation)\b` +
    String.raw`|` +
    String.raw`\b(lawful\s*basis|legal\s+review|controller\s+obligation|dpia|controller\s+responsibilit)[^.\n]{0,200}(operator|controller|processor|deployer)\b`,
  'i'
);

let failed = 0;
for (const path of files) {
  const text = readFileSync(path, 'utf8');
  const head = text.split('\n').slice(0, 80).join('\n');

  const doesIdx = head.search(DOES);
  const doesNotIdx = head.search(DOES_NOT);
  const stillOwnIdx = head.search(STILL_OWN);

  const missing = [];
  if (doesIdx < 0) missing.push('"What PEAC does"');
  if (doesNotIdx < 0) missing.push('"What PEAC does not do"');
  if (stillOwnIdx < 0) missing.push('"What deployers ... still own"');

  if (missing.length > 0) {
    console.error(`FAIL ${basename(path)}: missing boundary heading(s): ${missing.join(', ')}`);
    failed++;
    continue;
  }

  // Enforce order. The "does not do" match also satisfies the "does"
  // regex, so we require the first "does" occurrence to precede the
  // "does not do" occurrence and be at a different position.
  const firstDoes = head.search(DOES);
  const firstDoesNot = head.search(DOES_NOT);
  if (firstDoes >= firstDoesNot || firstDoesNot >= stillOwnIdx) {
    console.error(
      `FAIL ${basename(path)}: boundary headings must appear in order (does -> does not do -> deployers ... still own)`
    );
    failed++;
    continue;
  }

  // Substance check: somewhere in the doc body the operator
  // ownership of lawful basis / legal review / DPIA / DPA /
  // controller obligations must be stated explicitly. Collapse
  // markdown soft-wrap newlines into single spaces so the regex
  // does not need to model wrapped sentences explicitly. Paragraph
  // breaks (blank lines) and code-block boundaries become spaces
  // too; this is intentional and matches the rendered prose.
  const flattened = text.replace(/\s+/g, ' ');
  if (!OPERATOR_OWNS.test(flattened)) {
    console.error(
      `FAIL ${basename(path)}: must explicitly state that operator/controller/processor/deployer owns at least one of {lawful basis, legal review, controller obligations, DPIA, DPA}.`
    );
    failed++;
    continue;
  }

  console.log(`ok   ${basename(path)}`);
}

if (failed > 0) {
  console.error(`\nverify-privacy-boundary-block: ${failed} file(s) failed.`);
  process.exit(1);
}

console.log(`\nverify-privacy-boundary-block: clean (${files.length} file(s)).`);
process.exit(0);
