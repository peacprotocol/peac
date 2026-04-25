/**
 * @peac/registries facade-identity invariant.
 *
 * The private @peac/registries package is a pure re-export FROM public
 * @peac/kernel. For every export, the constant referenced by the registries
 * facade MUST be the SAME object (===) as the one exported by @peac/kernel.
 *
 * This test catches accidental duplication / re-instantiation that would
 * silently break the "single source of truth" guarantee. If a contributor
 * copies a constant body into @peac/registries instead of re-exporting it,
 * this test fails.
 *
 * The test does NOT enforce that every kernel export appears in the facade
 * (the facade only re-groups verifier-context / adapter / extension /
 * proof+receipt subsets). It only enforces identity for the subset the
 * facade chooses to surface.
 */

import { describe, expect, it } from 'vitest';
import * as kernel from '@peac/kernel';
import * as registries from '../src/index.js';
import * as verifierCtx from '../src/verifier-context.js';
import * as adapters from '../src/adapters.js';
import * as extensions from '../src/extensions.js';
import * as proofsAndReceipts from '../src/proofs-and-receipts.js';

describe('@peac/registries: facade identity over @peac/kernel', () => {
  describe('verifier-context', () => {
    it.each([
      'VERIFIER_LIMITS',
      'VERIFIER_NETWORK',
      'PRIVATE_IP_RANGES',
      'VERIFIER_POLICY_VERSION',
      'VERIFICATION_MODES',
      'RECEIPT',
      'POLICY',
      'ISSUER_CONFIG',
      'DISCOVERY',
      'JWKS',
      'HEADERS',
    ])('verifier-context.%s === @peac/kernel.%s', (name) => {
      expect((verifierCtx as Record<string, unknown>)[name]).toBe(
        (kernel as unknown as Record<string, unknown>)[name]
      );
    });
  });

  describe('adapters', () => {
    it.each([
      'PAYMENT_RAILS',
      'CONTROL_ENGINES',
      'TRANSPORT_METHODS',
      'AGENT_PROTOCOLS',
      'findPaymentRail',
      'findControlEngine',
      'findTransportMethod',
      'findAgentProtocol',
    ])('adapters.%s === @peac/kernel.%s', (name) => {
      expect((adapters as Record<string, unknown>)[name]).toBe(
        (kernel as unknown as Record<string, unknown>)[name]
      );
    });
  });

  describe('extensions', () => {
    it.each([
      'EXTENSION_GROUPS',
      'EXTENSION_BUDGET',
      'TYPE_TO_EXTENSION_MAP',
      'findExtensionGroup',
    ])('extensions.%s === @peac/kernel.%s', (name) => {
      expect((extensions as Record<string, unknown>)[name]).toBe(
        (kernel as unknown as Record<string, unknown>)[name]
      );
    });
  });

  describe('proofs-and-receipts', () => {
    it.each(['PROOF_TYPES', 'RECEIPT_TYPES', 'PILLAR_VALUES', 'findProofType', 'findReceiptType'])(
      'proofsAndReceipts.%s === @peac/kernel.%s',
      (name) => {
        expect((proofsAndReceipts as Record<string, unknown>)[name]).toBe(
          (kernel as unknown as Record<string, unknown>)[name]
        );
      }
    );
  });

  describe('barrel REGISTRIES', () => {
    it('registries.REGISTRIES === @peac/kernel.REGISTRIES', () => {
      expect(registries.REGISTRIES).toBe(kernel.REGISTRIES);
    });
  });
});
