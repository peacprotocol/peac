# A2A Gateway Pattern Example

Demonstrates the PEAC evidence carrier contract with A2A (Agent-to-Agent Protocol) task state transitions. A gateway agent issues one receipt per state change and attaches it to the A2A TaskStatus metadata.

## Quick Start

```bash
pnpm install
pnpm demo
```

## What It Does

1. **Declares** PEAC support in an Agent Card extension
2. **Issues** a receipt at each state transition (submitted, working, completed)
3. **Attaches** receipts to A2A TaskStatus metadata via the carrier contract
4. **Extracts** receipts from metadata on the consumer side
5. **Verifies** each receipt offline

## Gateway Pattern

```text
Consumer          Gateway             Agent
   |                 |                  |
   |--- task ------->|                  |
   |                 |-- receipt #1 --> (submitted)
   |                 |                  |
   |                 |-- receipt #2 --> (working)
   |                 |                  |
   |                 |-- receipt #3 --> (completed)
   |<-- receipts ----|                  |
   |                 |                  |
   (verify chain)
```

Each receipt records the state transition as an observable fact. Receipts are attached to A2A `TaskStatus.metadata` under the PEAC extension URI.

## Agent Card Extension

The [agent-card.json](agent-card.json) file declares PEAC support:

```json
{
  "uri": "https://www.peacprotocol.org/ext/traceability/v1",
  "required": false,
  "params": {
    "supported_kinds": ["commerce", "attestation"],
    "carrier_formats": ["embed"]
  }
}
```

## References

- [A2A Carrier Mapping](../../packages/mappings/a2a/README.md)
- [Evidence Carrier Contract](../../docs/specs/EVIDENCE-CARRIER-CONTRACT.md)
- [PEAC Protocol](https://www.peacprotocol.org)
