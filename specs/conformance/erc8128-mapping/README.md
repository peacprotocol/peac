# ERC-8128 Mapping Conformance Vectors

Test vectors for RFC 9421 HTTP Message Signatures profile used in ERC-8128 feedback submission.

## Files

| File                          | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `signature-input.json`        | Input parameters for constructing the HTTP signature          |
| `vector-signature.json`       | Expected signature base, coverage components, and key binding |
| `vector-receipt-binding.json` | Expected receipt-to-signature binding via PEAC-Receipt header |

## ERC-8128 Integration

ERC-8128 extends ERC-8004 with cryptographic binding between on-chain feedback and the HTTP request that produced it. The binding uses RFC 9421 HTTP Message Signatures to sign the request containing the PEAC receipt.

### Signature Profile

The ERC-8128 profile constrains RFC 9421 as follows:

- **Covered components**: `@method`, `@target-uri`, `peac-receipt`
- **Algorithm**: `ed25519` (RFC 9421 Section 3.3.6)
- **Key ID**: References the same key used for receipt signing
- **Created/Expires**: Required for replay protection

### Receipt Binding

The `peac-receipt` header is included as a covered component in the signature input string. This binds the receipt to the HTTP request cryptographically.

## Verification

Implementers can verify their RFC 9421 implementation by:

1. Parsing `signature-input.json` for request parameters
2. Constructing the signature base per RFC 9421 Section 2.5
3. Comparing against `vector-signature.json` expected values
4. Verifying the receipt binding covers the `peac-receipt` header

## See Also

- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421)
- [ERC-8004 Mapping Vectors](../erc8004-mapping/)
