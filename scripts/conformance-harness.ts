#!/usr/bin/env tsx
/**
 * Conformance harness CLI (DD-122)
 *
 * This script delegates to @peac/conformance-harness (packages/conformance-harness/).
 * Use the workspace package directly for proper dependency resolution:
 *
 *   pnpm --filter @peac/conformance-harness conformance -- --adapter core
 *
 * This wrapper exists for backward compatibility with existing CI and docs.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'packages', 'conformance-harness', 'src', 'cli.ts');

await import(cliPath);
