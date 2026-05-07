/**
 * PEAC Workflow Correlation Demo
 *
 * Demonstrates linking receipts via canonical correlation metadata.
 * Pattern: root -> fork (2 branches) -> join, using `parent_jti` and `depends_on`.
 *
 * Run with: pnpm demo
 *
 * Note: PEAC records correlation metadata. Step indexing, tool naming, framework
 * tagging, and orchestrator identity are properties of the upstream orchestrator,
 * not of the PEAC record. This demo links receipts by their JTIs to show causal
 * structure; richer orchestrator state lives in the orchestration system itself.
 */

import { issue, verifyLocal, generateKeypair } from '@peac/protocol';
import { decode } from '@peac/crypto';

interface DecodedClaims {
  jti: string;
  iss: string;
  iat: number;
  kind: string;
  type: string;
  extensions?: {
    'org.peacprotocol/commerce'?: {
      payment_rail?: string;
      amount_minor?: string;
      currency?: string;
    };
    'org.peacprotocol/correlation'?: {
      workflow_id?: string;
      parent_jti?: string;
      depends_on?: string[];
    };
  };
}

/**
 * Generate a ULID-like identifier for the workflow id.
 *
 * In production, use a proper ULID library (e.g., 'ulid' or 'ulidx' npm package)
 * for cryptographic randomness and correct Crockford Base32 encoding.
 */
function generateWorkflowId(): string {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const random = Array.from({ length: 16 }, () =>
    '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.charAt(Math.floor(Math.random() * 32))
  ).join('');
  return `${timestamp}${random}`;
}

async function main() {
  console.log('PEAC Workflow Correlation Demo\n');
  console.log('Pattern: root -> fork (2 parallel branches) -> join\n');
  console.log(
    'PEAC records correlation metadata; orchestrator step index, tool name,\n' +
      'framework, and orchestrator identity remain in the upstream orchestrator.\n'
  );

  const { privateKey, publicKey } = await generateKeypair();
  const workflowId = generateWorkflowId();

  console.log('Workflow ID:', workflowId);
  console.log('');

  // Step 1: Root step (no parent)
  console.log('Step 1: Root step (workflow initialization)');
  const rootReceipt = await issue({
    iss: 'https://orchestrator.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    sub: 'https://workflow.example.com/tasks/init',
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'internal',
        amount_minor: '100',
        currency: 'USD',
        reference: 'init-001',
      },
      'org.peacprotocol/correlation': {
        workflow_id: workflowId,
      },
    },
    privateKey,
    kid: 'key-2026-01',
  });
  const rootJti = (decode(rootReceipt.jws).payload as DecodedClaims).jti;

  console.log('   JTI:', rootJti);
  console.log('   Parent JTI: (none; root step)');
  console.log('   Receipt:', rootReceipt.jws.slice(0, 50) + '...\n');

  // Step 2a: Branch A (parent_jti = root)
  console.log('Step 2a: Branch A (parallel research)');
  const branchAReceipt = await issue({
    iss: 'https://research-agent.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    sub: 'https://workflow.example.com/tasks/research',
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'internal',
        amount_minor: '500',
        currency: 'USD',
        reference: 'research-001',
      },
      'org.peacprotocol/correlation': {
        workflow_id: workflowId,
        parent_jti: rootJti,
      },
    },
    privateKey,
    kid: 'key-2026-01',
  });
  const branchAJti = (decode(branchAReceipt.jws).payload as DecodedClaims).jti;

  console.log('   JTI:', branchAJti);
  console.log('   Parent JTI:', rootJti);
  console.log('   Receipt:', branchAReceipt.jws.slice(0, 50) + '...\n');

  // Step 2b: Branch B (parent_jti = root, parallel to Branch A)
  console.log('Step 2b: Branch B (parallel analysis)');
  const branchBReceipt = await issue({
    iss: 'https://analysis-agent.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    sub: 'https://workflow.example.com/tasks/analysis',
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'internal',
        amount_minor: '300',
        currency: 'USD',
        reference: 'analysis-001',
      },
      'org.peacprotocol/correlation': {
        workflow_id: workflowId,
        parent_jti: rootJti,
      },
    },
    privateKey,
    kid: 'key-2026-01',
  });
  const branchBJti = (decode(branchBReceipt.jws).payload as DecodedClaims).jti;

  console.log('   JTI:', branchBJti);
  console.log('   Parent JTI:', rootJti);
  console.log('   Receipt:', branchBReceipt.jws.slice(0, 50) + '...\n');

  // Step 3: Join step (depends_on captures both ancestor branches)
  console.log('Step 3: Join step (fan-in: depends on both branches)');
  const joinReceipt = await issue({
    iss: 'https://orchestrator.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    sub: 'https://workflow.example.com/tasks/merge',
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'internal',
        amount_minor: '200',
        currency: 'USD',
        reference: 'merge-001',
      },
      'org.peacprotocol/correlation': {
        workflow_id: workflowId,
        parent_jti: branchAJti,
        depends_on: [branchBJti],
      },
    },
    privateKey,
    kid: 'key-2026-01',
  });
  const joinJti = (decode(joinReceipt.jws).payload as DecodedClaims).jti;

  console.log('   JTI:', joinJti);
  console.log('   Parent JTI:', branchAJti);
  console.log('   Depends on:', [branchBJti]);
  console.log('   Receipt:', joinReceipt.jws.slice(0, 50) + '...\n');

  // Verify all receipts and show correlation metadata
  console.log('--- Verification ---\n');

  const receipts = [
    { name: 'Root', jws: rootReceipt.jws },
    { name: 'Branch A', jws: branchAReceipt.jws },
    { name: 'Branch B', jws: branchBReceipt.jws },
    { name: 'Join', jws: joinReceipt.jws },
  ];

  let totalAmountMinor = 0n;

  for (const { name, jws } of receipts) {
    const result = await verifyLocal(jws, publicKey, {
      issuer: undefined,
    });

    if (result.valid) {
      const claims = result.claims as unknown as DecodedClaims;
      const commerce = claims.extensions?.['org.peacprotocol/commerce'];
      const correlation = claims.extensions?.['org.peacprotocol/correlation'];

      console.log(`${name}:`);
      console.log('   Valid: true');
      if (commerce?.amount_minor && commerce?.currency) {
        console.log('   Amount:', commerce.amount_minor, commerce.currency);
        totalAmountMinor += BigInt(commerce.amount_minor);
      }
      if (correlation) {
        console.log('   Workflow ID:', correlation.workflow_id);
        console.log('   JTI:', claims.jti);
        console.log('   Parent JTI:', correlation.parent_jti ?? '(none)');
        if (correlation.depends_on && correlation.depends_on.length > 0) {
          console.log('   Depends on:', correlation.depends_on);
        }
      }
      console.log('');
    } else {
      console.error(`${name}: Verification FAILED -`, result.code);
    }
  }

  // Summary
  console.log('--- Workflow Summary ---\n');
  console.log('Workflow ID:', workflowId);
  console.log('Total Receipts:', 4);
  console.log('Total Amount (minor units):', totalAmountMinor.toString(), 'USD');
  console.log('');
  console.log('Causal structure (linked by JTI):');
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
  console.log(
    'Each receipt above links to its parent via `parent_jti` and to fan-in\n' +
      'ancestors via `depends_on`. PEAC records the link; the orchestrator owns\n' +
      'the rest of the workflow state.'
  );
  console.log('');

  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
