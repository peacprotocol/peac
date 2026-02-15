#!/usr/bin/env node
/**
 * CLI entry point for peac-keygen.
 * Invoked via: npx @peac/adapter-openclaw keygen
 */

import { keygenCli } from './keygen.js';

keygenCli(process.argv.slice(2)).catch((err: Error) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exitCode = 1;
});
