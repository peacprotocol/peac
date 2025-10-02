#!/usr/bin/env node
/**
 * @peac/guards/ensure-pnpm
 * Hard guard: block npm/yarn usage, enforce PNPM-only
 */

const ua = process.env.npm_config_user_agent || '';

// In CI or when run directly via node, user agent may be empty
// Check if we're being run via pnpm by looking at the user agent OR
// if package manager is already validated (CI setup complete)
const isPNPM = ua.includes('pnpm/');
const isCISetup = process.env.CI && !ua; // CI with no user agent means pre-install check

if (!isPNPM && !isCISetup) {
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
