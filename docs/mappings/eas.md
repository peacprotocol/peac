# PEAC Mapping: Ethereum Attestation Service (EAS)

**Status:** Planned (non-normative)
**EAS Reference:** [Ethereum Attestation Service](https://attest.org)

This document sketches a potential mapping from PEAC receipts to EAS attestations. It is **not shipped** as a supported integration in v0.10.6 because we do not yet provide:

- An end-to-end example (create schema, attest, verify)
- A stable schema UID to reference
- Conformance vectors (goldens + drift gates)

---

## Why EAS

EAS can serve as an optional, public anchor for PEAC receipt commitments.

- It can improve cross-organization discoverability of receipt commitments.
- It does not replace PEAC receipts. The receipt file remains the primary artifact.
- It is purely additive: PEAC integrations should not require EAS.

---

## Proposed Schema (Draft)

A minimal schema that anchors a PEAC receipt commitment:

| Field          | Type    | Meaning                                               |
| -------------- | ------- | ----------------------------------------------------- |
| `receipt_hash` | bytes32 | keccak256 hash of the PEAC receipt canonical bytes    |
| `receipt_uri`  | string  | URI to fetch the receipt (or a stable wrapper)        |
| `media_type`   | string  | e.g., `application/json`                              |
| `iat`          | uint64  | Unix seconds (JWT `iat` claim)                        |
| `issuer`       | string  | Issuer identity (e.g., `did:web:...` or `eip155:...`) |
| `subject`      | string  | Subject identity, if applicable                       |
| `context_uri`  | string  | Optional context bundle URI                           |

---

## Hashing and Determinism Profile

- `receipt_hash` SHOULD be computed from the PEAC receipt **canonical** JSON:
  - Canonicalize with RFC 8785 (JCS)
  - Encode as UTF-8 bytes
  - Hash with keccak256
- `receipt_uri` SHOULD be stable and cache-safe (avoid dynamic formatting and compression).

---

## Deployment References (Informational)

As of 2026-01-31, the `eas-contracts` repository publishes deployment metadata for Base and Optimism that includes the EIP712 proxy and indexer contracts.

### Base Mainnet

| Contract    | Address                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| EIP712Proxy | [`0xF095fE4b23958b08D38e52d5d5674bBF0C03cbF6`](https://basescan.org/address/0xF095fE4b23958b08D38e52d5d5674bBF0C03cbF6) |
| Indexer     | [`0x37AC6006646f2e687B7fB379F549Dc7634dF5b84`](https://basescan.org/address/0x37AC6006646f2e687B7fB379F549Dc7634dF5b84) |

### Optimism Mainnet

| Contract    | Address                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| EIP712Proxy | [`0xE132c2E90274B44FfD8090b58399D04ddc060AE1`](https://optimistic.etherscan.io/address/0xE132c2E90274B44FfD8090b58399D04ddc060AE1) |
| Indexer     | [`0x6dd0CB3C3711c8B5d03b3790e5339Bbc2Bbcf934`](https://optimistic.etherscan.io/address/0x6dd0CB3C3711c8B5d03b3790e5339Bbc2Bbcf934) |

> **Note:** EAS core contracts (`EAS`, `SchemaRegistry`) may be deployed as regular contracts or as OP Stack predeploys depending on the chain. Always consult chain-specific documentation and the [eas-contracts deployment metadata](https://github.com/ethereum-attestation-service/eas-contracts#deployments) for the exact network you target.

---

## What It Takes to Make This "Supported"

1. Define and register a schema; publish the schema UID.
2. Provide an end-to-end example (write attestation + verify on-chain).
3. Add conformance vectors for hash computation and attestation encoding.
4. Add CI gating (example verifies, vectors pass).

---

## Related Documentation

- [ERC-8004 Mapping](./erc-8004.md) - Reputation signals integration
- [EAS Documentation](https://docs.attest.org/) - Official EAS docs
- [eas-contracts](https://github.com/ethereum-attestation-service/eas-contracts) - Reference implementation
