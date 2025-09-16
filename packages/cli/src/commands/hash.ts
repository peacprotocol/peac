/**
 * peac hash <policy.json> command
 * Canonical digest computation using JCS
 */

import { readFile } from 'fs/promises';
import type { CLIOptions, CommandResult, HashResult } from '../types.js';
import { handleError, timing } from '../utils.js';

export class HashCommand {
  async execute(policyPath: string, options: CLIOptions = {}): Promise<CommandResult> {
    const timer = timing();

    try {
      // Read and parse policy file
      const policyContent = await readFile(policyPath, 'utf-8');
      const policy = JSON.parse(policyContent);

      // Compute canonical hash using dynamic import
      const { canonicalPolicyHash } = await import('@peac/core');
      const digest = await canonicalPolicyHash(policy);

      const result: HashResult = {
        algorithm: 'SHA-256',
        format: 'JCS',
        digest,
        input_size: Buffer.byteLength(policyContent, 'utf-8'),
      };

      return {
        success: true,
        data: result,
        timing: timer.end(),
      };
    } catch (error) {
      return {
        ...handleError(error as Error),
        timing: timer.end(),
      };
    }
  }

  async executeFromStdin(options: CLIOptions = {}): Promise<CommandResult> {
    const timer = timing();

    try {
      // Read from stdin
      const chunks: Uint8Array[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }

      const policyContent = Buffer.concat(chunks).toString('utf-8');
      const policy = JSON.parse(policyContent);

      // Compute canonical hash using dynamic import
      const { canonicalPolicyHash } = await import('@peac/core');
      const digest = await canonicalPolicyHash(policy);

      const result: HashResult = {
        algorithm: 'SHA-256',
        format: 'JCS',
        digest,
        input_size: Buffer.byteLength(policyContent, 'utf-8'),
      };

      return {
        success: true,
        data: result,
        timing: timer.end(),
      };
    } catch (error) {
      return {
        ...handleError(error as Error),
        timing: timer.end(),
      };
    }
  }
}
