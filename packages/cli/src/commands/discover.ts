/**
 * peac discover <url> command
 * Thin wrapper around @peac/disc for peac.txt policy-document discovery.
 *
 * peac.txt is a policy-document surface per docs/specs/PEAC-TXT.md.
 * For cryptographic key discovery, callers should use
 * /.well-known/peac-issuer.json (see docs/specs/PEAC-ISSUER.md).
 */

import { discover } from '@peac/disc';
import type { CLIOptions, CommandResult } from '../types.js';
import { handleError, timing } from '../utils.js';

export class DiscoverCommand {
  async execute(url: string, options: CLIOptions = {}): Promise<CommandResult> {
    const timer = timing();

    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('URL must use http: or https: protocol');
      }

      const discoveryResult = await discover(url);

      const hints: string[] = [];
      if (discoveryResult?.warnings && discoveryResult.warnings.length > 0) {
        hints.push(
          'peac.txt is a policy-document surface (docs/specs/PEAC-TXT.md). ' +
            'For key discovery, use /.well-known/peac-issuer.json (docs/specs/PEAC-ISSUER.md).'
        );
      }

      return {
        success: true,
        data: hints.length > 0 ? { ...discoveryResult, hints } : discoveryResult,
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
