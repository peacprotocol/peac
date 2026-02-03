/**
 * @peac/capture-core - Exports Tests
 *
 * Verifies that the package exports are correctly configured.
 * This includes both the main entry point and the testkit subpath.
 *
 * IMPORTANT: This test uses package name imports (not relative imports)
 * to verify the actual package.json exports map behavior via PNPM resolution.
 */

import { describe, it, expect } from 'vitest';

// Main entry point exports - using package name import
import {
  GENESIS_DIGEST,
  SIZE_CONSTANTS,
  createHasher,
  createCaptureSession,
  toInteractionEvidence,
  toInteractionEvidenceBatch,
} from '@peac/capture-core';

// Testkit subpath exports - using package name import
import {
  createInMemorySpoolStore,
  createInMemoryDedupeIndex,
  InMemorySpoolStore,
  InMemoryDedupeIndex,
} from '@peac/capture-core/testkit';

describe('Package Exports', () => {
  describe('main entry point', () => {
    it('exports GENESIS_DIGEST constant', () => {
      expect(GENESIS_DIGEST).toBeDefined();
      expect(typeof GENESIS_DIGEST).toBe('string');
      expect(GENESIS_DIGEST).toMatch(/^[a-f0-9]{64}$/);
    });

    it('exports SIZE_CONSTANTS', () => {
      expect(SIZE_CONSTANTS).toBeDefined();
      expect(SIZE_CONSTANTS.TRUNC_64K).toBe(65536);
      expect(SIZE_CONSTANTS.TRUNC_1M).toBe(1048576);
    });

    it('exports createHasher factory', () => {
      expect(createHasher).toBeDefined();
      expect(typeof createHasher).toBe('function');

      const hasher = createHasher();
      expect(hasher).toBeDefined();
      expect(typeof hasher.digest).toBe('function');
      expect(typeof hasher.digestEntry).toBe('function');
    });

    it('exports createCaptureSession factory', () => {
      expect(createCaptureSession).toBeDefined();
      expect(typeof createCaptureSession).toBe('function');
    });

    it('exports toInteractionEvidence mapper', () => {
      expect(toInteractionEvidence).toBeDefined();
      expect(typeof toInteractionEvidence).toBe('function');
    });

    it('exports toInteractionEvidenceBatch mapper', () => {
      expect(toInteractionEvidenceBatch).toBeDefined();
      expect(typeof toInteractionEvidenceBatch).toBe('function');
    });
  });

  describe('testkit subpath', () => {
    it('exports createInMemorySpoolStore factory', () => {
      expect(createInMemorySpoolStore).toBeDefined();
      expect(typeof createInMemorySpoolStore).toBe('function');

      const store = createInMemorySpoolStore();
      expect(store).toBeDefined();
      expect(typeof store.append).toBe('function');
      expect(typeof store.getHeadDigest).toBe('function');
    });

    it('exports createInMemoryDedupeIndex factory', () => {
      expect(createInMemoryDedupeIndex).toBeDefined();
      expect(typeof createInMemoryDedupeIndex).toBe('function');

      const dedupe = createInMemoryDedupeIndex();
      expect(dedupe).toBeDefined();
      expect(typeof dedupe.has).toBe('function');
      expect(typeof dedupe.set).toBe('function');
    });

    it('exports InMemorySpoolStore class', () => {
      expect(InMemorySpoolStore).toBeDefined();
      expect(typeof InMemorySpoolStore).toBe('function');

      const store = new InMemorySpoolStore();
      expect(store).toBeInstanceOf(InMemorySpoolStore);
    });

    it('exports InMemoryDedupeIndex class', () => {
      expect(InMemoryDedupeIndex).toBeDefined();
      expect(typeof InMemoryDedupeIndex).toBe('function');

      const dedupe = new InMemoryDedupeIndex();
      expect(dedupe).toBeInstanceOf(InMemoryDedupeIndex);
    });
  });

  describe('testkit isolation', () => {
    it('testkit exports do not leak to main entry', async () => {
      // Import main entry point dynamically to check exports
      // Using package name to verify actual exports map
      const mainExports = await import('@peac/capture-core');

      // These should NOT be exported from main
      expect('InMemorySpoolStore' in mainExports).toBe(false);
      expect('InMemoryDedupeIndex' in mainExports).toBe(false);
      expect('createInMemorySpoolStore' in mainExports).toBe(false);
      expect('createInMemoryDedupeIndex' in mainExports).toBe(false);
    });
  });
});
