/**
 * Runtime Governance Records Demo
 *
 * Issues 6 signed PEAC Interaction Records (one per governance record
 * family) using pinned AGT-shaped fixtures, verifies each locally,
 * and prints a session summary.
 *
 * PEAC validates the structure and signature of the PEAC record,
 * not the truth of the upstream governance decision or the operating
 * effectiveness of the upstream control plane.
 *
 * Run with: pnpm demo
 */

import { verifyLocal, generateKeypair } from '@peac/protocol';
import {
  issueRuntimeGovernanceRecord,
  mapAgtEvent,
  buildSessionSummary,
  type AgtEventInput,
} from '@peac/adapter-runtime-governance';

const FIXTURES: AgtEventInput[] = [
  {
    family: 'policy_decision',
    event: 'policy.evaluated',
    data: {
      action: 'allow',
      matched_rule: 'default-allow',
      policy_name: 'agent-web-access',
      evaluation_ms: 2.3,
    },
    source: {
      system: 'microsoft-agt',
      event_type: 'ai.agentmesh.policy.evaluation',
      timestamp: '2026-04-13T10:00:00Z',
    },
  },
  {
    family: 'audit_entry',
    event: 'audit.created',
    data: {
      entry_id: 'ae-001',
      outcome: 'success',
      previous_hash: 'sha256:81f724511c47ba3f0ab27c29d59aee58a79fe16d0131895bf1b77991e1b4c626',
      entry_hash: 'sha256:79ec0507a9934cc814c1947ed139de9353f15bdfa9d9f6aa1b23a63fe33e371c',
      trace_id: 'trace-001',
    },
    source: {
      system: 'microsoft-agt',
      event_type: 'ai.agentmesh.audit.entry',
    },
  },
  {
    family: 'authority_scope',
    event: 'authority.narrowed',
    data: {
      decision: 'allow_narrowed',
      effective_scope: ['read:files', 'write:sandbox'],
      trust_tier: 'standard',
      matched_invariants: ['max-scope-depth'],
    },
    source: {
      system: 'microsoft-agt',
      event_type: 'ai.agentmesh.authority.resolved',
    },
  },
  {
    family: 'lifecycle_event',
    event: 'lifecycle.transitioned',
    data: {
      lifecycle_event_type: 'provisioned',
      previous_state: 'pending',
      new_state: 'active',
      actor: 'orchestrator',
    },
    source: {
      system: 'microsoft-agt',
      event_type: 'ai.agentmesh.agent.registered',
    },
  },
  {
    family: 'trust_observation',
    event: 'trust.observed',
    data: {
      peer_id: 'agent-002',
      action: 'tool_call',
      success: true,
      trust_delta: 5,
      trust_score: 750,
    },
    source: {
      system: 'microsoft-agt',
      event_type: 'ai.agentmesh.trust.score.updated',
    },
  },
  {
    family: 'compliance_observation',
    event: 'compliance.assessed',
    data: {
      framework: 'EU_AI_ACT',
      compliance_score: 92,
      violation_count: 1,
      evidence_item_count: 47,
    },
    source: {
      system: 'microsoft-agt',
      event_type: 'ai.agentmesh.audit.integrity.verified',
    },
  },
];

async function main() {
  console.log('Runtime Governance Records Demo\n');

  const { privateKey, publicKey } = await generateKeypair();
  const sessionId = 'sess-rtgov-demo-001';

  const opts = {
    privateKey,
    kid: 'rtgov-demo-key-1',
    issuer: 'https://governance-demo.example.com',
    sessionId,
    agentId: 'demo-agent-001',
    provider: 'demo-runtime',
  };

  // Issue 6 records (one per family)
  const results = [];
  for (const fixture of FIXTURES) {
    const event = mapAgtEvent(fixture);
    const result = await issueRuntimeGovernanceRecord(event, opts);
    results.push(result);
    console.log(`  Issued: ${result.family} (${result.type})`);
  }

  console.log(`\n${results.length} receipts issued\n`);

  // Verify all receipts
  console.log('Verifying receipts...');
  let verifiedCount = 0;
  for (const r of results) {
    const verification = await verifyLocal(r.jws, publicKey);
    if (verification.valid) {
      verifiedCount++;
    } else {
      console.error(`  FAILED: ${r.family}`);
    }
  }
  console.log(`${verifiedCount} verified\n`);

  // Build session summary
  const summary = buildSessionSummary(results.map((r) => r.jws));
  console.log('Session Summary:');
  console.log(`  Session:  ${summary.sessionId}`);
  console.log(`  Receipts: ${summary.receipts}`);
  console.log(`  Families: ${summary.families.join(', ')}`);
  console.log(`  Unknown:  ${summary.unknownTypeCount}`);
  console.log(`  Issuer:   ${summary.issuer}`);

  if (verifiedCount !== results.length || results.length !== 6) {
    console.error('\nDemo FAILED');
    process.exit(1);
  }

  console.log('\nDemo OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
