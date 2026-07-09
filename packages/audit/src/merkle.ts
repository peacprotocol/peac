/**
 * @peac/audit - Merkle commitment helpers for workflow receipt sets.
 *
 * Executes the deferred WORKFLOW-CORRELATION section 7 Merkle commitment as
 * deterministic, offline helpers. This is a CT-style Merkle Tree Hash following
 * the RFC 9162 section 2.1.1 formulas (RFC 9162 obsoletes RFC 6962), adapted as
 * a sorted-set commitment over PEAC `receipt_ref` digests. It is NOT a
 * Certificate Transparency append-only log and PEAC does not operate a log or
 * anchor these roots anywhere.
 *
 * Proves inclusion in the committed set; it does NOT prove chronology,
 * completeness, payment finality, payment validity, privacy, or legal validity.
 * Callers must still verify each PEAC record independently.
 *
 * Inputs are `receipt_ref` strings (`sha256:<hex64>`, DD-129) only. Callers that
 * start from compact JWS bytes use `@peac/schema` `computeReceiptRef(jws)` first;
 * this module does not re-implement digest computation.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { ReceiptRef } from '@peac/kernel';

/** Algorithm identifier for this sorted-set commitment construction. */
export const MERKLE_TREE_ALG = 'peac.merkle.ct-sorted-set-sha256-v1' as const;
/** Hash algorithm used for leaves and internal nodes. */
export const MERKLE_HASH_ALG = 'sha256' as const;

/**
 * A `sha256:<hex64>` digest reference. Shares its grammar with `ReceiptRef` but
 * carries different semantics (a Merkle hash, not a PEAC record reference).
 */
export type Sha256DigestRef = `sha256:${string}`;
/** A Merkle root digest (NOT a receipt reference). */
export type ReceiptMerkleRoot = Sha256DigestRef;
/** A Merkle inclusion-proof sibling hash (NOT a receipt reference). */
export type MerkleNodeHash = Sha256DigestRef;

/** Self-describing commitment over a sorted set of receipt references. */
export interface ReceiptMerkleCommitment {
  readonly tree_alg: typeof MERKLE_TREE_ALG;
  readonly hash_alg: typeof MERKLE_HASH_ALG;
  readonly root: ReceiptMerkleRoot;
  readonly tree_size: number;
}

/** Inclusion proof for a single receipt reference against a committed root. */
export interface ReceiptMerkleInclusionProof {
  readonly tree_alg: typeof MERKLE_TREE_ALG;
  readonly hash_alg: typeof MERKLE_HASH_ALG;
  /** Index of the target within the SORTED leaf order. */
  readonly leaf_index: number;
  readonly tree_size: number;
  /** Sibling path, leaf -> root order, each `sha256:<hex64>`. */
  readonly hashes: readonly MerkleNodeHash[];
}

export type MerkleInputErrorCode =
  | 'audit.merkle.empty_input'
  | 'audit.merkle.invalid_receipt_ref'
  | 'audit.merkle.duplicate_receipt_ref'
  | 'audit.merkle.target_not_found'
  | 'audit.merkle.invalid_commitment'
  | 'audit.merkle.invalid_merkle_root'
  | 'audit.merkle.invalid_proof'
  | 'audit.merkle.invalid_proof_hash'
  | 'audit.merkle.unsupported_tree_alg'
  | 'audit.merkle.unsupported_hash_alg';

/**
 * Thrown ONLY on malformed input (bad grammar, empty/duplicate input,
 * unsupported algorithm, out-of-range index, target not found). A well-formed
 * but cryptographically wrong proof returns `false` from
 * {@link verifyReceiptMerkleInclusion} and does not throw. These are
 * package-local errors; they are not kernel protocol errors.
 */
export class MerkleInputError extends Error {
  readonly code: MerkleInputErrorCode;
  constructor(code: MerkleInputErrorCode, message: string) {
    super(message);
    this.name = 'MerkleInputError';
    this.code = code;
  }
}

const DIGEST_REF_RE = /^sha256:[0-9a-f]{64}$/;
const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

function assertDigestRef(
  value: unknown,
  code: MerkleInputErrorCode,
  label: string
): asserts value is Sha256DigestRef {
  if (typeof value !== 'string' || !DIGEST_REF_RE.test(value)) {
    throw new MerkleInputError(
      code,
      `${label} must match sha256:<hex64> (lowercase); received ${describe(value)}`
    );
  }
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value.length > 74 ? `${value.slice(0, 71)}...` : value;
  return Object.prototype.toString.call(value);
}

/** Decode a validated `sha256:<hex64>` ref to its raw 32-byte digest. */
function decodeDigest(ref: Sha256DigestRef): Uint8Array {
  return Uint8Array.from(Buffer.from(ref.slice('sha256:'.length), 'hex'));
}

/** Encode a 32-byte digest as `sha256:<hex64>` (lowercase). */
function encodeDigest(bytes: Uint8Array): Sha256DigestRef {
  return `sha256:${Buffer.from(bytes).toString('hex')}` as Sha256DigestRef;
}

function sha256(...chunks: Uint8Array[]): Uint8Array {
  const h = createHash('sha256');
  for (const c of chunks) h.update(c);
  return Uint8Array.from(h.digest());
}

/** RFC 9162 leaf hash: SHA-256(0x00 || digest). */
function leafHash(digest: Uint8Array): Uint8Array {
  return sha256(Uint8Array.of(LEAF_PREFIX), digest);
}

/** RFC 9162 internal node hash: SHA-256(0x01 || left || right). */
function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(Uint8Array.of(NODE_PREFIX), left, right);
}

/** Largest power of two strictly smaller than n (n >= 2). */
function largestPow2LessThan(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// Integer helpers using arithmetic (not JS bitwise operators, which coerce to
// signed 32-bit). Tree sizes / indices are protocol integers bounded only by
// Number.isSafeInteger, so the RFC 9162 fold uses % 2 and Math.floor(n / 2).
function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isOdd(value: number): boolean {
  return value % 2 === 1;
}

function halve(value: number): number {
  return Math.floor(value / 2);
}

/**
 * RFC 9162 section 2.1.1 Merkle Tree Hash over `digests[start, end)`.
 * Range-based to avoid recursive array allocation.
 */
function merkleTreeHash(digests: readonly Uint8Array[], start: number, end: number): Uint8Array {
  const n = end - start;
  if (n === 1) return leafHash(digests[start]);
  const k = largestPow2LessThan(n);
  return nodeHash(
    merkleTreeHash(digests, start, start + k),
    merkleTreeHash(digests, start + k, end)
  );
}

/**
 * RFC 9162 section 2.1.3.1 inclusion path for the leaf at range-relative index
 * `m` over `digests[start, end)`. Returns sibling hashes in leaf -> root order.
 */
function inclusionPath(
  m: number,
  digests: readonly Uint8Array[],
  start: number,
  end: number
): Uint8Array[] {
  const n = end - start;
  if (n === 1) return [];
  const k = largestPow2LessThan(n);
  if (m < k) {
    return [
      ...inclusionPath(m, digests, start, start + k),
      merkleTreeHash(digests, start + k, end),
    ];
  }
  return [
    ...inclusionPath(m - k, digests, start + k, end),
    merkleTreeHash(digests, start, start + k),
  ];
}

/**
 * RFC 9162 section 2.1.3.2 inclusion-proof fold using fn = leaf_index and
 * sn = tree_size - 1. Returns the recomputed root, or null if the proof is
 * well-formed in shape but does not fold to a root (truncated / extra sibling).
 * NOTE: this is deliberately NOT a simplified perfect-tree bit-walk.
 */
function foldInclusionProof(
  leaf: Uint8Array,
  siblings: readonly Uint8Array[],
  leafIndex: number,
  treeSize: number
): Uint8Array | null {
  if (leafIndex >= treeSize) return null;
  let fn = leafIndex;
  let sn = treeSize - 1;
  let r = leaf;
  for (const p of siblings) {
    if (sn === 0) return null; // extra sibling beyond the path
    if (isOdd(fn) || fn === sn) {
      r = nodeHash(p, r);
      if (!isOdd(fn)) {
        while (!isOdd(fn) && fn !== 0) {
          fn = halve(fn);
          sn = halve(sn);
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn = halve(fn);
    sn = halve(sn);
  }
  return sn === 0 ? r : null; // sn != 0 => truncated path
}

/** Validate + decode + sort a receipt-ref set into deduplicated, sorted digests. */
function toSortedDigests(refs: readonly ReceiptRef[]): {
  sorted: Uint8Array[];
  sortedRefs: Sha256DigestRef[];
} {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new MerkleInputError(
      'audit.merkle.empty_input',
      'refs must be a non-empty array of sha256:<hex64> receipt refs'
    );
  }
  const seen = new Set<string>();
  const entries: { ref: Sha256DigestRef; digest: Uint8Array }[] = [];
  for (const ref of refs) {
    assertDigestRef(ref, 'audit.merkle.invalid_receipt_ref', 'receipt_ref');
    if (seen.has(ref)) {
      throw new MerkleInputError(
        'audit.merkle.duplicate_receipt_ref',
        `duplicate receipt_ref: ${ref}`
      );
    }
    seen.add(ref);
    entries.push({ ref, digest: decodeDigest(ref) });
  }
  entries.sort((a, b) => compareBytes(a.digest, b.digest));
  return { sorted: entries.map((e) => e.digest), sortedRefs: entries.map((e) => e.ref) };
}

/**
 * Build a Merkle commitment over a sorted set of receipt references.
 *
 * Rejects empty input and duplicate refs. The returned `root`/`tree_size` map
 * directly to a workflow summary's `receipt_merkle_root`/`receipt_count`.
 * @throws {MerkleInputError} on empty input, malformed ref, or duplicate ref.
 */
export function buildReceiptMerkleCommitment(refs: readonly ReceiptRef[]): ReceiptMerkleCommitment {
  const { sorted } = toSortedDigests(refs);
  return {
    tree_alg: MERKLE_TREE_ALG,
    hash_alg: MERKLE_HASH_ALG,
    root: encodeDigest(merkleTreeHash(sorted, 0, sorted.length)),
    tree_size: sorted.length,
  };
}

/**
 * Generate an offline inclusion proof for `targetRef` against the committed set.
 * `leaf_index` in the returned proof is the index within the SORTED leaf order.
 * @throws {MerkleInputError} on empty input, malformed ref, duplicate ref, or
 * when `targetRef` is not present in `refs`.
 */
export function generateReceiptMerkleInclusionProof(
  refs: readonly ReceiptRef[],
  targetRef: ReceiptRef
): ReceiptMerkleInclusionProof {
  assertDigestRef(targetRef, 'audit.merkle.invalid_receipt_ref', 'targetRef');
  const { sorted, sortedRefs } = toSortedDigests(refs);
  const leafIndex = sortedRefs.indexOf(targetRef);
  if (leafIndex === -1) {
    throw new MerkleInputError(
      'audit.merkle.target_not_found',
      `targetRef not in refs: ${targetRef}`
    );
  }
  return {
    tree_alg: MERKLE_TREE_ALG,
    hash_alg: MERKLE_HASH_ALG,
    leaf_index: leafIndex,
    tree_size: sorted.length,
    hashes: inclusionPath(leafIndex, sorted, 0, sorted.length).map(encodeDigest),
  };
}

/**
 * Verify an inclusion proof offline against a full commitment.
 *
 * Verifying against the {@link ReceiptMerkleCommitment} (not a naked root) binds
 * the proof to the commitment's `tree_size` as well as its `root`, so a proof
 * whose `tree_size` disagrees with the commitment is rejected up front.
 *
 * Returns `false` for a well-formed but cryptographically wrong proof (wrong
 * root, wrong sibling, wrong target, mismatched tree_size, truncated/extra path).
 * @throws {MerkleInputError} on malformed input: a structurally invalid
 * commitment/proof, bad root/target/sibling grammar, unsupported
 * `tree_alg`/`hash_alg`, or non-integer/out-of-range `leaf_index`/`tree_size`.
 */
export function verifyReceiptMerkleInclusion(
  commitment: ReceiptMerkleCommitment,
  targetRef: ReceiptRef,
  proof: ReceiptMerkleInclusionProof
): boolean {
  if (commitment === null || typeof commitment !== 'object') {
    throw new MerkleInputError('audit.merkle.invalid_commitment', 'commitment must be an object');
  }
  if (commitment.tree_alg !== MERKLE_TREE_ALG) {
    throw new MerkleInputError(
      'audit.merkle.unsupported_tree_alg',
      `unsupported commitment tree_alg: ${describe(commitment.tree_alg)}`
    );
  }
  if (commitment.hash_alg !== MERKLE_HASH_ALG) {
    throw new MerkleInputError(
      'audit.merkle.unsupported_hash_alg',
      `unsupported commitment hash_alg: ${describe(commitment.hash_alg)}`
    );
  }
  assertDigestRef(commitment.root, 'audit.merkle.invalid_merkle_root', 'commitment.root');
  if (!isSafePositiveInteger(commitment.tree_size)) {
    throw new MerkleInputError(
      'audit.merkle.invalid_commitment',
      `commitment.tree_size must be a positive safe integer; received ${describe(commitment.tree_size)}`
    );
  }
  assertDigestRef(targetRef, 'audit.merkle.invalid_receipt_ref', 'targetRef');
  if (proof === null || typeof proof !== 'object') {
    throw new MerkleInputError('audit.merkle.invalid_proof', 'proof must be an object');
  }
  if (proof.tree_alg !== MERKLE_TREE_ALG) {
    throw new MerkleInputError(
      'audit.merkle.unsupported_tree_alg',
      `unsupported tree_alg: ${describe(proof.tree_alg)}`
    );
  }
  if (proof.hash_alg !== MERKLE_HASH_ALG) {
    throw new MerkleInputError(
      'audit.merkle.unsupported_hash_alg',
      `unsupported hash_alg: ${describe(proof.hash_alg)}`
    );
  }
  if (!isSafePositiveInteger(proof.tree_size)) {
    throw new MerkleInputError(
      'audit.merkle.invalid_proof',
      `tree_size must be a positive safe integer; received ${describe(proof.tree_size)}`
    );
  }
  if (!isSafeNonNegativeInteger(proof.leaf_index) || proof.leaf_index >= proof.tree_size) {
    throw new MerkleInputError(
      'audit.merkle.invalid_proof',
      `leaf_index must be a safe integer in [0, tree_size); received ${describe(proof.leaf_index)}`
    );
  }
  if (!Array.isArray(proof.hashes)) {
    throw new MerkleInputError('audit.merkle.invalid_proof', 'proof.hashes must be an array');
  }
  const siblings: Uint8Array[] = [];
  for (const h of proof.hashes) {
    assertDigestRef(h, 'audit.merkle.invalid_proof_hash', 'proof.hashes[]');
    siblings.push(decodeDigest(h));
  }
  // Bind the proof to the commitment: a proof for a different-sized tree is not
  // a proof for this commitment.
  if (proof.tree_size !== commitment.tree_size) return false;
  const recomputed = foldInclusionProof(
    leafHash(decodeDigest(targetRef)),
    siblings,
    proof.leaf_index,
    proof.tree_size
  );
  return recomputed !== null && bytesEqual(recomputed, decodeDigest(commitment.root));
}
