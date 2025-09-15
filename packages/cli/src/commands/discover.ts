/**
 * peac discover <url> command
 * Lists AIPREF / agent-permissions / peac.txt sources using existing discovery functions
 */

import { discover } from '@peac/disc';
import type { CLIOptions, CommandResult, DiscoverResult } from '../types.js';
import { handleError, timing } from '../utils.js';

export class DiscoverCommand {
  async execute(url: string, options: CLIOptions = {}): Promise<CommandResult> {
    const timer = timing();

    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('URL must use http: or https: protocol');
      }

      const result: DiscoverResult = {
        url,
        sources: [],
      };

      // Use existing peac.txt discovery function
      const peacResult = await discover(url);
      result.sources.push({
        type: 'peac.txt',
        url: new URL('/.well-known/peac.txt', url).toString(),
        status: peacResult.valid ? 'found' : 'not_found',
        content: peacResult.valid ? peacResult.data : undefined,
      });

      // Check for AIPREF headers
      await this.checkAIPREF(parsedUrl, result, options);

      // Check for agent-permissions
      await this.checkAgentPermissions(parsedUrl, result, options);

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

  private async checkAIPREF(url: URL, result: DiscoverResult, options: CLIOptions) {
    try {
      const response = await this.fetchWithTimeout(url.toString(), {
        method: 'HEAD',
        timeout: options.timeout || 5000,
      });

      const contentUsage = response.headers.get('content-usage');
      const aiprefUrl = response.headers.get('x-aipref-url');

      if (contentUsage || aiprefUrl) {
        result.sources.push({
          type: 'aipref',
          url: aiprefUrl || url.toString(),
          status: 'found',
          etag: response.headers.get('etag') || undefined,
        });
      } else {
        result.sources.push({
          type: 'aipref',
          url: url.toString(),
          status: 'not_found',
        });
      }
    } catch (error) {
      result.sources.push({
        type: 'aipref',
        url: url.toString(),
        status: 'error',
      });
    }
  }

  private async checkAgentPermissions(url: URL, result: DiscoverResult, options: CLIOptions) {
    try {
      const response = await this.fetchWithTimeout(url.toString(), {
        timeout: options.timeout || 5000,
      });

      const html = await response.text();
      const linkMatch = html.match(
        /<link[^>]*rel=["']agent-permissions["'][^>]*href=["']([^"']+)["']/i
      );

      if (linkMatch) {
        const href = linkMatch[1];
        const absoluteUrl = new URL(href, url).toString();

        result.sources.push({
          type: 'agent-permissions',
          url: absoluteUrl,
          status: 'found',
          etag: response.headers.get('etag') || undefined,
        });
      } else {
        result.sources.push({
          type: 'agent-permissions',
          url: url.toString(),
          status: 'not_found',
        });
      }
    } catch (error) {
      result.sources.push({
        type: 'agent-permissions',
        url: url.toString(),
        status: 'error',
      });
    }
  }

  private async fetchWithTimeout(url: string, options: { method?: string; timeout?: number } = {}) {
    const controller = new AbortController();
    const timeout = options.timeout || 5000;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'PEAC-CLI/0.9.13.1',
        },
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
