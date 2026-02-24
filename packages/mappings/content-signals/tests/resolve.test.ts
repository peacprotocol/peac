import { describe, it, expect } from 'vitest';
import {
  resolveSignals,
  getSourcePrecedence,
  hasHigherPriority,
  getDecisionForPurpose,
} from '../src/resolve.js';
import type { ContentSignalEntry } from '../src/types.js';

describe('resolveSignals', () => {
  it('returns empty array for empty input', () => {
    expect(resolveSignals([])).toEqual([]);
  });

  it('returns single entry unchanged', () => {
    const entries: ContentSignalEntry[] = [
      { purpose: 'ai-training', decision: 'deny', source: 'robots-txt' },
    ];
    const resolved = resolveSignals(entries);
    expect(resolved.length).toBe(1);
    expect(resolved[0].decision).toBe('deny');
  });

  it('tdmrep-json takes precedence over robots-txt', () => {
    const entries: ContentSignalEntry[] = [
      { purpose: 'ai-training', decision: 'allow', source: 'robots-txt' },
      { purpose: 'ai-training', decision: 'deny', source: 'tdmrep-json' },
    ];
    const resolved = resolveSignals(entries);
    expect(resolved.length).toBe(1);
    expect(resolved[0].decision).toBe('deny');
    expect(resolved[0].source).toBe('tdmrep-json');
  });

  it('content-usage-header takes precedence over robots-txt', () => {
    const entries: ContentSignalEntry[] = [
      { purpose: 'ai-training', decision: 'deny', source: 'robots-txt' },
      { purpose: 'ai-training', decision: 'allow', source: 'content-usage-header' },
    ];
    const resolved = resolveSignals(entries);
    expect(resolved.length).toBe(1);
    expect(resolved[0].decision).toBe('allow');
    expect(resolved[0].source).toBe('content-usage-header');
  });

  it('resolves different purposes independently', () => {
    const entries: ContentSignalEntry[] = [
      { purpose: 'ai-training', decision: 'deny', source: 'tdmrep-json' },
      { purpose: 'ai-inference', decision: 'allow', source: 'content-usage-header' },
      { purpose: 'ai-search', decision: 'deny', source: 'robots-txt' },
    ];
    const resolved = resolveSignals(entries);
    expect(resolved.length).toBe(3);
    expect(resolved.find((e) => e.purpose === 'ai-training')?.decision).toBe('deny');
    expect(resolved.find((e) => e.purpose === 'ai-inference')?.decision).toBe('allow');
    expect(resolved.find((e) => e.purpose === 'ai-search')?.decision).toBe('deny');
  });

  it('unspecified from high priority does not override definitive from low priority', () => {
    const entries: ContentSignalEntry[] = [
      { purpose: 'ai-training', decision: 'unspecified', source: 'tdmrep-json' },
      { purpose: 'ai-training', decision: 'deny', source: 'robots-txt' },
    ];
    const resolved = resolveSignals(entries);
    expect(resolved.length).toBe(1);
    expect(resolved[0].decision).toBe('deny');
    expect(resolved[0].source).toBe('robots-txt');
  });

  it('all unspecified returns highest priority unspecified', () => {
    const entries: ContentSignalEntry[] = [
      { purpose: 'ai-training', decision: 'unspecified', source: 'robots-txt' },
      { purpose: 'ai-training', decision: 'unspecified', source: 'tdmrep-json' },
    ];
    const resolved = resolveSignals(entries);
    expect(resolved.length).toBe(1);
    expect(resolved[0].decision).toBe('unspecified');
    expect(resolved[0].source).toBe('tdmrep-json');
  });
});

describe('getSourcePrecedence', () => {
  it('tdmrep-json has lowest index (highest priority)', () => {
    expect(getSourcePrecedence('tdmrep-json')).toBe(0);
  });

  it('robots-txt has highest index (lowest priority)', () => {
    expect(getSourcePrecedence('robots-txt')).toBe(2);
  });
});

describe('hasHigherPriority', () => {
  it('tdmrep-json has higher priority than robots-txt', () => {
    expect(hasHigherPriority('tdmrep-json', 'robots-txt')).toBe(true);
  });

  it('robots-txt does not have higher priority than tdmrep-json', () => {
    expect(hasHigherPriority('robots-txt', 'tdmrep-json')).toBe(false);
  });
});

describe('getDecisionForPurpose', () => {
  it('returns decision for matching purpose', () => {
    const entries: ContentSignalEntry[] = [
      { purpose: 'ai-training', decision: 'deny', source: 'tdmrep-json' },
    ];
    expect(getDecisionForPurpose(entries, 'ai-training')).toBe('deny');
  });

  it('returns unspecified for missing purpose', () => {
    const entries: ContentSignalEntry[] = [
      { purpose: 'ai-training', decision: 'deny', source: 'tdmrep-json' },
    ];
    expect(getDecisionForPurpose(entries, 'ai-inference')).toBe('unspecified');
  });
});
