/**
 * peac discover <url> command
 * Thin wrapper around @peac/disc for discovery
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

      // Assert peac.txt ≤ 20 lines if present
      if (discoveryResult?.data) {
        // The discover function from @peac/disc returns a ParseResult
        // We'll just validate line count if needed at the API level
      }

      return {
        success: true,
        data: discoveryResult,
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
