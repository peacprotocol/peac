#!/usr/bin/env node

/**
 * Generate docs/PACKAGE_STATUS.md and docs/SURFACE_STATUS.md
 * from REPO_SURFACE_STATUS.json.
 *
 * Usage: node scripts/generate-surface-status.mjs
 *        node scripts/generate-surface-status.mjs --check  (verify, no write)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const checkMode = process.argv.includes('--check');

const status = JSON.parse(readFileSync(resolve(root, 'REPO_SURFACE_STATUS.json'), 'utf8'));
const surfaces = status.surfaces;

// --- Generate docs/PACKAGE_STATUS.md ---

function generatePackageStatus() {
  const groups = {};
  for (const [path, info] of Object.entries(surfaces)) {
    const state = info.state;
    if (!groups[state]) groups[state] = [];
    groups[state].push({ path, ...info });
  }

  const lines = [
    '# Package and Surface Status',
    '',
    'Generated from `REPO_SURFACE_STATUS.json` by `scripts/generate-surface-status.mjs`.',
    'Do not edit manually.',
    '',
  ];

  // Default
  if (groups.default) {
    lines.push('## Default (current recommended path)', '');
    lines.push('| Package | npm | Wire | Layer |');
    lines.push('|---------|-----|------|-------|');
    for (const s of groups.default.sort((a, b) => Number(a.layer) - Number(b.layer))) {
      lines.push(`| \`${s.path}\` | ${s.npm ? `\`${s.npm}\`` : '-'} | ${s.wire} | ${s.layer} |`);
    }
    lines.push('');
  }

  // Supported
  if (groups.supported) {
    lines.push('## Supported (published, production-ready)', '');
    lines.push('| Package | npm | Wire | Layer |');
    lines.push('|---------|-----|------|-------|');
    for (const s of groups.supported.sort((a, b) => Number(a.layer) - Number(b.layer))) {
      lines.push(`| \`${s.path}\` | ${s.npm ? `\`${s.npm}\`` : '-'} | ${s.wire} | ${s.layer} |`);
    }
    lines.push('');
  }

  // Compat-only
  if (groups['compat-only']) {
    lines.push('## Compat-only (security/correctness fixes only)', '');
    lines.push('| Surface | Wire | Note |');
    lines.push('|---------|------|------|');
    for (const s of groups['compat-only']) {
      lines.push(`| \`${s.path}\` | ${s.wire} | ${s.note || ''} |`);
    }
    lines.push('');
  }

  // Deprecated
  if (groups.deprecated) {
    lines.push('## Deprecated (removal scheduled)', '');
    lines.push('| Package | npm | Removal | Note |');
    lines.push('|---------|-----|---------|------|');
    for (const s of groups.deprecated) {
      lines.push(`| \`${s.path}\` | ${s.npm ? `\`${s.npm}\`` : '-'} | ${s.removal || 'TBD'} | ${s.note || ''} |`);
    }
    lines.push('');
  }

  // Archived
  if (groups.archived) {
    lines.push('## Archived (non-default, may be removed)', '');
    lines.push('| Surface | Reason |');
    lines.push('|---------|--------|');
    for (const s of groups.archived) {
      lines.push(`| \`${s.path}\` | ${s.note || ''} |`);
    }
    lines.push('');
  }

  // Experimental
  if (groups.experimental) {
    lines.push('## Experimental (API may change)', '');
    lines.push('| Surface | Note |');
    lines.push('|---------|------|');
    for (const s of groups.experimental) {
      lines.push(`| \`${s.path}\` | ${s.note || ''} |`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

// --- Generate docs/SURFACE_STATUS.md ---

function generateSurfaceStatus() {
  const byLayer = {};
  for (const [path, info] of Object.entries(surfaces)) {
    const layer = String(info.layer);
    if (!byLayer[layer]) byLayer[layer] = [];
    byLayer[layer].push({ path, ...info });
  }

  const lines = [
    '# Surface Status by Layer',
    '',
    'Generated from `REPO_SURFACE_STATUS.json` by `scripts/generate-surface-status.mjs`.',
    'Do not edit manually.',
    '',
    `**Version:** ${status.version} | **Updated:** ${status.updated}`,
    '',
  ];

  const layerOrder = Object.keys(byLayer).sort((a, b) => {
    const na = parseFloat(a) || 999;
    const nb = parseFloat(b) || 999;
    return na - nb;
  });

  for (const layer of layerOrder) {
    lines.push(`## Layer ${layer}`, '');
    lines.push('| Surface | npm | State | Wire |');
    lines.push('|---------|-----|-------|------|');
    for (const s of byLayer[layer].sort((a, b) => a.path.localeCompare(b.path))) {
      lines.push(`| \`${s.path}\` | ${s.npm ? `\`${s.npm}\`` : '-'} | ${s.state} | ${s.wire} |`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

// --- Prettier formatting ---

async function formatMarkdown(content) {
  try {
    const prettier = await import('prettier');
    const config = await prettier.resolveConfig(resolve(root, 'docs/PACKAGE_STATUS.md'));
    return prettier.format(content, { ...config, parser: 'markdown' });
  } catch {
    // Prettier not available; return raw content
    return content;
  }
}

// --- Main ---

const packageStatusRaw = generatePackageStatus();
const surfaceStatusRaw = generateSurfaceStatus();

const packageStatusContent = await formatMarkdown(packageStatusRaw);
const surfaceStatusContent = await formatMarkdown(surfaceStatusRaw);

const packageStatusPath = resolve(root, 'docs/PACKAGE_STATUS.md');
const surfaceStatusPath = resolve(root, 'docs/SURFACE_STATUS.md');

if (checkMode) {
  let drift = false;
  try {
    const existing = readFileSync(packageStatusPath, 'utf8');
    if (existing !== packageStatusContent) {
      console.error('DRIFT: docs/PACKAGE_STATUS.md does not match REPO_SURFACE_STATUS.json');
      drift = true;
    }
  } catch {
    console.error('MISSING: docs/PACKAGE_STATUS.md');
    drift = true;
  }
  try {
    const existing = readFileSync(surfaceStatusPath, 'utf8');
    if (existing !== surfaceStatusContent) {
      console.error('DRIFT: docs/SURFACE_STATUS.md does not match REPO_SURFACE_STATUS.json');
      drift = true;
    }
  } catch {
    console.error('MISSING: docs/SURFACE_STATUS.md');
    drift = true;
  }
  if (drift) {
    console.error('Run: node scripts/generate-surface-status.mjs');
    process.exit(1);
  }
  console.log('OK: surface status docs match JSON source');
  process.exit(0);
}

writeFileSync(packageStatusPath, packageStatusContent);
writeFileSync(surfaceStatusPath, surfaceStatusContent);
console.log('Generated docs/PACKAGE_STATUS.md');
console.log('Generated docs/SURFACE_STATUS.md');
