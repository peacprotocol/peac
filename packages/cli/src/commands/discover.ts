/**
 * peac discover <url> command
 *
 * Performs SSRF-aware retrieval of /.well-known/peac.txt and parses it as a
 * peac-policy/0.1 policy document. Implementation lives in the CLI-internal
 * helper at ../lib/policy-document-discovery.ts (not a public surface).
 *
 * peac.txt is a policy-document surface per docs/specs/PEAC-TXT.md. For
 * cryptographic key discovery, callers should use
 * /.well-known/peac-issuer.json (see docs/specs/PEAC-ISSUER.md).
 */

import {
  fetchPolicyDocumentText,
  parsePolicyDocumentCompat,
  type CompatParseResult,
} from '../lib/policy-document-discovery.js';
import type { CLIOptions, CommandResult } from '../types.js';
import { handleError, timing } from '../utils.js';

interface DiscoverData extends CompatParseResult {
  hints?: string[];
}

export class DiscoverCommand {
  async execute(url: string, _options: CLIOptions = {}): Promise<CommandResult> {
    const timer = timing();

    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('URL must use http: or https: protocol');
      }

      const fetched = await fetchPolicyDocumentText(url);
      if (!fetched.ok) {
        return {
          success: false,
          error: fetched.error,
          timing: timer.end(),
        };
      }

      const parsed = parsePolicyDocumentCompat(fetched.text);
      const data: DiscoverData = { ...parsed };
      if (fetched.warnings && fetched.warnings.length > 0) {
        data.warnings = [...(parsed.warnings ?? []), ...fetched.warnings];
      }
      if (data.warnings && data.warnings.length > 0) {
        data.hints = [
          'peac.txt is a policy-document surface (docs/specs/PEAC-TXT.md). ' +
            'For key discovery, use /.well-known/peac-issuer.json (docs/specs/PEAC-ISSUER.md).',
        ];
      }

      return {
        success: true,
        data,
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
