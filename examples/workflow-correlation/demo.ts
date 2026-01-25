/**
 * PEAC Workflow Correlation Demo
 *
 * Demonstrates linking receipts into a multi-step workflow DAG.
 * Pattern: root -> fork (2 branches) -> join
 *
 * Run with: pnpm demo
 */

import { issue, verifyLocal, generateKeypair } from '@peac/protocol';
import {
  type WorkflowContext,
  type WorkflowId,
  type StepId,
  WORKFLOW_EXTENSION_KEY,
  type PEACReceiptClaims,
} from '@peac/schema';
import { decode } from '@peac/crypto';

// Generate unique IDs (in production, use proper UUIDv7/ULID generators)
// IDs must be 20-48 chars after prefix (wf_ or step_)
function generateWorkflowId(): WorkflowId {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = Array.from({ length: 16 }, () =>
    Math.random().toString(36).charAt(2)
  ).join('');
  return `wf_${timestamp}${random}` as WorkflowId;
}

function generateStepId(): StepId {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = Array.from({ length: 16 }, () =>
    Math.random().toString(36).charAt(2)
  ).join('');
  return `step_${timestamp}${random}` as StepId;
}

async function main() {
  console.log('PEAC Workflow Correlation Demo\n');
  console.log('Pattern: root -> fork (2 parallel branches) -> join\n');

  // Generate a signing keypair
  const { privateKey, publicKey } = await generateKeypair();

  // Create workflow and step IDs
  const workflowId = generateWorkflowId();
  const rootStepId = generateStepId();
  const branchAStepId = generateStepId();
  const branchBStepId = generateStepId();
  const joinStepId = generateStepId();

  console.log('Workflow ID:', workflowId);
  console.log('');

  // Step 1: Root step (no parents)
  console.log('Step 1: Root step (orchestrator initialization)');
  const rootContext: WorkflowContext = {
    workflow_id: workflowId,
    step_id: rootStepId,
    parent_step_ids: [],
    step_index: 0,
    step_total: 4,
    framework: 'custom',
    orchestrator_id: 'agent:demo-orchestrator',
  };

  const rootReceipt = await issue({
    iss: 'https://orchestrator.example.com',
    aud: 'https://workflow.example.com',
    amt: 100,
    cur: 'USD',
    rail: 'internal',
    reference: 'init-001',
    subject: 'https://workflow.example.com/tasks/init',
    privateKey,
    kid: 'key-2026-01',
    workflow_context: rootContext,
  });

  console.log('   Step ID:', rootStepId);
  console.log('   Parents: [] (root step)');
  console.log('   Receipt:', rootReceipt.jws.slice(0, 50) + '...\n');

  // Step 2a: Branch A (depends on root)
  console.log('Step 2a: Branch A (parallel research task)');
  const branchAContext: WorkflowContext = {
    workflow_id: workflowId,
    step_id: branchAStepId,
    parent_step_ids: [rootStepId],
    step_index: 1,
    step_total: 4,
    tool_name: 'mcp:research/deep-search',
    framework: 'mcp',
  };

  const branchAReceipt = await issue({
    iss: 'https://research-agent.example.com',
    aud: 'https://workflow.example.com',
    amt: 500,
    cur: 'USD',
    rail: 'internal',
    reference: 'research-001',
    subject: 'https://workflow.example.com/tasks/research',
    privateKey,
    kid: 'key-2026-01',
    workflow_context: branchAContext,
  });

  console.log('   Step ID:', branchAStepId);
  console.log('   Parents:', [rootStepId]);
  console.log('   Tool: mcp:research/deep-search');
  console.log('   Receipt:', branchAReceipt.jws.slice(0, 50) + '...\n');

  // Step 2b: Branch B (depends on root, parallel to Branch A)
  console.log('Step 2b: Branch B (parallel analysis task)');
  const branchBContext: WorkflowContext = {
    workflow_id: workflowId,
    step_id: branchBStepId,
    parent_step_ids: [rootStepId],
    step_index: 2,
    step_total: 4,
    tool_name: 'a2a:analysis/sentiment',
    framework: 'a2a',
  };

  const branchBReceipt = await issue({
    iss: 'https://analysis-agent.example.com',
    aud: 'https://workflow.example.com',
    amt: 300,
    cur: 'USD',
    rail: 'internal',
    reference: 'analysis-001',
    subject: 'https://workflow.example.com/tasks/analysis',
    privateKey,
    kid: 'key-2026-01',
    workflow_context: branchBContext,
  });

  console.log('   Step ID:', branchBStepId);
  console.log('   Parents:', [rootStepId]);
  console.log('   Tool: a2a:analysis/sentiment');
  console.log('   Receipt:', branchBReceipt.jws.slice(0, 50) + '...\n');

  // Step 3: Join step (depends on both branches)
  console.log('Step 3: Join step (merge results from both branches)');
  const joinContext: WorkflowContext = {
    workflow_id: workflowId,
    step_id: joinStepId,
    parent_step_ids: [branchAStepId, branchBStepId], // Fork-join pattern
    step_index: 3,
    step_total: 4,
    orchestrator_id: 'agent:demo-orchestrator',
  };

  const joinReceipt = await issue({
    iss: 'https://orchestrator.example.com',
    aud: 'https://workflow.example.com',
    amt: 200,
    cur: 'USD',
    rail: 'internal',
    reference: 'merge-001',
    subject: 'https://workflow.example.com/tasks/merge',
    privateKey,
    kid: 'key-2026-01',
    workflow_context: joinContext,
  });

  console.log('   Step ID:', joinStepId);
  console.log('   Parents:', [branchAStepId, branchBStepId]);
  console.log('   Receipt:', joinReceipt.jws.slice(0, 50) + '...\n');

  // Verify all receipts and show workflow context
  console.log('--- Verification ---\n');

  const receipts = [
    { name: 'Root', jws: rootReceipt.jws },
    { name: 'Branch A', jws: branchAReceipt.jws },
    { name: 'Branch B', jws: branchBReceipt.jws },
    { name: 'Join', jws: joinReceipt.jws },
  ];

  let totalAmount = 0;

  for (const { name, jws } of receipts) {
    const result = await verifyLocal(jws, publicKey, {
      issuer: undefined, // Allow any issuer for demo
      audience: 'https://workflow.example.com',
    });

    if (result.valid) {
      const decoded = decode<PEACReceiptClaims>(jws);
      const workflowCtx = decoded.payload.ext?.[WORKFLOW_EXTENSION_KEY] as
        | WorkflowContext
        | undefined;

      console.log(`${name}:`);
      console.log('   Valid: true');
      console.log('   Amount:', decoded.payload.amt, decoded.payload.cur);
      if (workflowCtx) {
        console.log('   Workflow ID:', workflowCtx.workflow_id);
        console.log('   Step ID:', workflowCtx.step_id);
        console.log(
          '   Is Root:',
          workflowCtx.parent_step_ids.length === 0 ? 'yes' : 'no'
        );
        if (workflowCtx.tool_name) {
          console.log('   Tool:', workflowCtx.tool_name);
        }
      }
      console.log('');
      totalAmount += decoded.payload.amt;
    } else {
      console.error(`${name}: Verification FAILED -`, result.code);
    }
  }

  // Summary
  console.log('--- Workflow Summary ---\n');
  console.log('Workflow ID:', workflowId);
  console.log('Total Steps:', 4);
  console.log('Total Amount:', totalAmount, 'USD');
  console.log('');
  console.log('DAG Structure:');
  console.log('');
  console.log('   [Root]');
  console.log('     |');
  console.log('     +----+----+');
  console.log('     |         |');
  console.log('  [Branch A] [Branch B]');
  console.log('     |         |');
  console.log('     +----+----+');
  console.log('          |');
  console.log('       [Join]');
  console.log('');

  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
