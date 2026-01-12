/**
 * Generate deterministic bundle vectors for conformance testing.
 *
 * This script generates ZIP fixtures with real Ed25519 signatures
 * and expected verification report hashes. It uses:
 * - Deterministic keys derived from SHA-256 seeds
 * - Fixed timestamps for reproducibility
 *
 * Usage: npx tsx scripts/generate-bundle-vectors.ts
 *
 * CI should run this and assert `git diff --exit-code` to detect drift.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// Import from built packages using relative paths to dist
const cryptoModule = require('../packages/crypto/dist/index.js') as {
  sign: (payload: unknown, privateKey: Uint8Array, kid: string) => Promise<string>;
  canonicalize: (obj: unknown) => string;
};

// Import test-only utilities from testkit (separate export for tree-shaking)
const testkitModule = require('../packages/crypto/dist/testkit.js') as {
  generateKeypairFromSeed: (
    seed: Uint8Array
  ) => Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }>;
};

const auditModule = require('../packages/audit/dist/index.js') as {
  createDisputeBundle: (options: CreateDisputeBundleOptions) => Promise<BundleResult<Buffer>>;
  verifyBundle: (
    zip: Buffer,
    options: { offline: boolean }
  ) => Promise<BundleResult<VerificationReport>>;
  serializeReport: (report: VerificationReport, pretty?: boolean) => string;
};

const { sign, canonicalize } = cryptoModule;
const { generateKeypairFromSeed } = testkitModule;
const { createDisputeBundle, verifyBundle } = auditModule;

// Type definitions
interface BundleError {
  code: string;
  message: string;
}

type BundleResult<T> = { ok: true; value: T } | { ok: false; error: BundleError };

interface VerificationReport {
  report_hash: string;
  summary: {
    total_receipts: number;
    valid: number;
    invalid: number;
  };
}

interface JsonWebKeySet {
  keys: Array<{
    kty: string;
    kid: string;
    alg: string;
    crv: string;
    x: string;
    use: string;
  }>;
}

interface CreateDisputeBundleOptions {
  dispute_ref: string;
  created_by: string;
  receipts: string[];
  keys: JsonWebKeySet;
  bundle_id?: string;
  created_at?: string;
  policy?: string;
  signing_key?: Uint8Array;
  signing_kid?: string;
}

const VECTORS_DIR = path.join(__dirname, '../specs/conformance/fixtures/bundle/vectors');
const EXPECTED_DIR = path.join(__dirname, '../specs/conformance/fixtures/bundle/expected');

// Fixed timestamps for determinism (NEVER change these)
const FIXED_CREATED_AT = '2026-01-10T12:00:00.000Z';
const FIXED_ISSUED_AT_1 = '2026-01-09T10:00:00.000Z';
const FIXED_ISSUED_AT_2 = '2026-01-09T11:00:00.000Z';
const FIXED_ISSUED_AT_3 = '2026-01-09T12:00:00.000Z';

// Fixed test IDs for determinism (NEVER change these)
// Note: These are fixed-format test IDs, not valid ULIDs. Real bundles use proper ULIDs.
const BUNDLE_ID_VALID = '01HQXG0000TESTBUNDLE001';
const BUNDLE_ID_INVALID_SIG = '01HQXG0000TESTBUNDLE004';

/**
 * Generate a deterministic 32-byte seed from a string.
 * This is the foundation for reproducible key generation.
 */
function seedFromString(seedString: string): Uint8Array {
  const hash = createHash('sha256').update(seedString).digest();
  return new Uint8Array(hash);
}

function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function publicKeyToJwk(
  publicKey: Uint8Array,
  kid: string
): {
  kty: string;
  kid: string;
  alg: string;
  crv: string;
  x: string;
  use: string;
} {
  return {
    kty: 'OKP',
    kid,
    alg: 'EdDSA',
    crv: 'Ed25519',
    x: base64urlEncode(publicKey),
    use: 'sig',
  };
}

interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

async function createSignedReceipt(
  jti: string,
  iatIso: string,
  privateKey: Uint8Array,
  kid: string
): Promise<string> {
  const iatUnix = Math.floor(new Date(iatIso).getTime() / 1000);
  const payload = {
    jti,
    iat: iatUnix,
    iss: 'https://issuer.example.com',
    sub: 'https://subject.example.com/resource',
    amt: 1000,
    cur: 'USD',
  };
  return sign(payload, privateKey, kid);
}

async function generateValidMinimalBundle(
  key1: KeyPair
): Promise<{ zip: Buffer; expectedReportHash: string }> {
  const jwks: JsonWebKeySet = {
    keys: [publicKeyToJwk(key1.publicKey, 'key-001')],
  };

  const receipt1 = await createSignedReceipt(
    'receipt-001',
    FIXED_ISSUED_AT_1,
    key1.privateKey,
    'key-001'
  );

  const options: CreateDisputeBundleOptions = {
    dispute_ref: '01HQXG0000DISPUTE00001',
    created_by: 'https://auditor.example.com',
    receipts: [receipt1],
    keys: jwks,
    bundle_id: BUNDLE_ID_VALID,
    created_at: FIXED_CREATED_AT,
    signing_key: key1.privateKey,
    signing_kid: 'key-001',
  };

  const result = await createDisputeBundle(options);
  if (!result.ok) {
    throw new Error(`Failed to create valid bundle: ${result.error.message}`);
  }

  // Verify to get expected report hash
  const verifyResult = await verifyBundle(result.value, { offline: true });
  if (!verifyResult.ok) {
    throw new Error(`Valid bundle failed verification: ${verifyResult.error.message}`);
  }

  return {
    zip: result.value,
    expectedReportHash: verifyResult.value.report_hash,
  };
}

async function generateMultiReceiptBundle(
  key1: KeyPair,
  key2: KeyPair
): Promise<{ zip: Buffer; expectedReportHash: string }> {
  const jwks: JsonWebKeySet = {
    keys: [publicKeyToJwk(key1.publicKey, 'key-001'), publicKeyToJwk(key2.publicKey, 'key-002')],
  };

  const receipt1 = await createSignedReceipt(
    'receipt-001',
    FIXED_ISSUED_AT_1,
    key1.privateKey,
    'key-001'
  );
  const receipt2 = await createSignedReceipt(
    'receipt-002',
    FIXED_ISSUED_AT_2,
    key2.privateKey,
    'key-002'
  );
  const receipt3 = await createSignedReceipt(
    'receipt-003',
    FIXED_ISSUED_AT_3,
    key1.privateKey,
    'key-001'
  );

  const options: CreateDisputeBundleOptions = {
    dispute_ref: '01HQXG0000DISPUTE00002',
    created_by: 'https://enterprise.example.com',
    receipts: [receipt1, receipt2, receipt3],
    keys: jwks,
    bundle_id: '01HQXG0000TESTBUNDLE005',
    created_at: FIXED_CREATED_AT,
    signing_key: key1.privateKey,
    signing_kid: 'key-001',
  };

  const result = await createDisputeBundle(options);
  if (!result.ok) {
    throw new Error(`Failed to create multi-receipt bundle: ${result.error.message}`);
  }

  const verifyResult = await verifyBundle(result.value, { offline: true });
  if (!verifyResult.ok) {
    throw new Error(`Multi-receipt bundle failed verification: ${verifyResult.error.message}`);
  }

  return {
    zip: result.value,
    expectedReportHash: verifyResult.value.report_hash,
  };
}

async function generateInvalidSignatureBundle(
  key1: KeyPair,
  key2: KeyPair
): Promise<{ zip: Buffer; expectedError: string }> {
  // Create a bundle where receipts are signed with key2 but bundle claims key1
  const jwks: JsonWebKeySet = {
    keys: [publicKeyToJwk(key1.publicKey, 'key-001')], // Only key1 in JWKS
  };

  // Sign with key2 but claim it's key-001
  const receipt1 = await createSignedReceipt(
    'receipt-001',
    FIXED_ISSUED_AT_1,
    key2.privateKey, // Wrong key!
    'key-001' // Claims to be key-001
  );

  const options: CreateDisputeBundleOptions = {
    dispute_ref: '01HQXG0000DISPUTE00003',
    created_by: 'https://auditor.example.com',
    receipts: [receipt1],
    keys: jwks,
    bundle_id: BUNDLE_ID_INVALID_SIG,
    created_at: FIXED_CREATED_AT,
  };

  const result = await createDisputeBundle(options);
  if (!result.ok) {
    throw new Error(`Failed to create invalid-sig bundle: ${result.error.message}`);
  }

  return {
    zip: result.value,
    expectedError: 'E_RECEIPT_SIGNATURE_INVALID',
  };
}

async function generateMissingKeyBundle(
  key1: KeyPair,
  key2: KeyPair
): Promise<{ zip: Buffer; expectedError: string }> {
  // Receipt signed with key2, but only key1 in JWKS
  const jwks: JsonWebKeySet = {
    keys: [publicKeyToJwk(key1.publicKey, 'key-001')],
  };

  const receipt1 = await createSignedReceipt(
    'receipt-001',
    FIXED_ISSUED_AT_1,
    key2.privateKey,
    'key-002' // References key-002 which is not in JWKS
  );

  const options: CreateDisputeBundleOptions = {
    dispute_ref: '01HQXG0000DISPUTE00004',
    created_by: 'https://auditor.example.com',
    receipts: [receipt1],
    keys: jwks,
    bundle_id: '01HQXG0000TESTBUNDLE006',
    created_at: FIXED_CREATED_AT,
  };

  const result = await createDisputeBundle(options);
  if (!result.ok) {
    throw new Error(`Failed to create missing-key bundle: ${result.error.message}`);
  }

  return {
    zip: result.value,
    expectedError: 'E_BUNDLE_KEY_MISSING',
  };
}

/**
 * Create a raw malicious ZIP with a path traversal entry.
 * Uses low-level ZIP construction to bypass library validation.
 * Used to test security hardening - NOT created via createDisputeBundle.
 */
async function generatePathTraversalBundle(
  _key1: KeyPair,
  traversalPath: string
): Promise<{ zip: Buffer; expectedError: string }> {
  const zlib = require('zlib') as typeof import('zlib');

  // Helper to create a DOS timestamp from a Date
  function dosTime(date: Date): { time: number; date: number } {
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = Math.floor(date.getUTCSeconds() / 2);
    const time = (hours << 11) | (minutes << 5) | seconds;

    const year = date.getUTCFullYear() - 1980;
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const dateVal = (year << 9) | (month << 5) | day;

    return { time, date: dateVal };
  }

  // Helper to compute CRC32
  function crc32(data: Buffer): number {
    const crcTable: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const mtime = new Date(FIXED_CREATED_AT);
  const { time: dosTimeVal, date: dosDateVal } = dosTime(mtime);

  // Create manifest content
  const manifest = {
    version: 'peac.dispute-bundle/0.1',
    bundle_id: '01HQXG0000PATHTRAVERSE',
    dispute_ref: '01HQXG0000DISPUTE00005',
    created_by: 'https://attacker.example.com',
    created_at: FIXED_CREATED_AT,
    time_range: { start: FIXED_ISSUED_AT_1, end: FIXED_ISSUED_AT_1 },
    receipts: [],
    keys: [],
    files: [],
    content_hash: 'sha256:placeholder',
  };

  const manifestName = 'manifest.json';
  const manifestContent = Buffer.from(JSON.stringify(manifest, null, 2));
  const manifestCompressed = zlib.deflateRawSync(manifestContent);
  const manifestCrc = crc32(manifestContent);

  const maliciousName = traversalPath;
  const maliciousContent = Buffer.from('malicious content\n');
  const maliciousCompressed = zlib.deflateRawSync(maliciousContent);
  const maliciousCrc = crc32(maliciousContent);

  // Build ZIP structure manually
  const files = [
    {
      name: manifestName,
      content: manifestContent,
      compressed: manifestCompressed,
      crc: manifestCrc,
    },
    {
      name: maliciousName,
      content: maliciousContent,
      compressed: maliciousCompressed,
      crc: maliciousCrc,
    },
  ];

  const chunks: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(8, 8); // Compression method (deflate)
    localHeader.writeUInt16LE(dosTimeVal, 10); // Last mod file time
    localHeader.writeUInt16LE(dosDateVal, 12); // Last mod file date
    localHeader.writeUInt32LE(file.crc, 14); // CRC-32
    localHeader.writeUInt32LE(file.compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(file.content.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuffer.copy(localHeader, 30);

    chunks.push(localHeader);
    chunks.push(file.compressed);

    // Central directory entry
    const centralEntry = Buffer.alloc(46 + nameBuffer.length);
    centralEntry.writeUInt32LE(0x02014b50, 0); // Central file header signature
    centralEntry.writeUInt16LE(20, 4); // Version made by
    centralEntry.writeUInt16LE(20, 6); // Version needed to extract
    centralEntry.writeUInt16LE(0, 8); // General purpose bit flag
    centralEntry.writeUInt16LE(8, 10); // Compression method
    centralEntry.writeUInt16LE(dosTimeVal, 12); // Last mod file time
    centralEntry.writeUInt16LE(dosDateVal, 14); // Last mod file date
    centralEntry.writeUInt32LE(file.crc, 16); // CRC-32
    centralEntry.writeUInt32LE(file.compressed.length, 20); // Compressed size
    centralEntry.writeUInt32LE(file.content.length, 24); // Uncompressed size
    centralEntry.writeUInt16LE(nameBuffer.length, 28); // File name length
    centralEntry.writeUInt16LE(0, 30); // Extra field length
    centralEntry.writeUInt16LE(0, 32); // File comment length
    centralEntry.writeUInt16LE(0, 34); // Disk number start
    centralEntry.writeUInt16LE(0, 36); // Internal file attributes
    centralEntry.writeUInt32LE(0, 38); // External file attributes
    centralEntry.writeUInt32LE(offset, 42); // Relative offset of local header
    nameBuffer.copy(centralEntry, 46);

    centralDir.push(centralEntry);
    offset += localHeader.length + file.compressed.length;
  }

  const centralDirBuffer = Buffer.concat(centralDir);
  const centralDirOffset = offset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(files.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralDirBuffer.length, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  chunks.push(centralDirBuffer);
  chunks.push(eocd);

  return {
    zip: Buffer.concat(chunks),
    expectedError: 'E_BUNDLE_PATH_TRAVERSAL',
  };
}

/**
 * Generate a bundle with duplicate receipts (same jti).
 * This tests E_BUNDLE_DUPLICATE_RECEIPT detection.
 */
async function generateDuplicateReceiptBundle(
  key1: KeyPair
): Promise<{ zip: Buffer; expectedError: string }> {
  const yazl = require('yazl') as typeof import('yazl');

  const jwks: JsonWebKeySet = {
    keys: [publicKeyToJwk(key1.publicKey, 'key-001')],
  };

  // Create two receipts with the SAME jti
  const receipt1 = await createSignedReceipt(
    'duplicate-receipt-id',
    FIXED_ISSUED_AT_1,
    key1.privateKey,
    'key-001'
  );
  const receipt2 = await createSignedReceipt(
    'duplicate-receipt-id', // Same jti!
    FIXED_ISSUED_AT_2,
    key1.privateKey,
    'key-001'
  );

  // Prepare file contents
  const receiptsNdjson = Buffer.from([receipt1, receipt2].join('\n') + '\n');
  const keysJson = Buffer.from(JSON.stringify(jwks, null, 2));

  // Compute file hashes
  const receiptsHash = createHash('sha256').update(receiptsNdjson).digest('hex');
  const keysHash = createHash('sha256').update(keysJson).digest('hex');

  // Build the ZIP manually to bypass createDisputeBundle's validation
  // Disable compression to ensure byte-identical output across platforms
  const mtime = new Date(FIXED_CREATED_AT);
  const zipOptions = { mtime, compress: false };
  const zipfile = new yazl.ZipFile();

  // Create manifest in the correct format WITHOUT content_hash first
  const manifestWithoutHash = {
    version: 'peac.dispute-bundle/0.1',
    bundle_id: '01HQXG0000DUPETEST001',
    dispute_ref: '01HQXG0000DISPUTE00006',
    created_by: 'https://auditor.example.com',
    created_at: FIXED_CREATED_AT,
    time_range: { start: FIXED_ISSUED_AT_1, end: FIXED_ISSUED_AT_2 },
    receipts: [
      {
        receipt_id: 'duplicate-receipt-id',
        issued_at: FIXED_ISSUED_AT_1,
        receipt_hash: createHash('sha256').update(receipt1).digest('hex'),
      },
      {
        receipt_id: 'duplicate-receipt-id', // Same receipt_id!
        issued_at: FIXED_ISSUED_AT_2,
        receipt_hash: createHash('sha256').update(receipt2).digest('hex'),
      },
    ],
    keys: [{ kid: 'key-001', alg: 'EdDSA' }],
    files: [
      { path: 'keys/keys.json', sha256: keysHash, size: keysJson.length },
      { path: 'receipts.ndjson', sha256: receiptsHash, size: receiptsNdjson.length },
    ],
  };

  // Compute content_hash = SHA-256 of JCS(manifest without content_hash)
  const contentHash = createHash('sha256').update(canonicalize(manifestWithoutHash)).digest('hex');

  const manifest = {
    ...manifestWithoutHash,
    content_hash: contentHash,
  };

  const manifestJson = Buffer.from(JSON.stringify(manifest, null, 2));
  zipfile.addBuffer(manifestJson, 'manifest.json', zipOptions);
  zipfile.addBuffer(receiptsNdjson, 'receipts.ndjson', zipOptions);
  zipfile.addBuffer(keysJson, 'keys/keys.json', zipOptions);

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    zipfile.outputStream
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => {
        resolve({
          zip: Buffer.concat(chunks),
          expectedError: 'E_BUNDLE_DUPLICATE_RECEIPT',
        });
      });
    zipfile.end();
  });
}

/**
 * Generate a bundle with a falsely large size claim in ZIP metadata.
 * This tests DoS protection that checks entry.uncompressedSize BEFORE decompressing.
 * The actual data is small but the ZIP metadata claims it's huge (>64MB limit).
 *
 * Security test: verifier should reject based on size claim without reading data.
 */
async function generateSizeExceededBundle(): Promise<{ zip: Buffer; expectedError: string }> {
  const zlib = require('zlib') as typeof import('zlib');

  // Helper to create a DOS timestamp
  function dosTime(date: Date): { time: number; date: number } {
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = Math.floor(date.getUTCSeconds() / 2);
    const time = (hours << 11) | (minutes << 5) | seconds;

    const year = date.getUTCFullYear() - 1980;
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const dateVal = (year << 9) | (month << 5) | day;

    return { time, date: dateVal };
  }

  // Helper to compute CRC32
  function crc32(data: Buffer): number {
    const crcTable: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const mtime = new Date(FIXED_CREATED_AT);
  const { time: dosTimeVal, date: dosDateVal } = dosTime(mtime);

  // Create valid manifest content (small)
  const manifest = {
    version: 'peac.dispute-bundle/0.1',
    bundle_id: '01HQXG0000SIZEEXCEED1',
    dispute_ref: '01HQXG0000DISPUTE00007',
    created_by: 'https://auditor.example.com',
    created_at: FIXED_CREATED_AT,
    time_range: { start: FIXED_ISSUED_AT_1, end: FIXED_ISSUED_AT_1 },
    receipts: [],
    keys: [],
    files: [],
    content_hash: 'sha256:placeholder',
  };

  const manifestName = 'manifest.json';
  const manifestContent = Buffer.from(JSON.stringify(manifest, null, 2));
  const manifestCompressed = zlib.deflateRawSync(manifestContent);
  const manifestCrc = crc32(manifestContent);

  // Malicious entry: small actual data but claims huge uncompressed size
  const maliciousName = 'receipts.ndjson';
  const maliciousContent = Buffer.from('small data\n');
  const maliciousCompressed = zlib.deflateRawSync(maliciousContent);
  const maliciousCrc = crc32(maliciousContent);
  // Claim 100MB uncompressed size (exceeds 64MB limit)
  const fakeUncompressedSize = 100 * 1024 * 1024;

  // Build ZIP structure
  const files = [
    {
      name: manifestName,
      compressed: manifestCompressed,
      crc: manifestCrc,
      uncompressedSize: manifestContent.length,
    },
    {
      name: maliciousName,
      compressed: maliciousCompressed,
      crc: maliciousCrc,
      uncompressedSize: fakeUncompressedSize, // LIE: claim 100MB
    },
  ];

  const chunks: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(8, 8); // Compression method (deflate)
    localHeader.writeUInt16LE(dosTimeVal, 10); // Last mod file time
    localHeader.writeUInt16LE(dosDateVal, 12); // Last mod file date
    localHeader.writeUInt32LE(file.crc, 14); // CRC-32
    localHeader.writeUInt32LE(file.compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(file.uncompressedSize, 22); // Uncompressed size (may be fake!)
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuffer.copy(localHeader, 30);

    chunks.push(localHeader);
    chunks.push(file.compressed);

    // Central directory entry
    const centralEntry = Buffer.alloc(46 + nameBuffer.length);
    centralEntry.writeUInt32LE(0x02014b50, 0); // Central file header signature
    centralEntry.writeUInt16LE(20, 4); // Version made by
    centralEntry.writeUInt16LE(20, 6); // Version needed to extract
    centralEntry.writeUInt16LE(0, 8); // General purpose bit flag
    centralEntry.writeUInt16LE(8, 10); // Compression method
    centralEntry.writeUInt16LE(dosTimeVal, 12); // Last mod file time
    centralEntry.writeUInt16LE(dosDateVal, 14); // Last mod file date
    centralEntry.writeUInt32LE(file.crc, 16); // CRC-32
    centralEntry.writeUInt32LE(file.compressed.length, 20); // Compressed size
    centralEntry.writeUInt32LE(file.uncompressedSize, 24); // Uncompressed size (may be fake!)
    centralEntry.writeUInt16LE(nameBuffer.length, 28); // File name length
    centralEntry.writeUInt16LE(0, 30); // Extra field length
    centralEntry.writeUInt16LE(0, 32); // File comment length
    centralEntry.writeUInt16LE(0, 34); // Disk number start
    centralEntry.writeUInt16LE(0, 36); // Internal file attributes
    centralEntry.writeUInt32LE(0, 38); // External file attributes
    centralEntry.writeUInt32LE(offset, 42); // Relative offset of local header
    nameBuffer.copy(centralEntry, 46);

    centralDir.push(centralEntry);
    offset += localHeader.length + file.compressed.length;
  }

  const centralDirBuffer = Buffer.concat(centralDir);
  const centralDirOffset = offset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(files.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralDirBuffer.length, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  chunks.push(centralDirBuffer);
  chunks.push(eocd);

  return {
    zip: Buffer.concat(chunks),
    expectedError: 'E_BUNDLE_SIZE_EXCEEDED',
  };
}

async function main() {
  console.log('Generating bundle conformance vectors...\n');

  // Ensure directories exist
  fs.mkdirSync(VECTORS_DIR, { recursive: true });
  fs.mkdirSync(EXPECTED_DIR, { recursive: true });

  // Generate deterministic keys from fixed seeds
  // These seeds MUST NEVER change to maintain reproducibility
  console.log('Generating deterministic keys from seeds...');
  const key1 = await generateKeypairFromSeed(seedFromString('peac-conformance-key-001'));
  const key2 = await generateKeypairFromSeed(seedFromString('peac-conformance-key-002'));

  // Generate valid minimal bundle
  console.log('Generating valid_minimal.zip...');
  const validMinimal = await generateValidMinimalBundle(key1);
  fs.writeFileSync(path.join(VECTORS_DIR, 'valid_minimal.zip'), validMinimal.zip);
  fs.writeFileSync(
    path.join(EXPECTED_DIR, 'valid_minimal.report_hash.txt'),
    validMinimal.expectedReportHash + '\n'
  );

  // Generate multi-receipt bundle
  console.log('Generating valid_multi_receipt.zip...');
  const validMulti = await generateMultiReceiptBundle(key1, key2);
  fs.writeFileSync(path.join(VECTORS_DIR, 'valid_multi_receipt.zip'), validMulti.zip);
  fs.writeFileSync(
    path.join(EXPECTED_DIR, 'valid_multi_receipt.report_hash.txt'),
    validMulti.expectedReportHash + '\n'
  );

  // Generate invalid signature bundle
  console.log('Generating invalid_signature.zip...');
  const invalidSig = await generateInvalidSignatureBundle(key1, key2);
  fs.writeFileSync(path.join(VECTORS_DIR, 'invalid_signature.zip'), invalidSig.zip);
  fs.writeFileSync(
    path.join(EXPECTED_DIR, 'invalid_signature.expected_error.txt'),
    invalidSig.expectedError + '\n'
  );

  // Generate missing key bundle
  console.log('Generating missing_key.zip...');
  const missingKey = await generateMissingKeyBundle(key1, key2);
  fs.writeFileSync(path.join(VECTORS_DIR, 'missing_key.zip'), missingKey.zip);
  fs.writeFileSync(
    path.join(EXPECTED_DIR, 'missing_key.expected_error.txt'),
    missingKey.expectedError + '\n'
  );

  // =====================================================================
  // Security vectors - malicious bundles that should be rejected
  // =====================================================================

  // Generate path traversal bundle (Unix-style: ../)
  console.log('Generating path_traversal_unix.zip...');
  const pathTraversalUnix = await generatePathTraversalBundle(key1, '../../../etc/passwd');
  fs.writeFileSync(path.join(VECTORS_DIR, 'path_traversal_unix.zip'), pathTraversalUnix.zip);
  fs.writeFileSync(
    path.join(EXPECTED_DIR, 'path_traversal_unix.expected_error.txt'),
    pathTraversalUnix.expectedError + '\n'
  );

  // Generate path traversal bundle (Windows-style: ..\)
  console.log('Generating path_traversal_windows.zip...');
  const pathTraversalWin = await generatePathTraversalBundle(
    key1,
    '..\\..\\windows\\system32\\config'
  );
  fs.writeFileSync(path.join(VECTORS_DIR, 'path_traversal_windows.zip'), pathTraversalWin.zip);
  fs.writeFileSync(
    path.join(EXPECTED_DIR, 'path_traversal_windows.expected_error.txt'),
    pathTraversalWin.expectedError + '\n'
  );

  // Generate duplicate receipt bundle
  console.log('Generating duplicate_receipt.zip...');
  const duplicateReceipt = await generateDuplicateReceiptBundle(key1);
  fs.writeFileSync(path.join(VECTORS_DIR, 'duplicate_receipt.zip'), duplicateReceipt.zip);
  fs.writeFileSync(
    path.join(EXPECTED_DIR, 'duplicate_receipt.expected_error.txt'),
    duplicateReceipt.expectedError + '\n'
  );

  // Generate size exceeded bundle (uses false size claim, not actual large data)
  console.log('Generating size_exceeded.zip...');
  const sizeExceeded = await generateSizeExceededBundle();
  fs.writeFileSync(path.join(VECTORS_DIR, 'size_exceeded.zip'), sizeExceeded.zip);
  fs.writeFileSync(
    path.join(EXPECTED_DIR, 'size_exceeded.expected_error.txt'),
    sizeExceeded.expectedError + '\n'
  );

  // Generate manifest of all vectors (NO volatile timestamps)
  const manifest = {
    version: '0.9.30',
    description: 'PEAC Dispute Bundle conformance vectors',
    vectors: [
      // Valid bundles
      {
        vector_id: 'valid_minimal',
        file: 'valid_minimal.zip',
        expected_valid: true,
        expected_report_hash_file: 'valid_minimal.report_hash.txt',
      },
      {
        vector_id: 'valid_multi_receipt',
        file: 'valid_multi_receipt.zip',
        expected_valid: true,
        expected_report_hash_file: 'valid_multi_receipt.report_hash.txt',
      },
      // Invalid bundles (verification errors)
      {
        vector_id: 'invalid_signature',
        file: 'invalid_signature.zip',
        expected_valid: false,
        expected_receipt_error: 'E_RECEIPT_SIGNATURE_INVALID',
        expected_error_file: 'invalid_signature.expected_error.txt',
      },
      {
        vector_id: 'missing_key',
        file: 'missing_key.zip',
        expected_valid: false,
        expected_receipt_error: 'E_BUNDLE_KEY_MISSING',
        expected_error_file: 'missing_key.expected_error.txt',
      },
      // Security vectors (malicious bundles)
      {
        vector_id: 'path_traversal_unix',
        file: 'path_traversal_unix.zip',
        expected_valid: false,
        expected_error: 'E_BUNDLE_PATH_TRAVERSAL',
        expected_error_file: 'path_traversal_unix.expected_error.txt',
        description: 'Zip-slip attack with Unix-style path (../)',
      },
      {
        vector_id: 'path_traversal_windows',
        file: 'path_traversal_windows.zip',
        expected_valid: false,
        expected_error: 'E_BUNDLE_PATH_TRAVERSAL',
        expected_error_file: 'path_traversal_windows.expected_error.txt',
        description: 'Zip-slip attack with Windows-style path (..\\)',
      },
      {
        vector_id: 'duplicate_receipt',
        file: 'duplicate_receipt.zip',
        expected_valid: false,
        expected_error: 'E_BUNDLE_DUPLICATE_RECEIPT',
        expected_error_file: 'duplicate_receipt.expected_error.txt',
        description: 'Bundle with two receipts having the same jti',
      },
      {
        vector_id: 'size_exceeded',
        file: 'size_exceeded.zip',
        expected_valid: false,
        expected_error: 'E_BUNDLE_SIZE_EXCEEDED',
        expected_error_file: 'size_exceeded.expected_error.txt',
        description: 'DoS attack with falsely large uncompressed size claim in ZIP metadata',
      },
    ],
  };

  fs.writeFileSync(
    path.join(VECTORS_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  console.log('\nGenerated vectors:');
  console.log('  vectors/valid_minimal.zip');
  console.log('  vectors/valid_multi_receipt.zip');
  console.log('  vectors/invalid_signature.zip');
  console.log('  vectors/missing_key.zip');
  console.log('  vectors/path_traversal_unix.zip');
  console.log('  vectors/path_traversal_windows.zip');
  console.log('  vectors/duplicate_receipt.zip');
  console.log('  vectors/size_exceeded.zip');
  console.log('  vectors/manifest.json');
  console.log('\nExpected outputs in expected/');
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error generating vectors:', err);
  process.exit(1);
});
