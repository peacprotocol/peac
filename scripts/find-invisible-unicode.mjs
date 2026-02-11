#!/usr/bin/env node
/**
 * find-invisible-unicode.mjs
 *
 * Scans files for invisible/dangerous Unicode characters that GitHub warns about.
 * Optionally fixes them with --fix mode.
 *
 * Usage:
 *   node scripts/find-invisible-unicode.mjs <file1> <file2> ...
 *   node scripts/find-invisible-unicode.mjs --fix <file1> <file2> ...
 *   git ls-files -- '*.ts' '*.md' | node scripts/find-invisible-unicode.mjs --stdin
 *   git ls-files -- '*.ts' '*.md' | node scripts/find-invisible-unicode.mjs --stdin --fix
 */

import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';

// Characters to detect and fix
const DANGEROUS_CODEPOINTS = {
  // Bidirectional controls (Trojan Source) - REMOVE
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',

  // Direction marks - REMOVE
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x061c: 'ARABIC LETTER MARK',

  // Zero-width characters - REMOVE
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x2060: 'WORD JOINER',
  0xfeff: 'BYTE ORDER MARK',

  // NBSP variants - REPLACE WITH SPACE
  0x00a0: 'NO-BREAK SPACE',
  0x202f: 'NARROW NO-BREAK SPACE',

  // Soft hyphen - REMOVE
  0x00ad: 'SOFT HYPHEN',

  // Other invisible format characters - REMOVE
  0x034f: 'COMBINING GRAPHEME JOINER',
  0x115f: 'HANGUL CHOSEONG FILLER',
  0x1160: 'HANGUL JUNGSEONG FILLER',
  0x17b4: 'KHMER VOWEL INHERENT AQ',
  0x17b5: 'KHMER VOWEL INHERENT AA',
  0x180b: 'MONGOLIAN FREE VARIATION SELECTOR ONE',
  0x180c: 'MONGOLIAN FREE VARIATION SELECTOR TWO',
  0x180d: 'MONGOLIAN FREE VARIATION SELECTOR THREE',
  0x180e: 'MONGOLIAN VOWEL SEPARATOR',
  0x2061: 'FUNCTION APPLICATION',
  0x2062: 'INVISIBLE TIMES',
  0x2063: 'INVISIBLE SEPARATOR',
  0x2064: 'INVISIBLE PLUS',
  0xfe00: 'VARIATION SELECTOR-1',
  0xfe01: 'VARIATION SELECTOR-2',
  0xfe02: 'VARIATION SELECTOR-3',
  0xfe03: 'VARIATION SELECTOR-4',
  0xfe04: 'VARIATION SELECTOR-5',
  0xfe05: 'VARIATION SELECTOR-6',
  0xfe06: 'VARIATION SELECTOR-7',
  0xfe07: 'VARIATION SELECTOR-8',
  0xfe08: 'VARIATION SELECTOR-9',
  0xfe09: 'VARIATION SELECTOR-10',
  0xfe0a: 'VARIATION SELECTOR-11',
  0xfe0b: 'VARIATION SELECTOR-12',
  0xfe0c: 'VARIATION SELECTOR-13',
  0xfe0d: 'VARIATION SELECTOR-14',
  0xfe0e: 'VARIATION SELECTOR-15',
  0xfe0f: 'VARIATION SELECTOR-16',
  0xfff9: 'INTERLINEAR ANNOTATION ANCHOR',
  0xfffa: 'INTERLINEAR ANNOTATION SEPARATOR',
  0xfffb: 'INTERLINEAR ANNOTATION TERMINATOR',
};

// Characters that should be replaced with a regular space
const NBSP_CODEPOINTS = new Set([0x00a0, 0x202f]);

// Build regex from codepoints
const codepointPattern = Object.keys(DANGEROUS_CODEPOINTS)
  .map((cp) => `\\u{${Number(cp).toString(16).padStart(4, '0')}}`)
  .join('|');
const dangerousRegex = new RegExp(`(${codepointPattern})`, 'gu');

function escapeForDisplay(str) {
  return str.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

function scanFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    // Skip files that can't be read (binary, missing, etc.)
    return { findings: [], content: null };
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
        isNbsp: NBSP_CODEPOINTS.has(codepoint),
      });
    }
  }

  return { findings, content };
}

function fixContent(content) {
  let fixed = content;

  // Strip BOM at start of file
  if (fixed.charCodeAt(0) === 0xfeff) {
    fixed = fixed.slice(1);
  }

  // Replace NBSP variants with regular space
  fixed = fixed.replace(/[\u00A0\u202F]/g, ' ');

  // Remove all other dangerous characters
  fixed = fixed.replace(dangerousRegex, (match) => {
    const cp = match.codePointAt(0);
    // NBSP already handled above, skip here
    if (NBSP_CODEPOINTS.has(cp)) {
      return ' ';
    }
    return '';
  });

  return fixed;
}

async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes('--fix');
  const stdinMode = args.includes('--stdin');

  let files = [];

  if (stdinMode) {
    // Read file list from stdin
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        files.push(trimmed);
      }
    }
  } else {
    files = args.filter((f) => !f.startsWith('-'));
  }

  if (files.length === 0 && !stdinMode) {
    console.error('Usage:');
    console.error('  node scripts/find-invisible-unicode.mjs <file1> <file2> ...');
    console.error('  node scripts/find-invisible-unicode.mjs --fix <file1> <file2> ...');
    console.error(
      "  git ls-files -- '*.ts' '*.md' | node scripts/find-invisible-unicode.mjs --stdin"
    );
    console.error(
      "  git ls-files -- '*.ts' '*.md' | node scripts/find-invisible-unicode.mjs --stdin --fix"
    );
    process.exit(1);
  }

  // Filter to text files only (skip binaries, images, etc.)
  const textExtensions = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.md',
    '.yaml',
    '.yml',
    '.txt',
    '.sh',
    '.html',
    '.css',
  ];
  const textFiles = files.filter((f) => {
    const ext = f.slice(f.lastIndexOf('.'));
    return textExtensions.includes(ext) || !f.includes('.');
  });

  let totalFindings = 0;
  let filesFixed = 0;

  for (const file of textFiles) {
    const { findings, content } = scanFile(file);

    if (findings.length > 0) {
      for (const f of findings) {
        console.log(`${f.file}:${f.line}:${f.col} ${f.codepoint} ${f.name} ...${f.context}...`);
        totalFindings++;
      }

      if (fixMode && content !== null) {
        const fixed = fixContent(content);
        if (fixed !== content) {
          writeFileSync(file, fixed, 'utf-8');
          console.log(`  -> Fixed: ${file}`);
          filesFixed++;
        }
      }
    }
  }

  if (totalFindings > 0) {
    if (fixMode) {
      console.error(`\nFound ${totalFindings} dangerous Unicode character(s) in ${filesFixed} file(s) - FIXED`);
      process.exit(0);
    } else {
      console.error(`\nFound ${totalFindings} dangerous Unicode character(s)`);
      console.error('Run with --fix to automatically clean them');
      process.exit(1);
    }
  } else {
    console.log('No dangerous Unicode characters found');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
