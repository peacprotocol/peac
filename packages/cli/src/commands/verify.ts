/**
 * peac verify <receipt.jws> --resource <url> command
 * Receipt verification via API bridge
 */

import { readFile } from 'fs/promises';
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

      const base = process.env.PEAC_BRIDGE_URL?.trim() || 'http://127.0.0.1:3000';
      const url = new URL('/verify', base).toString();

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receipt: receiptJws, resource: options.resource }),
      });

      const body = await res.json().catch(() => ({}));
      const ok = res.ok && body?.valid === true;

      const result: VerifyResult = {
        valid: ok,
        receipt: body?.claims ? { header: undefined, payload: body.claims } : undefined,
        resource: options.resource,
        policy_hash: body?.policyHash,
        reconstructed: body?.reconstructed,
      };

      if (!ok) {
        result.error = body?.detail || body?.title || 'Receipt verification failed';
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
}
