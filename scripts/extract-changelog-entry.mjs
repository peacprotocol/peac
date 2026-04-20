#!/usr/bin/env node
/**
 * Extract a single release entry from CHANGELOG.md.
 *
 * Keep a Changelog format:
 *
 *   ## [X.Y.Z] - YYYY-MM-DD
 *
 *   <body>
 *
 *   ## [prev] - ...
 *
 * The body runs from the line after the matching header to the line
 * before the next top-level release header (## [...]) or the end of the
 * file, trimmed of leading and trailing blank lines.
 *
 * Usage:
 *   node scripts/extract-changelog-entry.mjs --version 0.12.13
 *   node scripts/extract-changelog-entry.mjs --version 0.12.13 --file CHANGELOG.md
 *   node scripts/extract-changelog-entry.mjs --version 0.12.13 --title-only
 *   node scripts/extract-changelog-entry.mjs --version 0.12.13 --title-only --theme "Theme text"
 *
 * Output:
 *   Default: release body to stdout (suitable for `gh release create --notes-file`).
 *   --title-only:
 *     - If `--theme "<text>"` is supplied, prints `v<version> - <text>`.
 *     - Otherwise, tries to derive a short theme from the first prose line
 *       of the matching release body (up to the first sentence boundary,
 *       trimmed to the title-theme cap). If a theme is derivable, prints
 *       `v<version> - <theme>`; otherwise prints `v<version>`.
 *
 * Exit codes:
 *   0  entry found and printed
 *   1  entry not found for the requested version
 *   2  usage error or file-read error
 */

// Title-theme derivation rules:
//   - The theme candidate is the first non-blank line of the release body
//     that is neither a heading nor a list or table row.
//   - The candidate is trimmed to the first sentence boundary
//     (period, exclamation, or question mark) and truncated to 80 chars.
//   - If the trimmed candidate is shorter than 8 chars, no theme is used.
const TITLE_THEME_MAX_CHARS = 80;
const TITLE_THEME_MIN_CHARS = 8;

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
let version = null;
let file = resolve(REPO_ROOT, 'CHANGELOG.md');
let titleOnly = false;
let themeOverride = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--') continue;
  if (a === '--version' && args[i + 1]) {
    version = args[i + 1];
    i += 1;
  } else if (a === '--file' && args[i + 1]) {
    file = resolve(args[i + 1]);
    i += 1;
  } else if (a === '--theme' && args[i + 1]) {
    themeOverride = args[i + 1];
    i += 1;
  } else if (a === '--title-only') {
    titleOnly = true;
  } else {
    process.stderr.write(`unknown argument: ${a}\n`);
    process.exit(2);
  }
}

if (!version) {
  process.stderr.write(
    'usage: extract-changelog-entry.mjs --version <X.Y.Z> [--file CHANGELOG.md] [--title-only]\n'
  );
  process.exit(2);
}

if (!existsSync(file)) {
  process.stderr.write(`file not found: ${file}\n`);
  process.exit(2);
}

const lines = readFileSync(file, 'utf8').split('\n');

// Release header regex: `## [X.Y.Z] - YYYY-MM-DD` or `## [X.Y.Z]`.
// The version token must match exactly inside the square brackets.
const RELEASE_HEADER = /^##\s*\[([^\]]+)\](?:\s*-\s*(.+))?\s*$/;

let startIdx = -1;
let endIdx = lines.length;

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(RELEASE_HEADER);
  if (!m) continue;
  if (startIdx === -1 && m[1] === version) {
    startIdx = i;
    continue;
  }
  if (startIdx !== -1) {
    endIdx = i;
    break;
  }
}

if (startIdx === -1) {
  process.stderr.write(`release entry not found for version ${version} in ${file}\n`);
  process.exit(1);
}

// Body runs from startIdx+1 up to endIdx-1, trimmed.
const bodyLines = lines.slice(startIdx + 1, endIdx);
let bStart = 0;
let bEnd = bodyLines.length;
while (bStart < bEnd && bodyLines[bStart].trim() === '') bStart += 1;
while (bEnd > bStart && bodyLines[bEnd - 1].trim() === '') bEnd -= 1;
const trimmedBody = bodyLines.slice(bStart, bEnd);

function deriveTheme(body) {
  for (const raw of body) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('-') || line.startsWith('*') || line.startsWith('|')) continue;
    if (line.startsWith('>')) continue;
    // Take up to the first sentence boundary, keeping punctuation out.
    const match = line.match(/^([^.!?]+)[.!?]?/);
    if (!match) continue;
    const candidate = match[1].trim();
    if (candidate.length < TITLE_THEME_MIN_CHARS) continue;
    return candidate.length > TITLE_THEME_MAX_CHARS
      ? candidate.slice(0, TITLE_THEME_MAX_CHARS).trimEnd()
      : candidate;
  }
  return null;
}

if (titleOnly) {
  const theme = themeOverride || deriveTheme(trimmedBody);
  if (theme) {
    process.stdout.write(`v${version} - ${theme}\n`);
  } else {
    process.stdout.write(`v${version}\n`);
  }
  process.exit(0);
}

process.stdout.write(trimmedBody.join('\n') + '\n');
process.exit(0);
