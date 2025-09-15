/**
 * peac verify <receipt.jws> --resource <url> command
 * Receipt verification using existing core functions
 */

import { readFile } from 'fs/promises';
import { verify, verifyDetached, canonicalPolicyHash } from '@peac/core';
import type { CLIOptions, CommandResult, VerifyResult } from '../types.js';
import { handleError, timing } from '../utils.js';

export interface VerifyOptions extends CLIOptions {
  resource?: string;
  keys?: string;
}

export class VerifyCommand {
  async execute(receiptPath: string, options: VerifyOptions = {}): Promise<CommandResult> {
    const timer = timing();

    try {
      const receiptContent = await readFile(receiptPath, 'utf-8');
      const receiptJws = receiptContent.trim();

      // Use the existing verify function from @peac/core
      const verifyResult = await verify(receiptJws, {
        resource: options.resource,
      });

      const result: VerifyResult = {
        valid: verifyResult.valid,
        receipt: verifyResult.claims
          ? {
              header: this.extractHeader(receiptJws),
              payload: verifyResult.claims,
            }
          : undefined,
      };

      if (options.resource) {
        result.resource = options.resource;

        if (verifyResult.claims?.policy_hash) {
          result.policy_hash = verifyResult.claims.policy_hash;
        }
      }

      if (!verifyResult.valid) {
        result.error = 'Receipt verification failed';
      }

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

  private extractHeader(jws: string): any {
    try {
      const parts = jws.split('.');
      if (parts.length === 3) {
        // Standard JWS format
        return JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      } else if (parts.length === 1 && jws.includes('..')) {
        // Detached format (payload..signature)
        const [payload, , signature] = jws.split('..');
        // For detached format, we don't have the protected header easily accessible
        return { typ: 'application/peac-receipt+jws', alg: 'EdDSA' };
      }
      return {};
    } catch {
      return {};
    }
  }
}
