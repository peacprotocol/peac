#!/usr/bin/env node
/**
 * find-invisible-unicode.mjs
 *
 * Scans files for invisible/dangerous Unicode characters that GitHub warns about.
 *
 * Usage:
 *   node scripts/find-invisible-unicode.mjs <file1> <file2> ...
 *   git diff --name-only origin/main...HEAD | node scripts/find-invisible-unicode.mjs --stdin
 */

import { readFileSync } from 'fs';
import { createInterface } from 'readline';

// Characters to detect (matching GitHub's detector)
const DANGEROUS_CODEPOINTS = {
  // Bidirectional controls (Trojan Source)
  0x202A: 'LEFT-TO-RIGHT EMBEDDING',
  0x202B: 'RIGHT-TO-LEFT EMBEDDING',
  0x202C: 'POP DIRECTIONAL FORMATTING',
  0x202D: 'LEFT-TO-RIGHT OVERRIDE',
  0x202E: 'RIGHT-TO-LEFT OVERRIDE',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',

  // Direction marks
  0x200E: 'LEFT-TO-RIGHT MARK',
  0x200F: 'RIGHT-TO-LEFT MARK',
  0x061C: 'ARABIC LETTER MARK',

  // Zero-width characters
  0x200B: 'ZERO WIDTH SPACE',
  0x200C: 'ZERO WIDTH NON-JOINER',
  0x200D: 'ZERO WIDTH JOINER',

  // BOM
  0xFEFF: 'BYTE ORDER MARK',

  // Other format characters that can be problematic
  0x00AD: 'SOFT HYPHEN',
  0x034F: 'COMBINING GRAPHEME JOINER',
  0x115F: 'HANGUL CHOSEONG FILLER',
  0x1160: 'HANGUL JUNGSEONG FILLER',
  0x17B4: 'KHMER VOWEL INHERENT AQ',
  0x17B5: 'KHMER VOWEL INHERENT AA',
  0x180B: 'MONGOLIAN FREE VARIATION SELECTOR ONE',
  0x180C: 'MONGOLIAN FREE VARIATION SELECTOR TWO',
  0x180D: 'MONGOLIAN FREE VARIATION SELECTOR THREE',
  0x180E: 'MONGOLIAN VOWEL SEPARATOR',
  0x2060: 'WORD JOINER',
  0x2061: 'FUNCTION APPLICATION',
  0x2062: 'INVISIBLE TIMES',
  0x2063: 'INVISIBLE SEPARATOR',
  0x2064: 'INVISIBLE PLUS',
  0xFE00: 'VARIATION SELECTOR-1',
  0xFE01: 'VARIATION SELECTOR-2',
  0xFE02: 'VARIATION SELECTOR-3',
  0xFE03: 'VARIATION SELECTOR-4',
  0xFE04: 'VARIATION SELECTOR-5',
  0xFE05: 'VARIATION SELECTOR-6',
  0xFE06: 'VARIATION SELECTOR-7',
  0xFE07: 'VARIATION SELECTOR-8',
  0xFE08: 'VARIATION SELECTOR-9',
  0xFE09: 'VARIATION SELECTOR-10',
  0xFE0A: 'VARIATION SELECTOR-11',
  0xFE0B: 'VARIATION SELECTOR-12',
  0xFE0C: 'VARIATION SELECTOR-13',
  0xFE0D: 'VARIATION SELECTOR-14',
  0xFE0E: 'VARIATION SELECTOR-15',
  0xFE0F: 'VARIATION SELECTOR-16',
  0xFFF9: 'INTERLINEAR ANNOTATION ANCHOR',
  0xFFFA: 'INTERLINEAR ANNOTATION SEPARATOR',
  0xFFFB: 'INTERLINEAR ANNOTATION TERMINATOR',
};

// Build regex from codepoints
const codepointPattern = Object.keys(DANGEROUS_CODEPOINTS)
  .map(cp => `\\u{${Number(cp).toString(16).padStart(4, '0')}}`)
  .join('|');
const dangerousRegex = new RegExp(`(${codepointPattern})`, 'gu');

function escapeForDisplay(str) {
  return str
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function scanFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    // Skip files that can't be read (binary, missing, etc.)
    return [];
  }

  const findings = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let match;

    // Reset regex state
    dangerousRegex.lastIndex = 0;

    while ((match = dangerousRegex.exec(line)) !== null) {
      const char = match[0];
      const codepoint = char.codePointAt(0);
      const col = match.index + 1;

      // Get context (10 chars before and after)
      const contextStart = Math.max(0, match.index - 10);
      const contextEnd = Math.min(line.length, match.index + 11);
      const context = line.slice(contextStart, contextEnd);

      findings.push({
        file: filePath,
        line: lineNum + 1,
        col,
        codepoint: `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`,
        name: DANGEROUS_CODEPOINTS[codepoint] || 'UNKNOWN',
        context: escapeForDisplay(context),
      });
    }
  }

  return findings;
}

async function main() {
  const args = process.argv.slice(2);
  let files = [];

  if (args.includes('--stdin')) {
    // Read file list from stdin
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        files.push(trimmed);
      }
    }
  } else if (args.length > 0) {
    files = args.filter(f => !f.startsWith('-'));
  } else {
    console.error('Usage:');
    console.error('  node scripts/find-invisible-unicode.mjs <file1> <file2> ...');
    console.error('  git diff --name-only origin/main...HEAD | node scripts/find-invisible-unicode.mjs --stdin');
    process.exit(1);
  }

  // Filter to text files only (skip binaries, images, etc.)
  const textExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yaml', '.yml', '.txt', '.sh', '.html', '.css'];
  const textFiles = files.filter(f => {
    const ext = f.slice(f.lastIndexOf('.'));
    return textExtensions.includes(ext) || !f.includes('.');
  });

  let totalFindings = 0;

  for (const file of textFiles) {
    const findings = scanFile(file);
    for (const f of findings) {
      console.log(`${f.file}:${f.line}:${f.col} ${f.codepoint} ${f.name} ...${f.context}...`);
      totalFindings++;
    }
  }

  if (totalFindings > 0) {
    console.error(`\nFound ${totalFindings} dangerous Unicode character(s)`);
    process.exit(1);
  } else {
    console.log('No dangerous Unicode characters found');
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
