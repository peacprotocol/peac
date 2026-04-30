import { describe, it, expect, beforeEach } from 'vitest';
import {
  isShadowResolverEnabled,
  loadShadowResolver,
  resetShadowResolverForTests,
} from '../src/lib/shadow-resolver.js';

describe('shadow-resolver lazy-import boundary', () => {
  beforeEach(() => {
    resetShadowResolverForTests();
  });

  it('reports disabled when env var is unset', () => {
    expect(isShadowResolverEnabled({})).toBe(false);
  });

  it('reports disabled for any value other than "1"', () => {
    expect(isShadowResolverEnabled({ PEAC_INTERNAL_SHADOW_RESOLVER: '0' })).toBe(false);
    expect(isShadowResolverEnabled({ PEAC_INTERNAL_SHADOW_RESOLVER: 'true' })).toBe(false);
    expect(isShadowResolverEnabled({ PEAC_INTERNAL_SHADOW_RESOLVER: '' })).toBe(false);
  });

  it('reports enabled when PEAC_INTERNAL_SHADOW_RESOLVER is exactly "1"', () => {
    expect(isShadowResolverEnabled({ PEAC_INTERNAL_SHADOW_RESOLVER: '1' })).toBe(true);
  });

  it('lazy-loads @peac/resolver-http on demand and exports the expected surface', async () => {
    const mod = await loadShadowResolver();
    expect(mod).toBeDefined();
    expect(typeof mod.fetchJsonSafe).toBe('function');
    expect(typeof mod.fetchJwksSafe).toBe('function');
    expect(typeof mod.fetchRawSafe).toBe('function');
    expect(typeof mod.fetchPointerWithDigest).toBe('function');
    expect(typeof mod.fetchIssuerConfig).toBe('function');
  });

  it('returns the same module instance on repeated calls', async () => {
    const a = await loadShadowResolver();
    const b = await loadShadowResolver();
    expect(a).toBe(b);
  });
});
