/**
 * CLI utilities and formatting
 */

import chalk from 'chalk';
import type { CommandResult } from './types.js';

export function formatOutput(result: CommandResult, json = false): string {
  if (json) {
    return JSON.stringify(result, null, 2);
  }

  if (!result.success) {
    return chalk.red(`Error: ${result.error}`);
  }

  // Format based on data type
  if (result.data && typeof result.data === 'object') {
    if (result.data.sources) {
      // Discovery result
      return formatDiscoveryResult(result.data);
    } else if (result.data.digest) {
      // Hash result
      return formatHashResult(result.data);
    } else if (result.data.valid !== undefined) {
      // Verify result
      return formatVerifyResult(result.data);
    }
  }

  return JSON.stringify(result.data, null, 2);
}

function formatDiscoveryResult(data: any): string {
  const lines = [`Discovery for: ${chalk.blue(data.url)}`, ''];

  for (const source of data.sources) {
    const status =
      source.status === 'found'
        ? chalk.green('[found]')
        : source.status === 'not_found'
          ? chalk.yellow('[not found]')
          : chalk.red('[error]');

    lines.push(`${status} ${source.type}: ${source.url}`);
    if (source.etag) {
      lines.push(`  ETag: ${source.etag}`);
    }
  }

  return lines.join('\\n');
}

function formatHashResult(data: any): string {
  return [
    `Algorithm: ${data.algorithm}`,
    `Format: ${data.format}`,
    `Digest: ${chalk.green(data.digest)}`,
    `Input size: ${data.input_size} bytes`,
  ].join('\\n');
}

function formatVerifyResult(data: any): string {
  if (data.valid) {
    const lines = [chalk.green('Receipt verified successfully'), ''];

    if (data.policy_hash) {
      lines.push(`Policy hash: ${data.policy_hash}`);
    }

    if (data.resource) {
      lines.push(`Resource: ${data.resource}`);
    }

    return lines.join('\\n');
  } else {
    return chalk.red(`Verification failed: ${data.error || 'Unknown error'}`);
  }
}

export function createExitHandler() {
  return (code: number) => {
    process.exit(code);
  };
}

export function handleError(error: Error): CommandResult {
  return {
    success: false,
    error: error.message,
  };
}

export function timing() {
  const started = Date.now();
  return {
    started,
    end: () => {
      const completed = Date.now();
      return {
        started,
        completed,
        duration: completed - started,
      };
    },
  };
}
