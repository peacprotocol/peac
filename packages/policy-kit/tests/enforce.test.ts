/**
 * Decision Enforcement Tests
 */

import { describe, it, expect } from 'vitest';
import { enforceDecision, requiresChallenge, getChallengeHeader, enforceForHttp } from '../src';

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
