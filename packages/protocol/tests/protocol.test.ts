/**
 * Tests for PEAC protocol issue and verify
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issue } from '../src/issue';
import { decode } from '@peac/crypto';
import {
  PEACReceiptClaims,
  type WorkflowContext,
  type WorkflowId,
  type StepId,
  WORKFLOW_EXTENSION_KEY,
} from '@peac/schema';

describe('PEAC Protocol', () => {
  describe('issue()', () => {
    it('should issue a valid receipt with UUIDv7 rid', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: 'cs_123456',
        asset: 'USD',
        env: 'test',
        evidence: { session_id: 'cs_123456' },
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      // Result should have jws property
      expect(result.jws).toBeDefined();
      const jws = result.jws;

      // JWS should have three parts
      expect(jws.split('.')).toHaveLength(3);

      // Decode and validate
      const decoded = decode<PEACReceiptClaims>(jws);

      expect(decoded.header.typ).toBe('peac-receipt/0.1');
      expect(decoded.header.alg).toBe('EdDSA');
      expect(decoded.header.kid).toBe('2025-01-15T10:30:00Z');

      expect(decoded.payload.iss).toBe('https://api.example.com');
      expect(decoded.payload.aud).toBe('https://app.example.com');
      expect(decoded.payload.amt).toBe(9999);
      expect(decoded.payload.cur).toBe('USD');

      // Receipt ID should be UUIDv7
      expect(decoded.payload.rid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Payment should match
      expect(decoded.payload.payment.rail).toBe('stripe');
      expect(decoded.payload.payment.reference).toBe('cs_123456');
      expect(decoded.payload.payment.amount).toBe(9999);
      expect(decoded.payload.payment.currency).toBe('USD');
    });

    it('should include subject if provided', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: 'cs_123456',
        asset: 'USD',
        env: 'test',
        evidence: { session_id: 'cs_123456' },
        subject: 'https://app.example.com/api/resource/123',
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);

      expect(decoded.payload.subject).toEqual({
        uri: 'https://app.example.com/api/resource/123',
      });
    });

    it('should include exp if provided', async () => {
      const { privateKey } = await generateKeypair();
      const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: 'cs_123456',
        asset: 'USD',
        env: 'test',
        evidence: { session_id: 'cs_123456' },
        exp,
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);

      expect(decoded.payload.exp).toBe(exp);
    });

    it('should reject non-https issuer URL', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: 'http://api.example.com', // HTTP not allowed
          aud: 'https://app.example.com',
          amt: 9999,
          cur: 'USD',
          rail: 'stripe',
          reference: 'cs_123456',
          asset: 'USD',
          env: 'test',
          evidence: { session_id: 'cs_123456' },
          privateKey,
          kid: '2025-01-15T10:30:00Z',
        })
      ).rejects.toThrow('Issuer URL must start with https://');
    });

    it('should reject non-https audience URL', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: 'https://api.example.com',
          aud: 'http://app.example.com', // HTTP not allowed
          amt: 9999,
          cur: 'USD',
          rail: 'stripe',
          reference: 'cs_123456',
          asset: 'USD',
          env: 'test',
          evidence: { session_id: 'cs_123456' },
          privateKey,
          kid: '2025-01-15T10:30:00Z',
        })
      ).rejects.toThrow('Audience URL must start with https://');
    });

    it('should reject invalid currency code', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: 'https://api.example.com',
          aud: 'https://app.example.com',
          amt: 9999,
          cur: 'usd', // Must be uppercase
          rail: 'stripe',
          reference: 'cs_123456',
          asset: 'USD',
          env: 'test',
          evidence: { session_id: 'cs_123456' },
          privateKey,
          kid: '2025-01-15T10:30:00Z',
        })
      ).rejects.toThrow('Currency must be ISO 4217 uppercase');
    });

    it('should reject negative amount', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: 'https://api.example.com',
          aud: 'https://app.example.com',
          amt: -100, // Negative not allowed
          cur: 'USD',
          rail: 'stripe',
          reference: 'cs_123456',
          asset: 'USD',
          env: 'test',
          evidence: { session_id: 'cs_123456' },
          privateKey,
          kid: '2025-01-15T10:30:00Z',
        })
      ).rejects.toThrow('Amount must be a non-negative integer');
    });

    it('should reject non-integer amount', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: 'https://api.example.com',
          aud: 'https://app.example.com',
          amt: 99.99, // Must be integer
          cur: 'USD',
          rail: 'stripe',
          reference: 'cs_123456',
          asset: 'USD',
          env: 'test',
          evidence: { session_id: 'cs_123456' },
          privateKey,
          kid: '2025-01-15T10:30:00Z',
        })
      ).rejects.toThrow('Amount must be a non-negative integer');
    });

    it('should generate unique UUIDv7 for each receipt', async () => {
      const { privateKey } = await generateKeypair();

      const result1 = await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: 'cs_123456',
        asset: 'USD',
        env: 'test',
        evidence: { session_id: 'cs_123456' },
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      const result2 = await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: 'cs_123456',
        asset: 'USD',
        env: 'test',
        evidence: { session_id: 'cs_123456' },
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      const decoded1 = decode<PEACReceiptClaims>(result1.jws);
      const decoded2 = decode<PEACReceiptClaims>(result2.jws);

      // RIDs should be different
      expect(decoded1.payload.rid).not.toBe(decoded2.payload.rid);
    });

    // Workflow correlation tests (v0.10.2+)
    describe('workflow_context', () => {
      it('should include workflow_context in ext if provided', async () => {
        const { privateKey } = await generateKeypair();

        const workflowContext: WorkflowContext = {
          workflow_id: 'wf_01ARZ3NDEKTSV4RRFFQ69G5FAV' as WorkflowId,
          step_id: 'step_01ARZ3NDEKTSV4RRFFQ69G5FAV' as StepId,
          parent_step_ids: [],
        };

        const result = await issue({
          iss: 'https://api.example.com',
          aud: 'https://app.example.com',
          amt: 9999,
          cur: 'USD',
          rail: 'stripe',
          reference: 'cs_123456',
          asset: 'USD',
          env: 'test',
          evidence: { session_id: 'cs_123456' },
          privateKey,
          kid: '2025-01-15T10:30:00Z',
          workflow_context: workflowContext,
        });

        const decoded = decode<PEACReceiptClaims>(result.jws);

        // Workflow context should be in ext under the extension key
        expect(decoded.payload.ext).toBeDefined();
        expect(decoded.payload.ext![WORKFLOW_EXTENSION_KEY]).toEqual(workflowContext);
      });

      it('should include workflow_context with parent steps', async () => {
        const { privateKey } = await generateKeypair();

        const workflowContext: WorkflowContext = {
          workflow_id: 'wf_01ARZ3NDEKTSV4RRFFQ69G5FAV' as WorkflowId,
          step_id: 'step_01H5KPT9QZA123456789CHILD1' as StepId,
          parent_step_ids: [
            'step_01ARZ3NDEKTSV4RRFFQ69G5FAV' as StepId,
            'step_01H5KPT9QZA123456789PARENT' as StepId,
          ],
          step_index: 2,
          step_total: 5,
        };

        const result = await issue({
          iss: 'https://api.example.com',
          aud: 'https://app.example.com',
          amt: 9999,
          cur: 'USD',
          rail: 'stripe',
          reference: 'cs_123456',
          asset: 'USD',
          env: 'test',
          evidence: { session_id: 'cs_123456' },
          privateKey,
          kid: '2025-01-15T10:30:00Z',
          workflow_context: workflowContext,
        });

        const decoded = decode<PEACReceiptClaims>(result.jws);

        const storedContext = decoded.payload.ext![WORKFLOW_EXTENSION_KEY] as WorkflowContext;
        expect(storedContext.workflow_id).toBe('wf_01ARZ3NDEKTSV4RRFFQ69G5FAV');
        expect(storedContext.step_id).toBe('step_01H5KPT9QZA123456789CHILD1');
        expect(storedContext.parent_step_ids).toHaveLength(2);
        expect(storedContext.step_index).toBe(2);
        expect(storedContext.step_total).toBe(5);
      });

      it('should merge workflow_context with existing ext', async () => {
        const { privateKey } = await generateKeypair();

        const workflowContext: WorkflowContext = {
          workflow_id: 'wf_01ARZ3NDEKTSV4RRFFQ69G5FAV' as WorkflowId,
          step_id: 'step_01ARZ3NDEKTSV4RRFFQ69G5FAV' as StepId,
          parent_step_ids: [],
        };

        const result = await issue({
          iss: 'https://api.example.com',
          aud: 'https://app.example.com',
          amt: 9999,
          cur: 'USD',
          rail: 'stripe',
          reference: 'cs_123456',
          asset: 'USD',
          env: 'test',
          evidence: { session_id: 'cs_123456' },
          privateKey,
          kid: '2025-01-15T10:30:00Z',
          ext: { 'custom/key': { value: 'test' } },
          workflow_context: workflowContext,
        });

        const decoded = decode<PEACReceiptClaims>(result.jws);

        // Both custom ext and workflow_context should be present
        expect(decoded.payload.ext!['custom/key']).toEqual({ value: 'test' });
        expect(decoded.payload.ext![WORKFLOW_EXTENSION_KEY]).toEqual(workflowContext);
      });

      it('should reject workflow_context with step as its own parent', async () => {
        const { privateKey } = await generateKeypair();

        const invalidContext: WorkflowContext = {
          workflow_id: 'wf_01ARZ3NDEKTSV4RRFFQ69G5FAV' as WorkflowId,
          step_id: 'step_01ARZ3NDEKTSV4RRFFQ69G5FAV' as StepId,
          parent_step_ids: ['step_01ARZ3NDEKTSV4RRFFQ69G5FAV' as StepId], // Self-parent
        };

        await expect(
          issue({
            iss: 'https://api.example.com',
            aud: 'https://app.example.com',
            amt: 9999,
            cur: 'USD',
            rail: 'stripe',
            reference: 'cs_123456',
            asset: 'USD',
            env: 'test',
            evidence: { session_id: 'cs_123456' },
            privateKey,
            kid: '2025-01-15T10:30:00Z',
            workflow_context: invalidContext,
          })
        ).rejects.toThrow('Step cannot be its own parent');
      });

      it('should reject workflow_context with duplicate parent step IDs', async () => {
        const { privateKey } = await generateKeypair();

        const invalidContext: WorkflowContext = {
          workflow_id: 'wf_01ARZ3NDEKTSV4RRFFQ69G5FAV' as WorkflowId,
          step_id: 'step_01H5KPT9QZA123456789CHILD1' as StepId,
          parent_step_ids: [
            'step_01ARZ3NDEKTSV4RRFFQ69G5FAV' as StepId,
            'step_01ARZ3NDEKTSV4RRFFQ69G5FAV' as StepId, // Duplicate
          ],
        };

        await expect(
          issue({
            iss: 'https://api.example.com',
            aud: 'https://app.example.com',
            amt: 9999,
            cur: 'USD',
            rail: 'stripe',
            reference: 'cs_123456',
            asset: 'USD',
            env: 'test',
            evidence: { session_id: 'cs_123456' },
            privateKey,
            kid: '2025-01-15T10:30:00Z',
            workflow_context: invalidContext,
          })
        ).rejects.toThrow('Parent step IDs must be unique');
      });

      it('should reject workflow_context with invalid schema', async () => {
        const { privateKey } = await generateKeypair();

        // Missing required field (step_id)
        const invalidContext = {
          workflow_id: 'wf_01ARZ3NDEKTSV4RRFFQ69G5FAV',
          parent_step_ids: [],
        } as unknown as WorkflowContext;

        await expect(
          issue({
            iss: 'https://api.example.com',
            aud: 'https://app.example.com',
            amt: 9999,
            cur: 'USD',
            rail: 'stripe',
            reference: 'cs_123456',
            asset: 'USD',
            env: 'test',
            evidence: { session_id: 'cs_123456' },
            privateKey,
            kid: '2025-01-15T10:30:00Z',
            workflow_context: invalidContext,
          })
        ).rejects.toThrow('Does not conform to WorkflowContextSchema');
      });
    });
  });
});
