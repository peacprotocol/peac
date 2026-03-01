# Standards Alignment

PEAC protocol components align with the following standards.

## Core Standards

| Component               | Standard           | Usage                                                         |
| ----------------------- | ------------------ | ------------------------------------------------------------- |
| URI parsing             | RFC 3986           | Issuer (`iss`), origin, and reference URL validation          |
| Base64url encoding      | RFC 4648 section 5 | JWS payload encoding, fingerprint reference values            |
| Timestamps              | RFC 3339           | All datetime fields (`iat`, `exp`, `not_before`, `not_after`) |
| JSON Web Signature      | RFC 7515           | Receipt envelope format (compact serialization)               |
| JSON encoding           | RFC 8259           | All JSON payloads and configuration files                     |
| EdDSA signatures        | RFC 8032           | Ed25519 receipt signing and verification                      |
| HTTP Message Signatures | RFC 9421           | Transport-level proof capture                                 |
| Problem Details         | RFC 9457           | Structured error responses                                    |

## Identity Standards

| Component                 | Standard        | Usage                                         |
| ------------------------- | --------------- | --------------------------------------------- |
| Entity Attestation Token  | RFC 9711 (RATS) | EAT passport and background-check proof types |
| X.509 Certificates        | RFC 5280        | Certificate chain proof type, CRLReason codes |
| Decentralized Identifiers | W3C DID 1.1     | `did` proof type                              |
| SPIFFE                    | CNCF SPIFFE     | Workload identity proof type                  |

## Security Standards

| Component          | Standard       | Usage                          |
| ------------------ | -------------- | ------------------------------ |
| Key Management     | NIST SP 800-57 | Key rotation lifecycle stages  |
| Digital Identity   | NIST SP 800-63 | Identity assurance levels      |
| AI Risk Management | NIST AI 100-1  | Governance framework alignment |

## Canonicalization Rules

- **Origin**: Lowercase host, no trailing dot, no userinfo, no path/query/fragment (RFC 3986 section 3.2)
- **Timestamps**: UTC timezone required (Z suffix), no local offsets
- **Hex encoding**: Lowercase only (`[a-f0-9]`), reject uppercase
- **Base64url**: Unpadded (no `=`), URL-safe alphabet only (RFC 4648 section 5)
- **Pillar arrays**: Unique values, alphabetically sorted
