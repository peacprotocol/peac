/**
 * Tests for @peac/audit Merkle commitment helpers (WORKFLOW-CORRELATION section 7;
 * RFC 9162 CT-style sorted-set commitment).
 *
 * Uses committed JSON vectors (tests/fixtures/merkle-vectors.json) generated
 * independently from the implementation, PLUS a hand-rolled RFC 9162 oracle in
 * this file, so the implementation is not self-certifying. A deliberately naive
 * perfect-tree verifier is included to prove that n=3 / n=7 vectors catch a wrong
 * fold; the implementation MUST use the RFC 9162 section 2.1.3.2 fn/sn fold.
 *
 * verifyReceiptMerkleInclusion takes the full commitment (root + tree_size + algs)
 * so a proof is bound to the commitment it is verified against.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MERKLE_TREE_ALG,
  MERKLE_HASH_ALG,
  MerkleInputError,
  buildReceiptMerkleCommitment,
  generateReceiptMerkleInclusionProof,
  verifyReceiptMerkleInclusion,
  type ReceiptMerkleCommitment,
  type ReceiptMerkleInclusionProof,
} from '../src/merkle.js';
import vectorsFile from './fixtures/merkle-vectors.json';

type Ref = `sha256:${string}`;
interface Vector {
  n: number;
  input_refs: Ref[];
  sorted_refs: Ref[];
  root: Ref;
  proofs: { target_ref: Ref; leaf_index: number; hashes: Ref[] }[];
}
const VECTORS = (vectorsFile as { vectors: Vector[] }).vectors;

// ---- independent hand-rolled RFC 9162 oracle (separate code path) ----
const sha = (...c: Uint8Array[]) => {
  const h = createHash('sha256');
  for (const x of c) h.update(x);
  return Uint8Array.from(h.digest());
};
const dec = (r: Ref) => Uint8Array.from(Buffer.from(r.slice(7), 'hex'));
const enc = (b: Uint8Array): Ref => `sha256:${Buffer.from(b).toString('hex')}` as Ref;
const oLeaf = (d: Uint8Array) => sha(Uint8Array.of(0x00), d);
const oNode = (l: Uint8Array, r: Uint8Array) => sha(Uint8Array.of(0x01), l, r);
const oPow2 = (n: number) => {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
};
const oMth = (D: Uint8Array[]): Uint8Array =>
  D.length === 1
    ? oLeaf(D[0])
    : oNode(oMth(D.slice(0, oPow2(D.length))), oMth(D.slice(oPow2(D.length))));
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const odd = (n: number) => n % 2 === 1;
const half = (n: number) => Math.floor(n / 2);
// oracle verify via the RFC 9162 fn/sn fold (arithmetic, not JS bitwise)
function oracleVerify(
  root: Ref,
  target: Ref,
  proof: { leaf_index: number; tree_size: number; hashes: Ref[] }
): boolean {
  let fn = proof.leaf_index;
  let sn = proof.tree_size - 1;
  if (fn < 0 || fn >= proof.tree_size) return false;
  let r = oLeaf(dec(target));
  for (const p of proof.hashes.map(dec)) {
    if (sn === 0) return false;
    if (odd(fn) || fn === sn) {
      r = oNode(p, r);
      if (!odd(fn)) while (!odd(fn) && fn !== 0) ((fn = half(fn)), (sn = half(sn)));
    } else {
      r = oNode(r, p);
    }
    fn = half(fn);
    sn = half(sn);
  }
  return sn === 0 && eq(r, dec(root));
}
// deliberately WRONG naive perfect-tree fold (no fn==sn / no while-shift)
function naiveVerify(
  root: Ref,
  target: Ref,
  proof: { leaf_index: number; hashes: Ref[] }
): boolean {
  let idx = proof.leaf_index;
  let r = oLeaf(dec(target));
  for (const p of proof.hashes.map(dec)) {
    r = odd(idx) ? oNode(p, r) : oNode(r, p);
    idx = half(idx);
  }
  return eq(r, dec(root));
}

const refOf = (label: string): Ref => enc(sha(Buffer.from(label, 'utf8')));

describe('@peac/audit merkle: exported API surface', () => {
  it('exports the expected names and constants', () => {
    expect(MERKLE_TREE_ALG).toBe('peac.merkle.ct-sorted-set-sha256-v1');
    expect(MERKLE_HASH_ALG).toBe('sha256');
    expect(typeof buildReceiptMerkleCommitment).toBe('function');
    expect(typeof generateReceiptMerkleInclusionProof).toBe('function');
    expect(typeof verifyReceiptMerkleInclusion).toBe('function');
    expect(new MerkleInputError('audit.merkle.empty_input', 'x')).toBeInstanceOf(Error);
  });

  it('production merkle.ts uses no JS bitwise integer operators (RFC 9162 fold is arithmetic)', () => {
    const src = readFileSync(path.join(__dirname, '../src/merkle.ts'), 'utf8');
    // strip block + line comments so prose/JSDoc cannot trip the guard
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/>>|<<|&\s*1\b|\|\s*0\b|~~/);
  });
});

describe('@peac/audit merkle: committed vectors (helper == oracle == golden)', () => {
  for (const v of VECTORS) {
    it(`n=${v.n}: commitment root matches golden + oracle`, () => {
      const c = buildReceiptMerkleCommitment(v.input_refs);
      expect(c.tree_alg).toBe(MERKLE_TREE_ALG);
      expect(c.hash_alg).toBe(MERKLE_HASH_ALG);
      expect(c.tree_size).toBe(v.n);
      expect(c.root).toBe(v.root); // golden
      expect(c.root).toBe(enc(oMth(v.sorted_refs.map(dec)))); // oracle
    });

    it(`n=${v.n}: shuffled input yields the identical root`, () => {
      const shuffled = [...v.input_refs].reverse();
      expect(buildReceiptMerkleCommitment(shuffled).root).toBe(v.root);
    });

    for (const p of v.proofs) {
      it(`n=${v.n} leaf ${p.leaf_index}: proof matches golden, verifies (helper + oracle)`, () => {
        const c = buildReceiptMerkleCommitment(v.input_refs);
        const proof = generateReceiptMerkleInclusionProof(v.input_refs, p.target_ref);
        expect(proof.leaf_index).toBe(p.leaf_index);
        expect(proof.tree_size).toBe(v.n);
        expect(proof.hashes).toEqual(p.hashes); // golden
        expect(verifyReceiptMerkleInclusion(c, p.target_ref, proof)).toBe(true);
        expect(oracleVerify(v.root, p.target_ref, proof)).toBe(true);
      });
    }
  }

  it('n=1 proof has empty hashes and verifies', () => {
    const v = VECTORS.find((x) => x.n === 1)!;
    const c = buildReceiptMerkleCommitment(v.input_refs);
    const proof = generateReceiptMerkleInclusionProof(v.input_refs, v.input_refs[0]);
    expect(proof.hashes).toEqual([]);
    expect(verifyReceiptMerkleInclusion(c, v.input_refs[0], proof)).toBe(true);
  });

  it('first-principles anchor: n=1 root = SHA-256(0x00 || digest)', () => {
    const v = VECTORS.find((x) => x.n === 1)!;
    expect(v.root).toBe(enc(oLeaf(dec(v.input_refs[0]))));
  });

  it('first-principles anchor: n=2 root = node(leaf(min), leaf(max))', () => {
    const v = VECTORS.find((x) => x.n === 2)!;
    const [a, b] = v.sorted_refs.map(dec);
    expect(v.root).toBe(enc(oNode(oLeaf(a), oLeaf(b))));
  });
});

describe('@peac/audit merkle: n=3 / n=7 fold guard (RFC 9162, not perfect-tree bit-walk)', () => {
  for (const n of [3, 7]) {
    it(`n=${n} last leaf: RFC fold verifies but a naive perfect-tree fold does NOT`, () => {
      const v = VECTORS.find((x) => x.n === n)!;
      const c = buildReceiptMerkleCommitment(v.input_refs);
      const last = v.sorted_refs.length - 1;
      const proof = generateReceiptMerkleInclusionProof(v.input_refs, v.sorted_refs[last]);
      expect(verifyReceiptMerkleInclusion(c, v.sorted_refs[last], proof)).toBe(true);
      expect(
        naiveVerify(v.root, v.sorted_refs[last], {
          leaf_index: proof.leaf_index,
          hashes: proof.hashes,
        })
      ).toBe(false);
    });
  }
});

describe('@peac/audit merkle: malformed input throws MerkleInputError', () => {
  const good = [refOf('a'), refOf('b'), refOf('c')];
  const commitment = () => buildReceiptMerkleCommitment(good);
  const baseProof = (): ReceiptMerkleInclusionProof =>
    generateReceiptMerkleInclusionProof(good, good[0]);
  const codeOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(MerkleInputError);
      return (e as MerkleInputError).code;
    }
    throw new Error('expected throw');
  };

  // build / generate input
  it('empty input', () =>
    expect(codeOf(() => buildReceiptMerkleCommitment([]))).toBe('audit.merkle.empty_input'));
  it('duplicate ref', () =>
    expect(codeOf(() => buildReceiptMerkleCommitment([good[0], good[0]]))).toBe(
      'audit.merkle.duplicate_receipt_ref'
    ));
  it('malformed ref (short hex)', () =>
    expect(codeOf(() => buildReceiptMerkleCommitment(['sha256:abcd' as Ref]))).toBe(
      'audit.merkle.invalid_receipt_ref'
    ));
  it('uppercase ref', () =>
    expect(codeOf(() => buildReceiptMerkleCommitment([good[0].toUpperCase() as Ref]))).toBe(
      'audit.merkle.invalid_receipt_ref'
    ));
  it('target not found', () =>
    expect(codeOf(() => generateReceiptMerkleInclusionProof(good, refOf('z')))).toBe(
      'audit.merkle.target_not_found'
    ));

  // commitment
  it('null commitment', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(
          null as unknown as ReceiptMerkleCommitment,
          good[0],
          baseProof()
        )
      )
    ).toBe('audit.merkle.invalid_commitment'));
  it('commitment.tree_size not a positive integer', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion({ ...commitment(), tree_size: 0 }, good[0], baseProof())
      )
    ).toBe('audit.merkle.invalid_commitment'));
  it('commitment.root bad grammar', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(
          { ...commitment(), root: 'sha256:xyz' as ReceiptMerkleCommitment['root'] },
          good[0],
          baseProof()
        )
      )
    ).toBe('audit.merkle.invalid_merkle_root'));
  it('unsupported commitment tree_alg', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(
          { ...commitment(), tree_alg: 'other' } as unknown as ReceiptMerkleCommitment,
          good[0],
          baseProof()
        )
      )
    ).toBe('audit.merkle.unsupported_tree_alg'));
  it('unsupported commitment hash_alg', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(
          { ...commitment(), hash_alg: 'sha512' } as unknown as ReceiptMerkleCommitment,
          good[0],
          baseProof()
        )
      )
    ).toBe('audit.merkle.unsupported_hash_alg'));

  // proof
  it('unsupported proof tree_alg', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(commitment(), good[0], {
          ...baseProof(),
          tree_alg: 'other',
        } as unknown as ReceiptMerkleInclusionProof)
      )
    ).toBe('audit.merkle.unsupported_tree_alg'));
  it('unsupported proof hash_alg', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(commitment(), good[0], {
          ...baseProof(),
          hash_alg: 'sha512',
        } as unknown as ReceiptMerkleInclusionProof)
      )
    ).toBe('audit.merkle.unsupported_hash_alg'));
  it('out-of-range leaf_index', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(commitment(), good[0], { ...baseProof(), leaf_index: 99 })
      )
    ).toBe('audit.merkle.invalid_proof'));
  it('non-integer leaf_index', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(commitment(), good[0], { ...baseProof(), leaf_index: 1.5 })
      )
    ).toBe('audit.merkle.invalid_proof'));
  it('bad proof tree_size', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(commitment(), good[0], { ...baseProof(), tree_size: 0 })
      )
    ).toBe('audit.merkle.invalid_proof'));

  // safe-integer bounds (JS bitwise coercion / precision safety)
  it('commitment.tree_size must be a safe integer', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(
          { ...commitment(), tree_size: Number.MAX_SAFE_INTEGER + 1 },
          good[0],
          baseProof()
        )
      )
    ).toBe('audit.merkle.invalid_commitment'));
  it('proof.tree_size must be a safe integer', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(commitment(), good[0], {
          ...baseProof(),
          tree_size: Number.MAX_SAFE_INTEGER + 1,
        })
      )
    ).toBe('audit.merkle.invalid_proof'));
  it('proof.leaf_index must be a safe integer', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(commitment(), good[0], {
          ...baseProof(),
          leaf_index: Number.MAX_SAFE_INTEGER + 1,
        })
      )
    ).toBe('audit.merkle.invalid_proof'));
  it('malformed proof sibling hash grammar (throws, not false)', () =>
    expect(
      codeOf(() =>
        verifyReceiptMerkleInclusion(commitment(), good[0], {
          ...baseProof(),
          hashes: ['sha256:zz' as Ref],
        })
      )
    ).toBe('audit.merkle.invalid_proof_hash'));
});

describe('@peac/audit merkle: well-formed but wrong proof returns false', () => {
  const refs = [refOf('p'), refOf('q'), refOf('r'), refOf('s'), refOf('t'), refOf('u'), refOf('v')]; // n=7
  const commitment = () => buildReceiptMerkleCommitment(refs);

  it('wrong root -> false', () => {
    const p = generateReceiptMerkleInclusionProof(refs, refs[0]);
    expect(
      verifyReceiptMerkleInclusion({ ...commitment(), root: refOf('not-the-root') }, refs[0], p)
    ).toBe(false);
  });
  it('wrong targetRef -> false', () => {
    const p = generateReceiptMerkleInclusionProof(refs, refs[0]);
    expect(verifyReceiptMerkleInclusion(commitment(), refs[1], p)).toBe(false);
  });
  it('wrong sibling bytes -> false', () => {
    const p = generateReceiptMerkleInclusionProof(refs, refs[0]);
    const mutated = { ...p, hashes: [refOf('bogus-sibling'), ...p.hashes.slice(1)] };
    expect(verifyReceiptMerkleInclusion(commitment(), refs[0], mutated)).toBe(false);
  });
  it('proof.tree_size != commitment.tree_size -> false', () => {
    const p = generateReceiptMerkleInclusionProof(refs, refs[0]);
    expect(
      verifyReceiptMerkleInclusion(commitment(), refs[0], { ...p, tree_size: p.tree_size + 1 })
    ).toBe(false);
  });
  it('truncated proof -> false', () => {
    const p = generateReceiptMerkleInclusionProof(refs, refs[0]);
    expect(
      verifyReceiptMerkleInclusion(commitment(), refs[0], { ...p, hashes: p.hashes.slice(0, -1) })
    ).toBe(false);
  });
  it('extra sibling -> false', () => {
    const p = generateReceiptMerkleInclusionProof(refs, refs[0]);
    expect(
      verifyReceiptMerkleInclusion(commitment(), refs[0], {
        ...p,
        hashes: [...p.hashes, refOf('extra')],
      })
    ).toBe(false);
  });
});

describe('@peac/audit merkle: no logging of material', () => {
  it('build/generate/verify do not write to console', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const refs = [refOf('m'), refOf('n'), refOf('o')];
      const c = buildReceiptMerkleCommitment(refs);
      const p = generateReceiptMerkleInclusionProof(refs, refs[0]);
      verifyReceiptMerkleInclusion(c, refs[0], p);
      expect(logSpy).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
