# API Reference (Informative)

Common HTTP headers and endpoints used alongside PEAC.

- On wire, headers are lowercase: `x-peac-*`.
- Version negotiation: `x-peac-protocol-version`, `x-peac-protocol-version-supported`.
- Receipts: `x-peac-receipt` (presented by agents after settlement).
- Negotiation endpoint: defined by the `negotiate` URL in `peac.txt`.
