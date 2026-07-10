# Workflow Correlation Example

Demonstrates linking PEAC records into a multi-step workflow graph using
the `org.peacprotocol/correlation` extension.

## Pattern

This example shows a fork-join workflow pattern:

```text
   [Root]
     |
     +----+----+
     |         |
  [Branch A] [Branch B]
     |         |
     +----+----+
          |
       [Join]
```

## Key concepts

- **Correlation extension**: per-record extension that links records into
  a directed graph.
- **workflow_id**: identifier shared by every record in one workflow run.
- **parent_jti**: the `jti` of the record this step follows.
- **depends_on**: the `jti` values this step depends on (the join step
  depends on both branches).

The join step uses `depends_on`, so the records form a directed workflow
graph, not a strict tree. Each record is an `org.peacprotocol/payment`
record carrying an `org.peacprotocol/commerce` extension with
`payment_rail` and `amount_minor`.

## Running

From the repository root:

```bash
pnpm --filter @peac/example-workflow-correlation demo
```

The demo uses an illustrative workflow identifier. Production integrations
should generate collision-resistant UUIDs or ULIDs using a well-reviewed
library and must not use `Math.random()`.

## Output

The demo issues 4 records (root, 2 parallel branches, join) and shows:

1. Each record's correlation metadata (`workflow_id`, `parent_jti`,
   `depends_on`).
2. Offline verification of all records.
3. The reconstructed graph structure.
4. The total observed amount (the sum of `amount_minor` values).

## Extension key

Correlation metadata is stored in the record's `ext` field under:

```text
ext['org.peacprotocol/correlation']
```

with `workflow_id`, `parent_jti`, and `depends_on` fields.

## Notes

- PEAC records correlation metadata; graph reconstruction and amount
  aggregation are relying-party or application functions.
- `workflow_id`, `parent_jti`, and `depends_on` are correlation metadata,
  not authorization. Consumers reconstructing multi-issuer graphs must
  define accepted issuers and reject ambiguous JTI references.
- Orchestrator step index, tool name, and framework specifics are the
  orchestrator's concern, not PEAC fields.

## Use cases

- Correlation across multi-agent workflows
- Fork-join parallel processing
- Audit trails for correlated AI workflows
