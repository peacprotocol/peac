/**
 * @peac/parsers-universal - Type definitions
 * Core interfaces for universal policy parsing
 */

export interface Parser {
  readonly name: string;
  readonly priority: number;
  test(url: URL): Promise<boolean>;
  parse(url: URL, fetcher: typeof fetch): Promise<PartialPolicy | null>;
}

export interface PartialPolicy {
  source: string;
  allow?: boolean;
  deny?: boolean;
  conditions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UnifiedPolicy {
  decision: 'allow' | 'deny' | 'conditional';
  sources: string[];
  conditions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface FetchOptions {
  timeout?: number;
  maxRedirects?: number;
  maxBodySize?: number;
}

export interface PrecedenceRule {
  sourcePattern: string;
  priority: number;
}
