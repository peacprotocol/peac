/**
 * @peac/pref/types - AIPREF types with robots.txt bridge
 */

export interface AIPrefSnapshot {
  crawl?: boolean;
  'train-ai'?: boolean;
  commercial?: boolean;
  [key: string]: boolean | undefined;
}

export interface AIPrefPolicy {
  status: 'active' | 'not_found' | 'error' | 'not_applicable';
  checked_at: string;
  snapshot?: AIPrefSnapshot;
  digest?: { alg: 'JCS-SHA256'; val: string };
  reason?: string;
  source?: 'header' | 'aipref' | 'peac' | 'robots' | 'default';
}

export interface RobotsRule {
  userAgent: string;
  directives: Array<{
    field: string;
    value: string;
  }>;
}

export interface PrefSource {
  priority: number;
  name: string;
  fetch(uri: string): Promise<AIPrefSnapshot | null>;
}

export interface ResolveContext {
  uri: string;
  headers?: Record<string, string>;
  timeout?: number;
}
