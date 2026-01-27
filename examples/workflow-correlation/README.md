# Workflow Correlation Example

Demonstrates linking PEAC receipts into a multi-step workflow DAG using the `workflow_context` parameter.

## Pattern

This example shows a fork-join workflow pattern:

```
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

## Key Concepts

- **WorkflowContext**: Per-receipt extension that links receipts into a DAG
- **workflow_id**: Unique identifier for the entire workflow
- **step_id**: Unique identifier for this specific step
- **parent_step_ids**: Array of step IDs this step depends on (empty for root)

## Running

```bash
pnpm install
pnpm demo
```

## Output

The demo issues 4 receipts (root, 2 parallel branches, join) and shows:

1. Each receipt's workflow context
2. Verification of all receipts
3. DAG structure visualization
4. Total workflow cost

## Extension Key

Workflow context is stored in the receipt's `ext` field under:

```
ext['org.peacprotocol/workflow']
```

## Use Cases

- Multi-agent orchestration (MCP, A2A frameworks)
- Streaming workflows with hash chaining
- Fork-join parallel processing
- Audit trails for complex AI workflows
