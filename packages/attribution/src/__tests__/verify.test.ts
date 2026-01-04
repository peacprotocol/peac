/**
 * Verification Tests
 */
import { describe, it, expect } from 'vitest';
import {
  verify,
  verifySync,
  verifySourceContent,
  verifySourceExcerpt,
  verifyOutput,
} from '../verify.js';
import { computeContentHash } from '../hash.js';
import { createAttributionAttestation, type AttributionAttestation } from '@peac/schema';

describe('verifySync', () => {
  it('should validate a valid attestation', () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_abc123', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const result = verifySync(attestation);
    expect(result.valid).toBe(true);
    expect(result.attestation).toBeDefined();
  });

  it('should reject attestation with empty sources', () => {
    const attestation = {
      type: 'peac/attribution',
      issuer: 'https://ai.example.com',
      issued_at: new Date().toISOString(),
      evidence: {
        sources: [],
        derivation_type: 'rag',
      },
    };

    const result = verifySync(attestation);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should reject attestation with wrong type', () => {
    const attestation = {
      type: 'wrong/type',
      issuer: 'https://ai.example.com',
      issued_at: new Date().toISOString(),
      evidence: {
        sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
        derivation_type: 'rag',
      },
    };

    const result = verifySync(attestation);
    expect(result.valid).toBe(false);
  });

  it('should reject expired attestation', () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
      expires_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
    });

    const result = verifySync(attestation);
    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe('E_ATTRIBUTION_EXPIRED');
  });

  it('should skip expiration check when option is set', () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
      expires_at: new Date(Date.now() - 60000).toISOString(),
    });

    const result = verifySync(attestation, { skipExpirationCheck: true });
    expect(result.valid).toBe(true);
  });

  it('should reject future-dated attestation', () => {
    const futureDate = new Date(Date.now() + 300000).toISOString(); // 5 minutes in future
    const attestation = {
      type: 'peac/attribution' as const,
      issuer: 'https://ai.example.com',
      issued_at: futureDate,
      evidence: {
        sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' as const }],
        derivation_type: 'rag' as const,
      },
    };

    const result = verifySync(attestation);
    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe('E_ATTRIBUTION_NOT_YET_VALID');
  });

  it('should respect clock skew tolerance', () => {
    // Attestation issued 20 seconds in future (within 30s default skew)
    const slightlyFuture = new Date(Date.now() + 20000).toISOString();
    const attestation = {
      type: 'peac/attribution' as const,
      issuer: 'https://ai.example.com',
      issued_at: slightlyFuture,
      evidence: {
        sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' as const }],
        derivation_type: 'rag' as const,
      },
    };

    const result = verifySync(attestation);
    expect(result.valid).toBe(true);
  });
});

describe('verify (async)', () => {
  it('should validate without chain verification', async () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const result = await verify(attestation);
    expect(result.valid).toBe(true);
    expect(result.chain).toBeUndefined();
  });

  it('should perform chain verification when requested', async () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    const result = await verify(attestation, {
      verifyChain: true,
      chainOptions: {
        resolver: async () => null, // No child attestations
      },
    });

    expect(result.valid).toBe(true);
    expect(result.chain).toBeDefined();
    expect(result.chain?.valid).toBe(true);
    expect(result.chain?.maxDepth).toBe(0);
    expect(result.chain?.totalSources).toBe(1);
  });
});

describe('verifySourceContent', () => {
  it('should verify matching content hash', () => {
    const content = 'Original article content';
    const hash = computeContentHash(content);

    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        {
          receipt_ref: 'jti:rec_1',
          usage: 'rag_context',
          content_hash: hash,
        },
      ],
      derivation_type: 'rag',
    });

    expect(verifySourceContent(content, attestation, 'jti:rec_1')).toBe(true);
  });

  it('should return false for non-matching content', () => {
    const hash = computeContentHash('original');

    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        {
          receipt_ref: 'jti:rec_1',
          usage: 'rag_context',
          content_hash: hash,
        },
      ],
      derivation_type: 'rag',
    });

    expect(verifySourceContent('different content', attestation, 'jti:rec_1')).toBe(false);
  });

  it('should return false for unknown receipt ref', () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        {
          receipt_ref: 'jti:rec_1',
          usage: 'rag_context',
          content_hash: computeContentHash('test'),
        },
      ],
      derivation_type: 'rag',
    });

    expect(verifySourceContent('test', attestation, 'jti:unknown')).toBe(false);
  });

  it('should return false when source has no content_hash', () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    expect(verifySourceContent('test', attestation, 'jti:rec_1')).toBe(false);
  });
});

describe('verifySourceExcerpt', () => {
  it('should verify matching excerpt hash', () => {
    const excerpt = 'The specific quoted paragraph';
    const hash = computeContentHash(excerpt);

    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        {
          receipt_ref: 'jti:rec_1',
          usage: 'direct_reference',
          excerpt_hash: hash,
        },
      ],
      derivation_type: 'inference',
    });

    expect(verifySourceExcerpt(excerpt, attestation, 'jti:rec_1')).toBe(true);
  });

  it('should return false for non-matching excerpt', () => {
    const hash = computeContentHash('original excerpt');

    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [
        {
          receipt_ref: 'jti:rec_1',
          usage: 'direct_reference',
          excerpt_hash: hash,
        },
      ],
      derivation_type: 'inference',
    });

    expect(verifySourceExcerpt('different excerpt', attestation, 'jti:rec_1')).toBe(false);
  });
});

describe('verifyOutput', () => {
  it('should verify matching output hash', () => {
    const output = 'Generated AI response content';
    const hash = computeContentHash(output);

    const attestation: AttributionAttestation = {
      type: 'peac/attribution',
      issuer: 'https://ai.example.com',
      issued_at: new Date().toISOString(),
      evidence: {
        sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
        derivation_type: 'inference',
        output_hash: hash,
      },
    };

    expect(verifyOutput(output, attestation)).toBe(true);
  });

  it('should return false for non-matching output', () => {
    const hash = computeContentHash('original output');

    const attestation: AttributionAttestation = {
      type: 'peac/attribution',
      issuer: 'https://ai.example.com',
      issued_at: new Date().toISOString(),
      evidence: {
        sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
        derivation_type: 'inference',
        output_hash: hash,
      },
    };

    expect(verifyOutput('different output', attestation)).toBe(false);
  });

  it('should return false when no output_hash present', () => {
    const attestation = createAttributionAttestation({
      issuer: 'https://ai.example.com',
      sources: [{ receipt_ref: 'jti:rec_1', usage: 'rag_context' }],
      derivation_type: 'rag',
    });

    expect(verifyOutput('test', attestation)).toBe(false);
  });
});
