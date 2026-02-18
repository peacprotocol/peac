import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadPolicy,
  getDefaultPolicy,
  computePolicyHash,
  PolicySchema,
} from '../../src/infra/policy.js';
import { PolicyLoadError } from '../../src/infra/errors.js';

describe('infra/policy', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'peac-policy-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('getDefaultPolicy', () => {
    it('returns a valid policy config', () => {
      const policy = getDefaultPolicy();
      expect(policy.version).toBe('1');
      expect(policy.allow_network).toBe(false);
      expect(policy.limits.max_jws_bytes).toBe(16_384);
      expect(policy.limits.max_concurrency).toBe(10);
    });

    it('passes schema validation', () => {
      const result = PolicySchema.safeParse(getDefaultPolicy());
      expect(result.success).toBe(true);
    });

    it('returns deep copy (mutations do not affect subsequent calls)', () => {
      const first = getDefaultPolicy();
      first.redaction.strip_payment = true;

      const second = getDefaultPolicy();
      expect(second.redaction.strip_payment).toBe(false);
    });
  });

  describe('loadPolicy', () => {
    it('loads a valid policy file', async () => {
      const policy = { version: '1', allow_network: true };
      const filePath = join(tmpDir, 'policy.json');
      await writeFile(filePath, JSON.stringify(policy));

      const loaded = await loadPolicy(filePath);
      expect(loaded.policy.version).toBe('1');
      expect(loaded.policy.allow_network).toBe(true);
      expect(loaded.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('applies defaults for missing fields', async () => {
      const filePath = join(tmpDir, 'minimal.json');
      await writeFile(filePath, JSON.stringify({ version: '1' }));

      const loaded = await loadPolicy(filePath);
      expect(loaded.policy.redaction.strip_evidence).toBe(false);
      expect(loaded.policy.limits.max_jws_bytes).toBe(16_384);
    });

    it('throws PolicyLoadError for non-existent file', async () => {
      await expect(loadPolicy('/nonexistent/path/policy.json')).rejects.toThrow(PolicyLoadError);
    });

    it('throws PolicyLoadError for invalid JSON', async () => {
      const filePath = join(tmpDir, 'bad.json');
      await writeFile(filePath, 'not json');

      await expect(loadPolicy(filePath)).rejects.toThrow(PolicyLoadError);
    });

    it('throws PolicyLoadError for invalid schema', async () => {
      const filePath = join(tmpDir, 'invalid.json');
      await writeFile(filePath, JSON.stringify({ version: '99' }));

      await expect(loadPolicy(filePath)).rejects.toThrow(PolicyLoadError);
    });

    it('produces stable hash for same content', async () => {
      const content = JSON.stringify({ version: '1' });
      const filePath = join(tmpDir, 'stable.json');
      await writeFile(filePath, content);

      const loaded1 = await loadPolicy(filePath);
      const loaded2 = await loadPolicy(filePath);
      expect(loaded1.hash).toBe(loaded2.hash);
    });
  });

  describe('computePolicyHash', () => {
    it('returns a hex SHA-256 hash from string input', async () => {
      const hash = await computePolicyHash('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('accepts PolicyConfig object directly', async () => {
      const hash = await computePolicyHash(getDefaultPolicy());
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('default policy hash is stable across calls', async () => {
      const hash1 = await computePolicyHash(getDefaultPolicy());
      const hash2 = await computePolicyHash(getDefaultPolicy());
      expect(hash1).toBe(hash2);
    });

    it('materialized policy hash matches loadPolicy hash', async () => {
      // Write a minimal policy file with only version -- loadPolicy fills defaults
      const filePath = join(tmpDir, 'hash-match.json');
      await writeFile(filePath, JSON.stringify({ version: '1' }));

      const loaded = await loadPolicy(filePath);
      // loadPolicy now hashes the materialized config, not the raw file content
      const directHash = await computePolicyHash(loaded.policy);
      expect(loaded.hash).toBe(directHash);
    });
  });
});
