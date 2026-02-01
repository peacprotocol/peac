# ERC-8004 Mapping Conformance Vectors

Test vectors for computing ERC-8004 `feedbackHash` from PEAC receipts.

## Files

| File                  | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `golden-receipt.json` | Input PEAC receipt in `peac-receipt/0.1` format           |
| `vector.json`         | Expected outputs: canonical form and hash values          |
| `golden-wrapper.json` | Pattern B wrapper file referencing a PEAC receipt         |
| `vector-wrapper.json` | Expected outputs for wrapper mode (Pattern B integration) |

## Integration Patterns

### Pattern A: Direct PEAC Payload (Recommended)

`feedbackURI` points directly to a PEAC receipt. Use `vector.json` for verification.

### Pattern B: ERC-8004 Wrapper File

`feedbackURI` points to a wrapper file that references the PEAC receipt. Use `vector-wrapper.json` for verification. The wrapper MUST also be JCS-canonicalized.

## Verification

The `vector.json` file contains:

- **canonicalization.output**: The exact JCS-canonicalized string (RFC 8785)
- **hashes.keccak256.expected**: The `feedbackHash` for ERC-8004 submission
- **hashes.sha256.expected_base64url**: PEAC's internal digest (for reference)

## Running Tests

```bash
cd examples/erc8004-feedback
pnpm verify
```

The verify script computes the hash from the input fixture and compares against the expected value.

## Cross-Implementation Verification

### Pattern A (Direct Receipt)

Implementers can verify their JCS + keccak256 implementation by:

1. Parsing `golden-receipt.json`
2. Applying RFC 8785 JCS canonicalization
3. Computing `keccak256(utf8_bytes(canonical_json))`
4. Comparing to `0xf6194f761fdecef4eaf577f04465229551185e5e8e716d30d955f20eae12fafc`

### Pattern B (Wrapper Mode)

For wrapper-mode verification:

1. Parsing `golden-wrapper.json`
2. Applying RFC 8785 JCS canonicalization
3. Computing `keccak256(utf8_bytes(canonical_json))`
4. Comparing to `0x58a0056caf5fb01a324b023bfac341b5fdef8fb8b21e7f7a4d0f279de3ec1083`

**Note:** In wrapper mode, `feedbackHash` commits to the wrapper bytes, not the fetched receipt bytes. The wrapper's `peac.sha256` field provides independent verification of the referenced PEAC receipt.

## See Also

- [ERC-8004 Mapping Spec](../../../docs/mappings/erc-8004.md)
- [ERC-8004 Feedback Example](../../../examples/erc8004-feedback/)
