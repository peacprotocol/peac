/**
 * Managed Agents Session Evidence Summary Demo
 *
 * Demonstrates PEAC as a portable evidence layer for managed agent runtimes.
 * Uses @peac/adapter-managed-agents for vendor-neutral event issuance,
 * then verifies all receipts and prints a session evidence summary.
 *
 * Demo only, not production-hardened. No runtime-specific logic.
 * Run with: pnpm demo
 */

import { verifyLocal, generateKeypair } from '@peac/protocol';
import {
  issueSessionEvent,
  issueTaskEvent,
  issueToolUseEvent,
  issueMcpCallEvent,
  issuePermissionEvent,
  issueOutcomeEvent,
  buildSessionSummary,
} from '@peac/adapter-managed-agents';

async function main() {
  console.log('Managed Agents Evidence Export Demo\n');

  const { privateKey, publicKey } = await generateKeypair();
  const kid = 'managed-agent-demo-key-1';
  const sessionId = `sess_${Date.now()}`;

  const opts = {
    privateKey,
    kid,
    issuer: 'https://managed-agent-demo.example.com',
    sessionId,
    agentId: 'demo-agent-001',
    provider: 'demo',
  };

  const results = [
    await issueSessionEvent({ ...opts, event: 'session.created' }),
    await issueTaskEvent({
      ...opts,
      event: 'task.submitted',
      details: { task: 'Summarize document' },
    }),
    await issueToolUseEvent({
      ...opts,
      event: 'tool.invoked',
      details: { tool: 'web_search', input_hash: 'sha256:abc' },
    }),
    await issueMcpCallEvent({
      ...opts,
      event: 'mcp.tool_call',
      details: { server: 'peac', tool: 'peac_verify' },
    }),
    await issuePermissionEvent({
      ...opts,
      event: 'permission.confirmed',
      details: { action: 'file_write', user_decision: 'allow' },
    }),
    await issueOutcomeEvent({
      ...opts,
      event: 'outcome.evaluated',
      details: { result: 'success', confidence: 0.95 },
    }),
  ];

  for (const r of results) {
    console.log(`  Issued: ${r.family} (${r.type})`);
  }

  const receipts = results.map((r) => r.jws);
  console.log(`\nSession ${sessionId}: ${receipts.length} receipts issued\n`);

  // Verify all receipts
  console.log('Verifying receipts...');
  let allValid = true;
  for (const jws of receipts) {
    const result = await verifyLocal(jws, publicKey);
    if (!result.valid) {
      console.log(`  FAIL: ${result.code}`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log(`  All ${receipts.length} receipts verified successfully`);
  }

  // Session evidence summary using adapter
  const summary = buildSessionSummary(receipts);
  console.log('\nSession evidence summary:');
  console.log(`  Session:  ${summary.sessionId}`);
  console.log(`  Receipts: ${summary.receipts}`);
  console.log(`  Families: ${summary.families.join(', ')}`);
  console.log(`  Issuer:   ${summary.issuer}`);
}

main().catch(console.error);
