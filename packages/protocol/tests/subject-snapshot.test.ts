/**
 * Subject Snapshot Tests (v0.9.17+)
 *
 * Golden tests for SubjectProfileSnapshot in receipts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issue } from '../src/issue';
import { SubjectProfileSnapshot } from '@peac/schema';

describe('Subject Snapshot', () => {
  // Store original console.warn
  const originalWarn = console.warn;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    console.warn = originalWarn;
  });

  describe('issue() with subject_snapshot', () => {
    it('should issue receipt without subject_snapshot (existing behavior)', async () => {
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

      // JWS should be present
      expect(result.jws.split('.')).toHaveLength(3);

      // No subject_snapshot should be returned
      expect(result.subject_snapshot).toBeUndefined();
    });

    it('should issue receipt with human subject_snapshot', async () => {
      const { privateKey } = await generateKeypair();

      const snapshot: SubjectProfileSnapshot = {
        subject: {
          id: 'user:abc123',
          type: 'human',
          labels: ['premium', 'verified'],
        },
        captured_at: '2025-01-15T10:30:00Z',
        source: 'idp:auth0',
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
        subject_snapshot: snapshot,
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      // JWS should be present
      expect(result.jws.split('.')).toHaveLength(3);

      // Validated subject_snapshot should be returned
      expect(result.subject_snapshot).toEqual(snapshot);
    });

    it('should issue receipt with org subject_snapshot', async () => {
      const { privateKey } = await generateKeypair();

      const snapshot: SubjectProfileSnapshot = {
        subject: {
          id: 'org:acme-corp',
          type: 'org',
          labels: ['enterprise'],
        },
        captured_at: '2025-01-15T10:30:00Z',
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
        subject_snapshot: snapshot,
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      expect(result.subject_snapshot).toEqual(snapshot);
    });

    it('should issue receipt with agent subject_snapshot', async () => {
      const { privateKey } = await generateKeypair();

      const snapshot: SubjectProfileSnapshot = {
        subject: {
          id: 'agent:gpt-crawler-v2',
          type: 'agent',
          labels: ['crawler', 'indexer'],
        },
        captured_at: '2025-01-15T10:30:00Z',
        source: 'manual',
        version: '1.0',
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
        subject_snapshot: snapshot,
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      expect(result.subject_snapshot).toEqual(snapshot);
    });

    it('should reject invalid subject_snapshot (missing id)', async () => {
      const { privateKey } = await generateKeypair();

      const invalidSnapshot = {
        subject: {
          // id is missing
          type: 'human',
        },
        captured_at: '2025-01-15T10:30:00Z',
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
          subject_snapshot: invalidSnapshot as SubjectProfileSnapshot,
          privateKey,
          kid: '2025-01-15T10:30:00Z',
        })
      ).rejects.toThrow();
    });

    it('should reject invalid subject_snapshot (missing type)', async () => {
      const { privateKey } = await generateKeypair();

      const invalidSnapshot = {
        subject: {
          id: 'user:abc123',
          // type is missing
        },
        captured_at: '2025-01-15T10:30:00Z',
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
          subject_snapshot: invalidSnapshot as SubjectProfileSnapshot,
          privateKey,
          kid: '2025-01-15T10:30:00Z',
        })
      ).rejects.toThrow();
    });

    it('should log advisory PII warning for email-like subject id', async () => {
      const { privateKey } = await generateKeypair();

      const snapshot: SubjectProfileSnapshot = {
        subject: {
          id: 'john@example.com', // Looks like PII
          type: 'human',
        },
        captured_at: '2025-01-15T10:30:00Z',
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
        subject_snapshot: snapshot,
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      // Should still succeed
      expect(result.subject_snapshot).toEqual(snapshot);

      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('looks like PII'));
    });

    it('should not log duplicate PII warnings for same subject id', async () => {
      const { privateKey } = await generateKeypair();

      const snapshot: SubjectProfileSnapshot = {
        subject: {
          id: 'duplicate@example.com', // Looks like PII
          type: 'human',
        },
        captured_at: '2025-01-15T10:30:00Z',
      };

      // Issue twice with the same PII-like id
      await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: 'cs_123456',
        asset: 'USD',
        env: 'test',
        evidence: { session_id: 'cs_123456' },
        subject_snapshot: snapshot,
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      await issue({
        iss: 'https://api.example.com',
        aud: 'https://app.example.com',
        amt: 9999,
        cur: 'USD',
        rail: 'stripe',
        reference: 'cs_123456',
        asset: 'USD',
        env: 'test',
        evidence: { session_id: 'cs_123456' },
        subject_snapshot: snapshot,
        privateKey,
        kid: '2025-01-15T10:30:00Z',
      });

      // Warning should only be logged once (deduplicated)
      const piiWarnings = warnSpy.mock.calls.filter((call) =>
        call[0].includes('duplicate@example.com')
      );
      expect(piiWarnings).toHaveLength(1);
    });
  });
});
