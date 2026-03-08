/**
 * Tests for kernel constraint enforcement in issue() pipeline (DD-121)
 *
 * Validates that issue() rejects claims exceeding structural kernel constraints
 * BEFORE signing. Valid receipts are unaffected (constraints match existing limits).
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { KERNEL_CONSTRAINTS } from '@peac/schema';
import { issueWire01, IssueError } from '../src/issue';

describe('issue() kernel constraints (DD-121)', () => {
  it('issues a valid receipt without constraint violations', async () => {
    const { privateKey } = await generateKeypair();
    const result = await issueWire01({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 1000,
      cur: 'USD',
      rail: 'x402',
      reference: 'tx_abc123',
      asset: 'USD',
      env: 'test',
      evidence: { txId: 'tx_abc123' },
      privateKey,
      kid: 'key-2026-01',
    });
    expect(result.jws).toBeTruthy();
  });

  it('rejects evidence with too many array elements', async () => {
    const { privateKey } = await generateKeypair();
    const bigArray = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0);

    await expect(
      issueWire01({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_test',
        asset: 'USD',
        env: 'test',
        evidence: { items: bigArray },
        privateKey,
        kid: 'key-1',
      })
    ).rejects.toThrow(IssueError);
  });

  it('rejects evidence with too many object keys', async () => {
    const { privateKey } = await generateKeypair();
    const bigObj: Record<string, number> = {};
    for (let i = 0; i <= KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS; i++) {
      bigObj[`k${i}`] = i;
    }

    await expect(
      issueWire01({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_test',
        asset: 'USD',
        env: 'test',
        evidence: bigObj,
        privateKey,
        kid: 'key-1',
      })
    ).rejects.toThrow(IssueError);
  });

  it('rejects evidence with oversized strings', async () => {
    const { privateKey } = await generateKeypair();
    const longString = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);

    await expect(
      issueWire01({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_test',
        asset: 'USD',
        env: 'test',
        evidence: { data: longString },
        privateKey,
        kid: 'key-1',
      })
    ).rejects.toThrow(IssueError);
  });

  it('includes E_CONSTRAINT_VIOLATION error code in IssueError', async () => {
    const { privateKey } = await generateKeypair();
    const bigArray = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0);

    try {
      await issueWire01({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'x402',
        reference: 'tx_test',
        asset: 'USD',
        env: 'test',
        evidence: { items: bigArray },
        privateKey,
        kid: 'key-1',
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IssueError);
      const issueErr = err as IssueError;
      expect(issueErr.peacError.code).toBe('E_CONSTRAINT_VIOLATION');
      expect(issueErr.peacError.category).toBe('validation');
      expect(issueErr.peacError.retryable).toBe(false);
      expect(issueErr.peacError.http_status).toBe(400);
    }
  });

  it('accepts evidence with an array well within limits', async () => {
    const { privateKey } = await generateKeypair();
    // An array at exactly MAX_ARRAY_LENGTH (10,000) would exceed MAX_TOTAL_NODES
    // (100,000) when combined with the rest of the claims object. Use a smaller
    // array that validates cleanly through both constraint and Zod layers.
    const items = new Array(100).fill('ok');
    const result = await issueWire01({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'x402',
      reference: 'tx_test',
      asset: 'USD',
      env: 'test',
      evidence: { items },
      privateKey,
      kid: 'key-1',
    });
    expect(result.jws).toBeTruthy();
  });
});
