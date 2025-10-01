#!/usr/bin/env node
/**
 * @peac/guards/ensure-pnpm
 * Hard guard: block npm/yarn usage, enforce PNPM-only
 */

const ua = process.env.npm_config_user_agent || '';
const isPNPM = ua.includes('pnpm/');

if (!isPNPM) {
  console.error(
    '❌ This repository is PNPM-only.\n' +
      'Detected user agent: ' +
      (ua || '(unknown)') +
      '\n\n' +
      'Fix: enable Corepack and use PNPM:\n' +
      '  corepack enable && corepack prepare pnpm@9.10.0 --activate\n' +
      '  pnpm install\n'
  );
  process.exit(1);
}

console.log('✓ Package manager check passed (pnpm)');
