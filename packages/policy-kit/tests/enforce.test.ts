/**
 * Decision Enforcement Tests
 */

import { describe, it, expect } from 'vitest';
import {
  enforceDecision,
  requiresChallenge,
  getChallengeHeader,
  enforceForHttp,
  enforcePurposeDecision,
  getPurposeStatusCode,
} from '../src';

describe('Decision Enforcement', () => {
  describe('enforceDecision', () => {
    describe('allow decision', () => {
      it('returns allowed=true', () => {
        const result = enforceDecision('allow', {});
        expect(result.allowed).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.challenge).toBe(false);
        expect(result.decision).toBe('allow');
      });

      it('ignores receiptVerified flag', () => {
        const withReceipt = enforceDecision('allow', { receiptVerified: true });
        const withoutReceipt = enforceDecision('allow', { receiptVerified: false });
        expect(withReceipt.allowed).toBe(true);
        expect(withoutReceipt.allowed).toBe(true);
      });
    });

    describe('deny decision', () => {
      it('returns allowed=false with 403', () => {
        const result = enforceDecision('deny', {});
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.challenge).toBe(false);
        expect(result.decision).toBe('deny');
      });

      it('ignores receiptVerified flag', () => {
        const withReceipt = enforceDecision('deny', { receiptVerified: true });
        expect(withReceipt.allowed).toBe(false);
        expect(withReceipt.statusCode).toBe(403);
      });
    });

    describe('review decision', () => {
      it('denies without receipt', () => {
        const result = enforceDecision('review', {});
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(402);
        expect(result.challenge).toBe(true);
        expect(result.decision).toBe('review');
      });

      it('denies with receiptVerified=false', () => {
        const result = enforceDecision('review', { receiptVerified: false });
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(402);
        expect(result.challenge).toBe(true);
      });

      it('allows with receiptVerified=true', () => {
        const result = enforceDecision('review', { receiptVerified: true });
        expect(result.allowed).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.challenge).toBe(false);
      });
    });
  });

  describe('requiresChallenge', () => {
    it('returns true for review without receipt', () => {
      const result = enforceDecision('review', {});
      expect(requiresChallenge(result)).toBe(true);
    });

    it('returns false for allow', () => {
      const result = enforceDecision('allow', {});
      expect(requiresChallenge(result)).toBe(false);
    });

    it('returns false for deny', () => {
      const result = enforceDecision('deny', {});
      expect(requiresChallenge(result)).toBe(false);
    });

    it('returns false for review with receipt', () => {
      const result = enforceDecision('review', { receiptVerified: true });
      expect(requiresChallenge(result)).toBe(false);
    });
  });

  describe('getChallengeHeader', () => {
    it('returns header for challenge', () => {
      const result = enforceDecision('review', {});
      const header = getChallengeHeader(result);
      expect(header).toBe('PEAC realm="receipt", error="receipt_required"');
    });

    it('returns undefined for non-challenge', () => {
      const result = enforceDecision('allow', {});
      expect(getChallengeHeader(result)).toBeUndefined();
    });

    it('returns undefined for deny', () => {
      const result = enforceDecision('deny', {});
      expect(getChallengeHeader(result)).toBeUndefined();
    });
  });

  describe('enforceForHttp', () => {
    it('returns 200 with empty headers for allow', () => {
      const result = enforceForHttp('allow', {});
      expect(result.status).toBe(200);
      expect(result.headers).toEqual({});
      expect(result.allowed).toBe(true);
    });

    it('returns 403 with empty headers for deny', () => {
      const result = enforceForHttp('deny', {});
      expect(result.status).toBe(403);
      expect(result.headers).toEqual({});
      expect(result.allowed).toBe(false);
    });

    it('returns 402 with WWW-Authenticate for review without receipt', () => {
      const result = enforceForHttp('review', {});
      expect(result.status).toBe(402);
      expect(result.headers['WWW-Authenticate']).toBe(
        'PEAC realm="receipt", error="receipt_required"'
      );
      expect(result.allowed).toBe(false);
    });

    it('returns 200 with empty headers for review with receipt', () => {
      const result = enforceForHttp('review', { receiptVerified: true });
      expect(result.status).toBe(200);
      expect(result.headers).toEqual({});
      expect(result.allowed).toBe(true);
    });
  });

  describe('integration with evaluate', () => {
    it('works with evaluation result', async () => {
      // Simulate the typical flow
      const { evaluate, parsePolicy, enforceDecision } = await import('../src');

      const policy = parsePolicy(`
        version: "peac-policy/0.1"
        defaults:
          decision: deny
        rules:
          - name: allow-with-receipt
            purpose: inference
            decision: review
      `);

      const result = evaluate(policy, { purpose: 'inference' });
      expect(result.decision).toBe('review');

      // Enforce without receipt
      const enforcement1 = enforceDecision(result.decision, { receiptVerified: false });
      expect(enforcement1.allowed).toBe(false);
      expect(enforcement1.statusCode).toBe(402);

      // Enforce with receipt
      const enforcement2 = enforceDecision(result.decision, { receiptVerified: true });
      expect(enforcement2.allowed).toBe(true);
      expect(enforcement2.statusCode).toBe(200);
    });
  });
});

// ============================================================================
// Purpose-Specific Enforcement Tests (v0.9.24+)
// ============================================================================

describe('Purpose Enforcement (v0.9.24+)', () => {
  describe('enforcePurposeDecision', () => {
    describe('valid purpose tokens', () => {
      it('returns 200 for allow decision', () => {
        const result = enforcePurposeDecision('allow', { purposeValid: true });
        expect(result.allowed).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.decision).toBe('allow');
        expect(result.reason).toContain('allowed');
      });

      it('returns 403 for deny decision', () => {
        const result = enforcePurposeDecision('deny', { purposeValid: true });
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.decision).toBe('deny');
        expect(result.reason).toContain('denied');
      });

      it('returns 403 (NOT 402) for review decision', () => {
        // CRITICAL: Purpose enforcement NEVER returns 402
        // 402 is reserved for payment/receipt challenges
        const result = enforcePurposeDecision('review', { purposeValid: true });
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.statusCode).not.toBe(402);
        expect(result.decision).toBe('review');
      });
    });

    describe('invalid purpose tokens', () => {
      it('returns 400 for invalid tokens', () => {
        const result = enforcePurposeDecision('allow', {
          purposeValid: false,
          invalidTokens: ['train-', 'UPPERCASE'],
        });
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(result.reason).toContain('train-');
        expect(result.reason).toContain('UPPERCASE');
      });

      it('returns 400 for invalid tokens regardless of decision', () => {
        // Invalid tokens always result in 400, even if policy would allow
        const allowResult = enforcePurposeDecision('allow', { purposeValid: false });
        const denyResult = enforcePurposeDecision('deny', { purposeValid: false });
        const reviewResult = enforcePurposeDecision('review', { purposeValid: false });

        expect(allowResult.statusCode).toBe(400);
        expect(denyResult.statusCode).toBe(400);
        expect(reviewResult.statusCode).toBe(400);
      });
    });

    describe('explicit undeclared token', () => {
      it('returns 400 for explicit undeclared', () => {
        const result = enforcePurposeDecision('allow', {
          purposeValid: true,
          explicitUndeclared: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(result.reason).toContain('undeclared');
        expect(result.reason).toContain('internal-only');
      });

      it('prioritizes undeclared check over invalid tokens', () => {
        const result = enforcePurposeDecision('allow', {
          purposeValid: false,
          explicitUndeclared: true,
          invalidTokens: ['bad-token'],
        });
        expect(result.statusCode).toBe(400);
        expect(result.reason).toContain('undeclared');
      });
    });

    describe('never returns 402', () => {
      // This is the key invariant: purpose enforcement never uses 402
      const decisions = ['allow', 'deny', 'review'] as const;
      const contexts = [
        { purposeValid: true },
        { purposeValid: false },
        { purposeValid: true, explicitUndeclared: true },
        { purposeValid: false, invalidTokens: ['bad'] },
      ];

      for (const decision of decisions) {
        for (const context of contexts) {
          it(`never returns 402 for ${decision} with context ${JSON.stringify(context)}`, () => {
            const result = enforcePurposeDecision(decision, context);
            expect(result.statusCode).not.toBe(402);
            expect([200, 400, 403]).toContain(result.statusCode);
          });
        }
      }
    });
  });

  describe('getPurposeStatusCode', () => {
    it('returns 200 for allowed purpose', () => {
      expect(getPurposeStatusCode('allow', true)).toBe(200);
    });

    it('returns 403 for denied purpose', () => {
      expect(getPurposeStatusCode('deny', true)).toBe(403);
    });

    it('returns 403 (NOT 402) for review purpose', () => {
      const status = getPurposeStatusCode('review', true);
      expect(status).toBe(403);
      expect(status).not.toBe(402);
    });

    it('returns 400 for invalid purpose tokens', () => {
      expect(getPurposeStatusCode('allow', false)).toBe(400);
      expect(getPurposeStatusCode('deny', false)).toBe(400);
      expect(getPurposeStatusCode('review', false)).toBe(400);
    });

    it('never returns 402', () => {
      const decisions = ['allow', 'deny', 'review'] as const;
      for (const decision of decisions) {
        expect(getPurposeStatusCode(decision, true)).not.toBe(402);
        expect(getPurposeStatusCode(decision, false)).not.toBe(402);
      }
    });
  });
});
