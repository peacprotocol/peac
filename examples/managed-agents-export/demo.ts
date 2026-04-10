/**
 * Managed Agents Session Evidence Summary Demo
 *
 * Demonstrates PEAC as a portable evidence layer for managed agent runtimes.
 * Issues signed interaction records for each event in a simulated agent session,
 * then verifies all receipts and prints a session evidence summary.
 *
 * Demo only, not production-hardened. No runtime-specific logic.
 * Run with: pnpm demo
 */

import { issue, verifyLocal, generateKeypair } from '@peac/protocol';

interface SessionEvent {
  family: string;
  type: string;
  event: string;
  details?: Record<string, unknown>;
}

async function main() {
  console.log('Managed Agents Evidence Export Demo\n');

  const { privateKey, publicKey } = await generateKeypair();
  const kid = 'managed-agent-demo-key-1';
  const sessionId = `sess_${Date.now()}`;

  const events: SessionEvent[] = [
    { family: 'session', type: 'org.peacprotocol/managed-agent-session', event: 'session.created' },
    {
      family: 'task',
      type: 'org.peacprotocol/managed-agent-task',
      event: 'task.submitted',
      details: { task: 'Summarize document' },
    },
    {
      family: 'tool-use',
      type: 'org.peacprotocol/managed-agent-tool-use',
      event: 'tool.invoked',
      details: { tool: 'web_search', input_hash: 'sha256:abc' },
    },
    {
      family: 'mcp',
      type: 'org.peacprotocol/managed-agent-mcp-call',
      event: 'mcp.tool_call',
      details: { server: 'peac', tool: 'peac_verify' },
    },
    {
      family: 'permission',
      type: 'org.peacprotocol/managed-agent-permission',
      event: 'permission.confirmed',
      details: { action: 'file_write', user_decision: 'allow' },
    },
    {
      family: 'outcome',
      type: 'org.peacprotocol/managed-agent-outcome',
      event: 'outcome.evaluated',
      details: { result: 'success', confidence: 0.95 },
    },
  ];

  const receipts: string[] = [];

  // Issue receipts for each event
  for (const evt of events) {
    const { jws } = await issue({
      iss: 'https://managed-agent-demo.example.com',
      kind: 'evidence',
      type: evt.type,
      privateKey,
      kid,
      extensions: {
        'org.peacprotocol/managed-agent': {
          session_id: sessionId,
          event: evt.event,
          agent_id: 'demo-agent-001',
          provider: 'demo',
          ...evt.details,
        },
      },
    });
    receipts.push(jws);
    console.log(`  Issued: ${evt.family} (${evt.event})`);
  }

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

  // Session evidence summary
  console.log('\nSession evidence summary:');
  console.log(`  Session:  ${sessionId}`);
  console.log(`  Receipts: ${receipts.length}`);
  console.log(`  Events:   ${events.map((e) => e.family).join(', ')}`);
  console.log(`  Issuer:   https://managed-agent-demo.example.com`);
}

main().catch(console.error);
