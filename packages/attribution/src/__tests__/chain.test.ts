/**
 * Chain Verification Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { detectCycle, verifyChain, collectReceiptRefs, flattenChain } from '../chain.js';
import { createAttributionAttestation, type AttributionAttestation } from '@peac/schema';

describe('detectCycle', () => {
  it('should return undefined when no cycle exists', () => {
    const sources = [
      { receipt_ref: 'jti:rec_1', usage: 'rag_context' as const },
      { receipt_ref: 'jti:rec_2', usage: 'rag_context' as const },
    ];
    const visited = new Set<string>();

    expect(detectCycle(sources, visited)).toBeUndefined();
  });

  it('should detect cycle when receipt_ref is in visited set', () => {
    const sources = [
      { receipt_ref: 'jti:rec_1', usage: 'rag_context' as const },
      { receipt_ref: 'jti:rec_2', usage: 'rag_context' as const },
    ];
    const visited = new Set(['jti:rec_2']);

    expect(detectCycle(sources, visited)).toBe('jti:rec_2');
  });

  it('should return first cycle detected', () => {
    const sources = [
      { receipt_ref: 'jti:rec_1', usage: 'rag_context' as const },
      { receipt_ref: 'jti:rec_2', usage: 'rag_context' as const },
    ];
    const visited = new Set(['jti:rec_1', 'jti:rec_2']);

    expect(detectCycle(sources, visited)).toBe('jti:rec_1');
  });
});

describe('collectReceiptRefs', () => {
  it('should collect all unique receipt refs', () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        { receipt_ref: 'jti:rec_1', usage: 'rag_context' },
        { receipt_ref: 'jti:rec_2', usage: 'synthesis_source' },
        { receipt_ref: 'jti:rec_3', usage: 'training_input' },
      ],
      derivation_type: 'synthesis',
    });

    const refs = collectReceiptRefs(attestation);
    expect(refs).toHaveLength(3);
    expect(refs).toContain('jti:rec_1');
    expect(refs).toContain('jti:rec_2');
    expect(refs).toContain('jti:rec_3');
  });

  it('should deduplicate receipt refs', () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        { receipt_ref: 'jti:rec_1', usage: 'rag_context' },
        { receipt_ref: 'jti:rec_1', usage: 'embedding_source' }, // Duplicate
      ],
      derivation_type: 'inference',
    });

    const refs = collectReceiptRefs(attestation);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toBe('jti:rec_1');
  });
});

describe('verifyChain', () => {
  it('should verify chain with no resolver', async () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        { receipt_ref: 'jti:rec_1', usage: 'rag_context' },
        { receipt_ref: 'jti:rec_2', usage: 'rag_context' },
      ],
      derivation_type: 'rag',
    });

    const result = await verifyChain(attestation);
    expect(result.valid).toBe(true);
    expect(result.maxDepth).toBe(0);
    expect(result.totalSources).toBe(2);
  });

  it('should verify chain with resolver returning null', async () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const resolver = vi.fn().mockResolvedValue(null);

    const result = await verifyChain(attestation, { resolver });
    expect(result.valid).toBe(true);
    expect(result.maxDepth).toBe(0);
    expect(resolver).toHaveBeenCalledWith('jti:rec_1');
  });

  it('should traverse nested attestations', async () => {
    const childAttestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:child_rec', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const parentAttestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:parent_rec', usage: 'synthesis_source' }],
      derivation_type: 'synthesis',
    });

    const resolver = vi.fn().mockImplementation((ref) => {
      if (ref === 'jti:parent_rec') return Promise.resolve(childAttestation);
      return Promise.resolve(null);
    });

    const result = await verifyChain(parentAttestation, { resolver });
    expect(result.valid).toBe(true);
    expect(result.maxDepth).toBe(1);
    expect(result.totalSources).toBe(2);
  });

  it('should detect circular references', async () => {
    const attestation1 = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_2', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const attestation2 = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const resolver = vi.fn().mockImplementation((ref) => {
      if (ref === 'jti:rec_2') return Promise.resolve(attestation2);
      if (ref === 'jti:rec_1') return Promise.resolve(attestation1);
      return Promise.resolve(null);
    });

    const root = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const result = await verifyChain(root, { resolver });
    expect(result.valid).toBe(false);
    expect(result.cycleDetected).toBe('jti:rec_1');
  });

  it('should respect maxDepth limit', async () => {
    // Create a chain that exceeds depth
    const createLevel = (n: number): AttributionAttestation =>
      createAttributionAttestation({
        issuer: 'https://ai.example.com',
        sources: [{ receipt_ref: `jti:level_${n + 1}`, usage: 'rag_context' }],
        derivation_type: 'rag',
      });

    const resolver = vi.fn().mockImplementation((ref) => {
      const match = ref.match(/jti:level_(\d+)/);
      if (match) {
        const level = parseInt(match[1], 10);
        if (level < 20) return Promise.resolve(createLevel(level));
      }
      return Promise.resolve(null);
    });

    const root = createLevel(0);
    const result = await verifyChain(root, { resolver, maxDepth: 3 });

    // Implementation uses soft limit: stops resolving at maxDepth rather than erroring
    // This is correct behavior - gracefully truncate the chain
    expect(result.valid).toBe(true);
    expect(result.maxDepth).toBeLessThanOrEqual(3);
    expect(result.totalSources).toBe(4); // Sources at depths 0, 1, 2, 3
  });

  it('should handle resolution timeout', async () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:slow_rec', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const resolver = vi.fn().mockImplementation(async () => {
      // Delay longer than timeout
      await new Promise((resolve) => setTimeout(resolve, 200));
      return null;
    });

    const result = await verifyChain(attestation, {
      resolver,
      resolutionTimeout: 50,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('should handle resolution errors', async () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:error_rec', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const resolver = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await verifyChain(attestation, { resolver });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Network error');
  });
});

describe('flattenChain', () => {
  it('should flatten a simple chain', async () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        { receipt_ref: 'jti:rec_1', usage: 'rag_context', weight: 0.5 },
        { receipt_ref: 'jti:rec_2', usage: 'synthesis_source', weight: 0.5 },
      ],
      derivation_type: 'synthesis',
    });

    const resolver = vi.fn().mockResolvedValue(null);

    const result = await flattenChain(attestation, resolver);
    expect(result.sources).toHaveLength(2);
    expect(result.depth).toBe(0);
  });

  it('should flatten nested chains', async () => {
    const child = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        { receipt_ref: 'jti:child_1', usage: 'rag_context' },
        { receipt_ref: 'jti:child_2', usage: 'rag_context' },
      ],
      derivation_type: 'rag',
    });

    const parent = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:parent_1', usage: 'synthesis_source' }],
      derivation_type: 'synthesis',
    });

    const resolver = vi.fn().mockImplementation((ref) => {
      if (ref === 'jti:parent_1') return Promise.resolve(child);
      return Promise.resolve(null);
    });

    const result = await flattenChain(parent, resolver);
    expect(result.sources).toHaveLength(3);
    expect(result.depth).toBe(1);
  });

  it('should skip cycles', async () => {
    const cyclic = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:root', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const root = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:cyclic', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    let callCount = 0;
    const resolver = vi.fn().mockImplementation((ref) => {
      callCount++;
      if (callCount > 10) return Promise.resolve(null); // Safety limit
      if (ref === 'jti:cyclic') return Promise.resolve(cyclic);
      if (ref === 'jti:root') return Promise.resolve(root);
      return Promise.resolve(null);
    });

    const result = await flattenChain(root, resolver);
    // Should not infinite loop
    expect(result.sources.length).toBeLessThanOrEqual(2);
  });
});
