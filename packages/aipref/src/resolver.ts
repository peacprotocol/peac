/**
 * @peac/pref/resolver - deprecated facade over @peac/mappings-content-signals.
 *
 * @peac/pref is deprecated. Use @peac/mappings-content-signals directly for
 * RFC 8941/9651 Structured-Fields `Content-Usage` parsing, RFC 9309
 * robots.txt parsing, tdmrep parsing, and `resolveSignals()`.
 *
 * This module preserves the @peac/pref public API shape (`PrefResolver`,
 * `AIPrefPolicy`, `AIPrefSnapshot`) while delegating all parsing to
 * @peac/mappings-content-signals.
 *
 * Behavior contract:
 *   - No in-package `fetch()` calls. Callers pass pre-fetched content via
 *     `ResolveContext` fields.
 *   - `Content-Usage` parsing uses RFC 9651 Structured-Fields.
 *   - Digest output is a full-length RFC 8785 JCS + SHA-256 (64 hex chars)
 *     computed via `@peac/crypto.jcsHash`.
 *   - A one-shot structured DeprecationWarning with code
 *     `PEAC_DEPRECATED_PREF` fires on first `PrefResolver` instantiation.
 */

import {
  parseContentUsage,
  parseRobotsTxt,
  parseTdmrep,
  resolveSignals,
  type ContentSignalEntry,
} from '@peac/mappings-content-signals';
import { jcsHash } from '@peac/crypto';
import type { AIPrefDigest, AIPrefPolicy, AIPrefSnapshot, ResolveContext } from './types.js';

let deprecationWarningFired = false;

function fireDeprecationWarning(): void {
  if (deprecationWarningFired) return;
  deprecationWarningFired = true;
  if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
    process.emitWarning(
      '@peac/pref is deprecated. Use @peac/mappings-content-signals for ' +
        'RFC 8941/9651 Structured-Fields Content-Usage parsing, RFC 9309 ' +
        'robots.txt parsing, tdmrep parsing, and resolveSignals().',
      { code: 'PEAC_DEPRECATED_PREF', type: 'DeprecationWarning' }
    );
  }
}

/** @internal exposed for tests that need to observe the warning more than once. */
export function __resetDeprecationWarningForTests(): void {
  deprecationWarningFired = false;
}

/**
 * Map @peac/mappings-content-signals entries into the legacy AIPrefSnapshot
 * shape. Preserved for backward compat of the @peac/pref public API. New
 * code should consume `ContentSignalEntry[]` directly from
 * `@peac/mappings-content-signals.resolveSignals`.
 */
function entriesToSnapshot(entries: ContentSignalEntry[]): AIPrefSnapshot | null {
  const snapshot: AIPrefSnapshot = {};
  let hasPrefs = false;
  for (const entry of entries) {
    if (entry.decision === 'unspecified') continue;
    const allow = entry.decision === 'allow';
    switch (entry.purpose) {
      case 'ai-training':
      case 'ai-generative':
      case 'ai-inference':
        if (snapshot['train-ai'] === undefined) snapshot['train-ai'] = allow;
        hasPrefs = true;
        break;
      case 'ai-search':
      case 'tdm':
        if (snapshot.crawl === undefined) snapshot.crawl = allow;
        hasPrefs = true;
        break;
    }
  }
  return hasPrefs ? snapshot : null;
}

/**
 * @deprecated Use `@peac/mappings-content-signals` directly. Retained for
 * backward compat of the @peac/pref public API. Emits a one-shot structured
 * `PEAC_DEPRECATED_PREF` DeprecationWarning on instantiation.
 */
export class PrefResolver {
  private defaults: AIPrefSnapshot = {
    crawl: true,
    'train-ai': true,
    commercial: false,
  };

  constructor() {
    fireDeprecationWarning();
  }

  /**
   * Resolve AI preferences from pre-fetched content. Does not perform network
   * I/O. Callers supply all content via `ResolveContext` optional fields
   * (`headers['content-usage']`, `robotsTxt`, `tdmrep`).
   */
  async resolve(ctx: ResolveContext): Promise<AIPrefPolicy> {
    const checkedAt = new Date().toISOString();
    const entries: ContentSignalEntry[] = [];

    const contentUsage = ctx.headers?.['content-usage'] ?? ctx.headers?.['Content-Usage'];
    if (typeof contentUsage === 'string' && contentUsage.length > 0) {
      try {
        entries.push(...parseContentUsage(contentUsage).entries);
      } catch {
        // Malformed header: fall through to other sources.
      }
    }
    if (typeof ctx.robotsTxt === 'string' && ctx.robotsTxt.length > 0) {
      try {
        entries.push(...parseRobotsTxt(ctx.robotsTxt));
      } catch {
        // ignore
      }
    }
    if (typeof ctx.tdmrep === 'string' && ctx.tdmrep.length > 0) {
      try {
        entries.push(...parseTdmrep(ctx.tdmrep));
      } catch {
        // ignore
      }
    }

    if (entries.length === 0) {
      const snapshot = this.defaults;
      return {
        status: 'not_found',
        checked_at: checkedAt,
        snapshot,
        digest: await this.computeDigest(snapshot),
        source: 'default',
        reason: 'No content signals supplied; using defaults',
      };
    }

    const resolved = resolveSignals(entries);
    const snapshot = entriesToSnapshot(resolved) ?? this.defaults;
    const primary = resolved[0]?.source;
    const source: AIPrefPolicy['source'] =
      primary === 'content-usage-header'
        ? 'header'
        : primary === 'robots-txt'
          ? 'robots'
          : primary === 'tdmrep-json'
            ? 'tdmrep'
            : 'default';

    return {
      status: 'active',
      checked_at: checkedAt,
      snapshot,
      digest: await this.computeDigest(snapshot),
      source,
    };
  }

  /**
   * Compute a stable RFC 8785 JCS + SHA-256 digest of the snapshot. Returns a
   * full 64-character lowercase hex string. The `alg` literal is retained as
   * `JCS-SHA256` for API backward compat; the bytes match the canonical PEAC
   * discipline (`@peac/crypto.jcsHash`).
   */
  private async computeDigest(snapshot: AIPrefSnapshot): Promise<AIPrefDigest> {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(snapshot).sort()) {
      sorted[key] = (snapshot as Record<string, unknown>)[key];
    }
    const hex = await jcsHash(sorted);
    return { alg: 'JCS-SHA256', val: hex };
  }
}
