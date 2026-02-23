/**
 * Kernel carrier types compilation and shape tests.
 *
 * These tests verify that the carrier types compile correctly and
 * that the type shapes are usable as expected. Since kernel types
 * are pure TypeScript (zero runtime), we test assignability and
 * structure rather than runtime behavior.
 */
import { describe, expect, it } from 'vitest';

import type {
  CarrierAdapter,
  CarrierFormat,
  CarrierMeta,
  CarrierValidationResult,
  PeacEvidenceCarrier,
  ReceiptRef,
} from '../carrier.js';

describe('carrier types', () => {
  describe('ReceiptRef', () => {
    it('accepts valid sha256 template literal', () => {
      const ref: ReceiptRef =
        'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      expect(ref).toMatch(/^sha256:/);
    });

    it('is assignable from string with sha256 prefix', () => {
      const raw = 'sha256:abcd' as ReceiptRef;
      const _check: string = raw;
      expect(typeof _check).toBe('string');
    });
  });

  describe('CarrierFormat', () => {
    it('accepts embed', () => {
      const format: CarrierFormat = 'embed';
      expect(format).toBe('embed');
    });

    it('accepts reference', () => {
      const format: CarrierFormat = 'reference';
      expect(format).toBe('reference');
    });
  });

  describe('PeacEvidenceCarrier', () => {
    it('accepts minimal carrier (receipt_ref only)', () => {
      const carrier: PeacEvidenceCarrier = {
        receipt_ref: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      };
      expect(carrier.receipt_ref).toBeDefined();
      expect(carrier.receipt_jws).toBeUndefined();
    });

    it('accepts full carrier with all optional fields', () => {
      const carrier: PeacEvidenceCarrier = {
        receipt_ref: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        receipt_jws: 'eyJ.eyJ.sig',
        policy_binding: 'sha256:dead',
        actor_binding: 'did:key:z6Mk',
        request_nonce: 'nonce-123',
        verification_report_ref: 'sha256:cafe',
        use_policy_ref: 'https://example.com/policy',
        representation_ref: 'sha256:0123',
        attestation_ref: 'sha256:fedc',
      };
      expect(carrier.receipt_jws).toBe('eyJ.eyJ.sig');
      expect(carrier.policy_binding).toBe('sha256:dead');
      expect(carrier.actor_binding).toBe('did:key:z6Mk');
      expect(carrier.request_nonce).toBe('nonce-123');
      expect(carrier.verification_report_ref).toBe('sha256:cafe');
      expect(carrier.use_policy_ref).toBe('https://example.com/policy');
      expect(carrier.representation_ref).toBe('sha256:0123');
      expect(carrier.attestation_ref).toBe('sha256:fedc');
    });
  });

  describe('CarrierMeta', () => {
    it('accepts valid meta with required fields', () => {
      const meta: CarrierMeta = {
        transport: 'mcp',
        format: 'embed',
        max_size: 65536,
      };
      expect(meta.transport).toBe('mcp');
      expect(meta.format).toBe('embed');
      expect(meta.max_size).toBe(65536);
      expect(meta.redaction).toBeUndefined();
    });

    it('accepts meta with redaction array', () => {
      const meta: CarrierMeta = {
        transport: 'a2a',
        format: 'embed',
        max_size: 65536,
        redaction: ['actor_binding', 'policy_binding'],
      };
      expect(meta.redaction).toEqual(['actor_binding', 'policy_binding']);
    });
  });

  describe('CarrierValidationResult', () => {
    it('accepts valid result', () => {
      const result: CarrierValidationResult = {
        valid: true,
        violations: [],
      };
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('accepts invalid result with violations', () => {
      const result: CarrierValidationResult = {
        valid: false,
        violations: ['size exceeded', 'invalid format'],
      };
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('CarrierAdapter interface', () => {
    it('can be implemented with concrete types', () => {
      // Verify the interface is implementable with concrete input/output types
      type TestInput = { metadata?: Record<string, unknown> };
      type TestOutput = { metadata?: Record<string, unknown> };

      const adapter: CarrierAdapter<TestInput, TestOutput> = {
        extract(input: TestInput) {
          if (!input.metadata) return null;
          return {
            receipts: [],
            meta: { transport: 'test', format: 'embed' as CarrierFormat, max_size: 65536 },
          };
        },
        attach(output: TestOutput, carriers: PeacEvidenceCarrier[]) {
          return { ...output, metadata: { carriers } };
        },
        validateConstraints(_carrier: PeacEvidenceCarrier, _meta: CarrierMeta) {
          return { valid: true, violations: [] };
        },
      };

      expect(adapter.extract({})).toBeNull();
      expect(adapter.extract({ metadata: {} })).toBeTruthy();

      const attached = adapter.attach({}, [
        { receipt_ref: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
      ]);
      expect(attached.metadata).toBeDefined();

      const validation = adapter.validateConstraints(
        { receipt_ref: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
        { transport: 'test', format: 'embed', max_size: 65536 }
      );
      expect(validation.valid).toBe(true);
    });
  });
});
