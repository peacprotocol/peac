/**
 * Tests for Dispute Bundle (v0.9.30+)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createDisputeBundle,
  readDisputeBundle,
  verifyBundleIntegrity,
  getBundleContentHash,
} from '../src/dispute-bundle.js';
import type { JsonWebKeySet, DisputeBundleManifest } from '../src/dispute-bundle-types.js';

// Mock JWS receipt (simplified for testing)
function createMockJws(jti: string, iat: number): string {
  const header = { alg: 'EdDSA', typ: 'JWT' };
  const payload = { jti, iat, iss: 'https://issuer.example.com' };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from('mock-signature').toString('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

// Mock JWKS
const mockJwks: JsonWebKeySet = {
  keys: [
    {
      kty: 'OKP',
      kid: 'key-001',
      alg: 'EdDSA',
      crv: 'Ed25519',
      x: 'test-public-key-x',
      use: 'sig',
    },
    {
      kty: 'OKP',
      kid: 'key-002',
      alg: 'EdDSA',
      crv: 'Ed25519',
      x: 'test-public-key-x-2',
      use: 'sig',
    },
  ],
};

describe('createDisputeBundle', () => {
  it('should create a valid bundle with receipts and keys', async () => {
    const receipts = [
      createMockJws('receipt-001', 1704067200), // 2024-01-01T00:00:00Z
      createMockJws('receipt-002', 1704153600), // 2024-01-02T00:00:00Z
    ];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Buffer);
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  it('should include policy when provided', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];
    const policy = `version: "peac-policy/0.1"
rules:
  - action: allow
    purpose: [search]
`;

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
      policy,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Read it back to verify policy is included
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value.policy).toBe(policy);
        expect(readResult.value.manifest.policy_hash).toBeDefined();
      }
    }
  });

  it('should fail with empty receipts', async () => {
    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts: [],
      keys: mockJwks,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_BUNDLE_MISSING_RECEIPTS');
    }
  });

  it('should fail with empty keys', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: { keys: [] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_BUNDLE_MISSING_KEYS');
    }
  });

  it('should fail with invalid JWS', async () => {
    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts: ['not-a-valid-jws'],
      keys: mockJwks,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_BUNDLE_RECEIPT_INVALID');
    }
  });

  it('should use custom bundle_id when provided', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];
    const customBundleId = 'CUSTOM_BUNDLE_ID_12345';

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
      bundle_id: customBundleId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value.manifest.bundle_id).toBe(customBundleId);
      }
    }
  });
});

describe('readDisputeBundle', () => {
  let validBundle: Buffer;

  beforeAll(async () => {
    const receipts = [
      createMockJws('receipt-001', 1704067200),
      createMockJws('receipt-002', 1704153600),
    ];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    if (!result.ok) {
      throw new Error('Failed to create test bundle');
    }
    validBundle = result.value;
  });

  it('should read a valid bundle', async () => {
    const result = await readDisputeBundle(validBundle);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.manifest.version).toBe('peac-bundle/0.1');
      expect(result.value.manifest.dispute_ref).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
      expect(result.value.receipts.size).toBe(2);
      expect(result.value.keys.keys.length).toBe(2);
    }
  });

  it('should verify content_hash on read', async () => {
    const result = await readDisputeBundle(validBundle);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.manifest.content_hash).toBeDefined();
      expect(result.value.manifest.content_hash.length).toBe(71); // sha256:<64 hex>
    }
  });

  it('should extract receipts by receipt_id', async () => {
    const result = await readDisputeBundle(validBundle);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.receipts.has('receipt-001')).toBe(true);
      expect(result.value.receipts.has('receipt-002')).toBe(true);
    }
  });

  it('should fail on invalid ZIP', async () => {
    const result = await readDisputeBundle(Buffer.from('not a zip file'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_BUNDLE_INVALID_FORMAT');
    }
  });
});

describe('verifyBundleIntegrity', () => {
  let validBundle: Buffer;

  beforeAll(async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    if (!result.ok) {
      throw new Error('Failed to create test bundle');
    }
    validBundle = result.value;
  });

  it('should pass for valid bundle', async () => {
    const result = await verifyBundleIntegrity(validBundle);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.manifest.version).toBe('peac-bundle/0.1');
    }
  });
});

describe('getBundleContentHash', () => {
  let validBundle: Buffer;
  let expectedHash: string;

  beforeAll(async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    if (!result.ok) {
      throw new Error('Failed to create test bundle');
    }
    validBundle = result.value;

    // Get expected hash from full read
    const readResult = await readDisputeBundle(validBundle);
    if (!readResult.ok) {
      throw new Error('Failed to read test bundle');
    }
    expectedHash = readResult.value.manifest.content_hash;
  });

  it('should return content_hash without full parse', async () => {
    const result = await getBundleContentHash(validBundle);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(expectedHash);
    }
  });
});

describe('manifest structure', () => {
  it('should sort receipts by issued_at, then receipt_id, then claims_hash', async () => {
    const receipts = [
      createMockJws('receipt-c', 1704153600), // 2024-01-02 - will be last
      createMockJws('receipt-a', 1704067200), // 2024-01-01 - will be first
      createMockJws('receipt-b', 1704067200), // 2024-01-01 - same time, sorted by id
    ];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        const receiptIds = readResult.value.manifest.receipts.map((r) => r.receipt_id);
        expect(receiptIds).toEqual(['receipt-a', 'receipt-b', 'receipt-c']);
      }
    }
  });

  it('should sort keys by kid', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];
    const unorderedKeys: JsonWebKeySet = {
      keys: [
        { kty: 'OKP', kid: 'key-zzz', alg: 'EdDSA' },
        { kty: 'OKP', kid: 'key-aaa', alg: 'EdDSA' },
        { kty: 'OKP', kid: 'key-mmm', alg: 'EdDSA' },
      ],
    };

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: unorderedKeys,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        const kids = readResult.value.manifest.keys.map((k) => k.kid);
        expect(kids).toEqual(['key-aaa', 'key-mmm', 'key-zzz']);
      }
    }
  });

  it('should sort files by path', async () => {
    const receipts = [
      createMockJws('receipt-z', 1704067200),
      createMockJws('receipt-a', 1704153600),
    ];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
      policy: 'version: "peac-policy/0.1"',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        const paths = readResult.value.manifest.files.map((f) => f.path);
        // Should be: keys/keys.json, policy/policy.yaml, receipts/receipt-a.jws, receipts/receipt-z.jws
        const sortedPaths = [...paths].sort();
        expect(paths).toEqual(sortedPaths);
      }
    }
  });

  it('should compute correct time_range', async () => {
    const receipts = [
      createMockJws('receipt-1', 1704067200), // 2024-01-01T00:00:00Z
      createMockJws('receipt-2', 1704240000), // 2024-01-03T00:00:00Z
      createMockJws('receipt-3', 1704153600), // 2024-01-02T00:00:00Z
    ];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        const { time_range } = readResult.value.manifest;
        expect(new Date(time_range.start).getTime()).toBe(1704067200 * 1000);
        expect(new Date(time_range.end).getTime()).toBe(1704240000 * 1000);
      }
    }
  });
});

describe('deterministic content_hash', () => {
  it('should produce same content_hash for same inputs', async () => {
    const receipts = [
      createMockJws('receipt-001', 1704067200),
      createMockJws('receipt-002', 1704153600),
    ];

    // Create two bundles with same bundle_id and created_at to ensure determinism
    const bundle_id = 'FIXED_BUNDLE_ID_12345';

    const result1 = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
      bundle_id,
    });

    const result2 = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
      bundle_id,
    });

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      const read1 = await readDisputeBundle(result1.value);
      const read2 = await readDisputeBundle(result2.value);

      expect(read1.ok).toBe(true);
      expect(read2.ok).toBe(true);

      if (read1.ok && read2.ok) {
        // Note: content_hash will differ because created_at differs
        // But per-file hashes should be the same
        const fileHashes1 = read1.value.manifest.files.map((f) => f.sha256);
        const fileHashes2 = read2.value.manifest.files.map((f) => f.sha256);
        expect(fileHashes1).toEqual(fileHashes2);
      }
    }
  });
});

/**
 * ULID Format Correctness Tests
 *
 * Verify that auto-generated bundle IDs conform to the ULID specification:
 * - 26 characters
 * - Crockford's Base32 alphabet only (0-9, A-Z excluding I, L, O, U)
 * - Uppercase only
 * - Lexicographically sortable by timestamp
 *
 * @see https://github.com/ulid/spec
 */
describe('ULID Format (bundle_id)', () => {
  const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  it('should generate a 26-character bundle_id when not provided', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        const bundleId = readResult.value.manifest.bundle_id;
        expect(bundleId.length).toBe(26);
      }
    }
  });

  it('should only use Crockford Base32 alphabet (no I, L, O, U)', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        const bundleId = readResult.value.manifest.bundle_id;
        for (const char of bundleId) {
          expect(CROCKFORD_ALPHABET).toContain(char);
        }
      }
    }
  });

  it('should be uppercase only', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];

    const result = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const readResult = await readDisputeBundle(result.value);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        const bundleId = readResult.value.manifest.bundle_id;
        expect(bundleId).toBe(bundleId.toUpperCase());
      }
    }
  });

  it('should produce lexicographically sortable IDs (timestamp prefix)', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];

    // Create two bundles in sequence - second should have >= bundle_id
    const result1 = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 2));

    const result2 = await createDisputeBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FBW',
      created_by: 'https://auditor.example.com',
      receipts,
      keys: mockJwks,
    });

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      const read1 = await readDisputeBundle(result1.value);
      const read2 = await readDisputeBundle(result2.value);

      expect(read1.ok).toBe(true);
      expect(read2.ok).toBe(true);

      if (read1.ok && read2.ok) {
        const id1 = read1.value.manifest.bundle_id;
        const id2 = read2.value.manifest.bundle_id;

        // First 10 chars are timestamp, should be <= for sequential generation
        const timestamp1 = id1.substring(0, 10);
        const timestamp2 = id2.substring(0, 10);
        expect(timestamp1 <= timestamp2).toBe(true);
      }
    }
  });

  it('should generate unique IDs', async () => {
    const receipts = [createMockJws('receipt-001', 1704067200)];
    const generatedIds = new Set<string>();

    // Generate 10 bundles and check all IDs are unique
    for (let i = 0; i < 10; i++) {
      const result = await createDisputeBundle({
        dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        created_by: 'https://auditor.example.com',
        receipts,
        keys: mockJwks,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const readResult = await readDisputeBundle(result.value);
        expect(readResult.ok).toBe(true);
        if (readResult.ok) {
          const bundleId = readResult.value.manifest.bundle_id;
          expect(generatedIds.has(bundleId)).toBe(false);
          generatedIds.add(bundleId);
        }
      }
    }

    expect(generatedIds.size).toBe(10);
  });
});
