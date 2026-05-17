/**
 * Runtime Composition Records Demo
 *
 * The runtime governance toolkit decides what an agent is allowed to do,
 * narrows authority, and transitions lifecycle state. PEAC reads what the
 * runtime reported, signs a portable interaction record per event, and
 * verifies the records offline.
 *
 * PEAC validates the structure and signature of the PEAC record. PEAC does
 * not govern, enforce, score, route, authorize, orchestrate, host, or
 * control runtime behavior. The runtime keeps owning execution; PEAC
 * carries the proof.
 *
 * Run with: pnpm demo
 */

import { verifyLocal, generateKeypair } from '@peac/protocol';
import {
  issueRuntimeGovernanceRecord,
  normalizeRuntimeGovernanceEvent,
  buildSessionSummary,
} from '@peac/adapter-runtime-governance';

// Three generic runtime-governance fixtures. The example constructs the
// generic `RuntimeGovernanceEvent` shape directly and normalizes it
// through the adapter's public `normalizeRuntimeGovernanceEvent`. A
// real integration would set `upstream.source_system` to the actual
// runtime's identifier and `upstream.source_event_type` to the
// runtime's native event-type string. PEAC preserves those identifiers
// as reported inputs to the signed record.
const FIXTURES = [
  {
    event_name: 'policy.evaluated',
    payload: {
      family: 'policy_decision' as const,
      action: 'allow',
      matched_rule: 'default-allow',
      policy_name: 'agent-web-access',
      evaluation_ms: 1.8,
    },
    upstream: {
      source_system: 'runtime-governance-toolkit',
      source_event_type: 'governance.policy.evaluation',
      source_timestamp: '2026-05-17T09:00:00Z',
    },
  },
  {
    event_name: 'authority.narrowed',
    payload: {
      family: 'authority_scope' as const,
      decision: 'allow_narrowed',
      effective_scope: ['read:files', 'write:sandbox'],
      trust_tier: 'standard',
      matched_invariants: ['max-scope-depth'],
    },
    upstream: {
      source_system: 'runtime-governance-toolkit',
      source_event_type: 'governance.authority.resolved',
    },
  },
  {
    event_name: 'lifecycle.transitioned',
    payload: {
      family: 'lifecycle_event' as const,
      lifecycle_event_type: 'provisioned',
      previous_state: 'pending',
      new_state: 'active',
      actor: 'runtime-service',
    },
    upstream: {
      source_system: 'runtime-governance-toolkit',
      source_event_type: 'governance.agent.registered',
    },
  },
];

async function main() {
  console.log('Runtime Composition Records Demo\n');
  console.log('The runtime decides; PEAC records.\n');

  const { privateKey, publicKey } = await generateKeypair();
  const sessionId = 'sess-runtime-composition-demo-001';

  const opts = {
    privateKey,
    kid: 'runtime-composition-demo-key-1',
    issuer: 'https://composition-demo.example.com',
    sessionId,
    agentId: 'demo-agent-001',
    provider: 'demo-runtime',
  };

  // Issue one record per fixture. The example constructs the generic
  // event shape directly and normalizes through the adapter's public
  // generic normalizer; no source-specific mapper is imported.
  const results = [];
  for (const fixture of FIXTURES) {
    const event = normalizeRuntimeGovernanceEvent(fixture);
    const result = await issueRuntimeGovernanceRecord(event, opts);
    results.push(result);
    console.log(`[OK]         ${result.type}`);
  }

  console.log(`\n${results.length} records issued\n`);

  // Verify each record offline (no call to the runtime)
  let verifiedCount = 0;
  for (const r of results) {
    const verification = await verifyLocal(r.jws, publicKey);
    if (verification.valid) {
      verifiedCount++;
    } else {
      console.error(`  FAILED verify: ${r.family}`);
    }
  }
  console.log(
    `[VERIFY OK]  ${verifiedCount} records verified, ${results.length - verifiedCount} failed\n`
  );

  // Build deterministic session summary
  const summary = buildSessionSummary(results.map((r) => r.jws));
  console.log('Session summary:');
  console.log(`  Session:  ${summary.sessionId}`);
  console.log(`  Records:  ${summary.receipts}`);
  console.log(`  Families: ${summary.families.join(' / ')}`);
  console.log(`  Issuer:   ${summary.issuer}`);

  if (verifiedCount !== results.length || results.length !== FIXTURES.length) {
    console.error('\nDemo FAILED');
    process.exit(1);
  }

  console.log('\nDemo OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
