/**
 * @peac/pref/resolver - AIPREF policy resolver with strict merge order
 * Priority: request headers > AIPREF JSON > peac.txt > robots.txt > defaults
 */

import { fetchRobots, parseRobots, robotsToAIPref } from './robots';
import type { AIPrefPolicy, AIPrefSnapshot, ResolveContext, PrefSource } from './types';

export class PrefResolver {
  private sources: PrefSource[] = [];
  private defaults: AIPrefSnapshot = {
    crawl: true,
    'train-ai': true,
    commercial: false,
  };

  constructor() {
    this.registerSources();
  }

  private registerSources() {
    // Priority 1: Request headers (handled separately)

    // Priority 2: AIPREF JSON
    this.sources.push({
      priority: 2,
      name: 'aipref',
      fetch: this.fetchAIPrefJson.bind(this),
    });

    // Priority 3: peac.txt hints
    this.sources.push({
      priority: 3,
      name: 'peac',
      fetch: this.fetchPeacTxt.bind(this),
    });

    // Priority 4: robots.txt
    this.sources.push({
      priority: 4,
      name: 'robots',
      fetch: this.fetchRobotsTxt.bind(this),
    });
  }

  async resolve(ctx: ResolveContext): Promise<AIPrefPolicy> {
    try {
      // Priority 1: Check request headers first
      const headerPrefs = this.parseHeaders(ctx.headers);
      if (headerPrefs) {
        return {
          status: 'active',
          checked_at: new Date().toISOString(),
          snapshot: headerPrefs,
          digest: await this.computeDigest(headerPrefs),
          source: 'header',
        };
      }

      // Priority 2-4: Fetch from sources in priority order
      for (const source of this.sources) {
        try {
          const snapshot = await source.fetch(ctx.uri);
          if (snapshot) {
            return {
              status: 'active',
              checked_at: new Date().toISOString(),
              snapshot,
              digest: await this.computeDigest(snapshot),
              source: source.name as any,
            };
          }
        } catch (error) {
          console.warn(`AIPREF source ${source.name} failed:`, error);
        }
      }

      // Priority 5: Use defaults
      return {
        status: 'not_found',
        checked_at: new Date().toISOString(),
        snapshot: this.defaults,
        digest: await this.computeDigest(this.defaults),
        source: 'default',
        reason: 'No AIPREF policy found, using defaults',
      };
    } catch (error) {
      return {
        status: 'error',
        checked_at: new Date().toISOString(),
        reason: `AIPREF resolution failed: ${error instanceof Error ? error.message : String(error)}`,
        source: 'default',
      };
    }
  }

  private parseHeaders(headers?: Record<string, string>): AIPrefSnapshot | null {
    if (!headers) return null;

    const contentUsage = headers['content-usage'] || headers['Content-Usage'];
    if (!contentUsage) return null;

    const snapshot: AIPrefSnapshot = {};
    const directives = contentUsage.split(',').map((d) => d.trim().toLowerCase());

    for (const directive of directives) {
      switch (directive) {
        case 'no-train':
          snapshot['train-ai'] = false;
          break;
        case 'no-crawl':
          snapshot.crawl = false;
          break;
        case 'no-commercial':
          snapshot.commercial = false;
          break;
        case 'train-ok':
          snapshot['train-ai'] = true;
          break;
        case 'crawl-ok':
          snapshot.crawl = true;
          break;
        case 'commercial-ok':
          snapshot.commercial = true;
          break;
      }
    }

    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  private async fetchAIPrefJson(uri: string): Promise<AIPrefSnapshot | null> {
    try {
      // First discover AIPREF URL from peac.txt
      const peacUrl = new URL('/.well-known/peac.txt', new URL(uri).origin);
      const peacResponse = await fetch(peacUrl.toString());
      if (!peacResponse.ok) return null;

      const peacContent = await peacResponse.text();
      const aiprefMatch = peacContent.match(/^preferences:\s*(.+)$/m);
      if (!aiprefMatch) return null;

      const aiprefUrl = aiprefMatch[1].trim();
      const aiprefResponse = await fetch(aiprefUrl);
      if (!aiprefResponse.ok) return null;

      const aiprefData = await aiprefResponse.json();
      return this.normalizeSnapshot(aiprefData);
    } catch {
      return null;
    }
  }

  private async fetchPeacTxt(uri: string): Promise<AIPrefSnapshot | null> {
    try {
      const peacUrl = new URL('/.well-known/peac.txt', new URL(uri).origin);
      const response = await fetch(peacUrl.toString());
      if (!response.ok) return null;

      const content = await response.text();
      const snapshot: AIPrefSnapshot = {};

      // Extract hints from peac.txt
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          const hint = trimmed.substring(2).toLowerCase();
          if (hint.includes('no training')) snapshot['train-ai'] = false;
          if (hint.includes('no crawling')) snapshot.crawl = false;
          if (hint.includes('non-commercial')) snapshot.commercial = false;
        }
      }

      return Object.keys(snapshot).length > 0 ? snapshot : null;
    } catch {
      return null;
    }
  }

  private async fetchRobotsTxt(uri: string): Promise<AIPrefSnapshot | null> {
    const content = await fetchRobots(uri);
    if (!content) return null;

    const rules = parseRobots(content);
    return robotsToAIPref(rules);
  }

  private normalizeSnapshot(data: any): AIPrefSnapshot | null {
    if (!data || typeof data !== 'object') return null;

    const snapshot: AIPrefSnapshot = {};
    if (typeof data.crawl === 'boolean') snapshot.crawl = data.crawl;
    if (typeof data['train-ai'] === 'boolean') snapshot['train-ai'] = data['train-ai'];
    if (typeof data.commercial === 'boolean') snapshot.commercial = data.commercial;

    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  private async computeDigest(
    snapshot: AIPrefSnapshot
  ): Promise<{ alg: 'JCS-SHA256'; val: string }> {
    // Simple canonicalization for digest
    const canonical = JSON.stringify(snapshot, Object.keys(snapshot).sort());
    const encoder = new TextEncoder();
    const data = encoder.encode(canonical);

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return {
      alg: 'JCS-SHA256',
      val: hashHex.substring(0, 12), // Truncated for brevity
    };
  }
}
