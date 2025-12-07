/**
 * Tests for SubjectProfile and SubjectProfileSnapshot schemas
 */

import { describe, it, expect } from 'vitest';
import {
  SubjectTypeSchema,
  SubjectProfileSchema,
  SubjectProfileSnapshotSchema,
} from '../src/validators';

describe('SubjectTypeSchema', () => {
  it('accepts "human"', () => {
    expect(SubjectTypeSchema.safeParse('human').success).toBe(true);
  });

  it('accepts "org"', () => {
    expect(SubjectTypeSchema.safeParse('org').success).toBe(true);
  });

  it('accepts "agent"', () => {
    expect(SubjectTypeSchema.safeParse('agent').success).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(SubjectTypeSchema.safeParse('bot').success).toBe(false);
    expect(SubjectTypeSchema.safeParse('').success).toBe(false);
    expect(SubjectTypeSchema.safeParse('HUMAN').success).toBe(false);
  });
});

describe('SubjectProfileSchema', () => {
  describe('valid cases', () => {
    it('accepts minimal human profile', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'user:alice@example.com',
        type: 'human',
      });
      expect(result.success).toBe(true);
    });

    it('accepts minimal org profile', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'org:acme-corp',
        type: 'org',
      });
      expect(result.success).toBe(true);
    });

    it('accepts minimal agent profile', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'agent:gpt-4-crawler',
        type: 'agent',
      });
      expect(result.success).toBe(true);
    });

    it('accepts profile with labels', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'user:bob',
        type: 'human',
        labels: ['premium', 'verified'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts profile with metadata', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'org:startup',
        type: 'org',
        metadata: { plan: 'enterprise', seats: 50 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts profile with all fields', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'agent:indexer-v2',
        type: 'agent',
        labels: ['crawler', 'indexer', 'trusted'],
        metadata: { version: '2.0', operator: 'search-co' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty labels array', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'user:empty-labels',
        type: 'human',
        labels: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid cases', () => {
    it('rejects missing id', () => {
      const result = SubjectProfileSchema.safeParse({
        type: 'human',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty id', () => {
      const result = SubjectProfileSchema.safeParse({
        id: '',
        type: 'human',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing type', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'user:alice',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid type', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'user:alice',
        type: 'robot',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty string in labels array', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'user:alice',
        type: 'human',
        labels: ['valid', ''],
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown fields (strict mode)', () => {
      const result = SubjectProfileSchema.safeParse({
        id: 'user:alice',
        type: 'human',
        unknownField: 'should fail',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('SubjectProfileSnapshotSchema', () => {
  const validSubject = {
    id: 'user:alice',
    type: 'human' as const,
  };

  describe('valid cases', () => {
    it('accepts minimal snapshot', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
        captured_at: '2025-01-15T10:30:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('accepts snapshot with source', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
        captured_at: '2025-01-15T10:30:00Z',
        source: 'idp:auth0',
      });
      expect(result.success).toBe(true);
    });

    it('accepts snapshot with version', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
        captured_at: '2025-01-15T10:30:00Z',
        version: '1.0',
      });
      expect(result.success).toBe(true);
    });

    it('accepts snapshot with all fields', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: {
          id: 'agent:crawler',
          type: 'agent',
          labels: ['trusted'],
          metadata: { tier: 'premium' },
        },
        captured_at: '2025-01-15T10:30:00.123Z',
        source: 'directory:ldap',
        version: '2.1',
      });
      expect(result.success).toBe(true);
    });

    it('accepts snapshot with milliseconds in timestamp', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
        captured_at: '2025-12-07T15:45:30.999Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid cases', () => {
    it('rejects missing subject', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        captured_at: '2025-01-15T10:30:00Z',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid subject', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: { id: 'user:alice' }, // missing type
        captured_at: '2025-01-15T10:30:00Z',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing captured_at', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty captured_at', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
        captured_at: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty source', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
        captured_at: '2025-01-15T10:30:00Z',
        source: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty version', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
        captured_at: '2025-01-15T10:30:00Z',
        version: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown fields (strict mode)', () => {
      const result = SubjectProfileSnapshotSchema.safeParse({
        subject: validSubject,
        captured_at: '2025-01-15T10:30:00Z',
        extra: 'should fail',
      });
      expect(result.success).toBe(false);
    });
  });
});
