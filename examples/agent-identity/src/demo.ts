/**
 * Agent Identity Example - End-to-End Demo
 *
 * This demo shows the complete flow:
 * 1. Agent creates identity attestation
 * 2. Publisher verifies identity
 * 3. Publisher makes access decision
 * 4. Receipt is issued with verified identity
 */

import { createOperatorBot, createUserDelegatedAgent } from './agent.js';
import {
  verifyAgentIdentity,
  evaluateAccess,
  type AccessPolicy,
} from './publisher.js';

// Publisher access policies
const publisherPolicies: AccessPolicy[] = [
  {
    controlType: 'operator',
    decision: 'allow',
    rateLimit: { windowSeconds: 60, maxRequests: 100 },
  },
  {
    controlType: 'user-delegated',
    capabilities: ['inference'],
    decision: 'allow',
    rateLimit: { windowSeconds: 60, maxRequests: 30 },
  },
  {
    controlType: '*',
    decision: 'deny',
  },
];

function runDemo(): void {
  console.log('=============================================');
  console.log('    PEAC Agent Identity Demo (v0.9.25)');
  console.log('=============================================\n');

  // Scenario 1: Operator bot requesting crawl access
  console.log('--- Scenario 1: Operator Bot ---\n');

  const operatorBot = createOperatorBot({
    issuer: 'https://crawler.example.com',
    agentId: 'bot:crawler-prod-001',
    operator: 'Example Crawler Inc.',
    capabilities: ['crawl', 'index'],
    keyId: 'key-2026-01',
    keyDirectoryUrl: 'https://crawler.example.com/.well-known/jwks.json',
  });

  console.log('1. Agent creates attestation:');
  console.log(`   - Agent ID: ${operatorBot.evidence.agent_id}`);
  console.log(`   - Control Type: ${operatorBot.evidence.control_type}`);
  console.log(`   - Operator: ${operatorBot.evidence.operator}`);
  console.log(`   - Capabilities: ${operatorBot.evidence.capabilities?.join(', ')}`);

  const operatorVerification = verifyAgentIdentity(operatorBot);
  console.log('\n2. Publisher verifies identity:');
  console.log(`   - Valid: ${operatorVerification.valid}`);
  console.log(`   - Agent ID: ${operatorVerification.agentId}`);
  console.log(`   - Control Type: ${operatorVerification.controlType}`);

  const operatorAccess = evaluateAccess(operatorVerification, publisherPolicies);
  console.log('\n3. Publisher evaluates access:');
  console.log(`   - Decision: ${operatorAccess.decision}`);
  if (operatorAccess.matchedPolicy?.rateLimit) {
    console.log(
      `   - Rate Limit: ${operatorAccess.matchedPolicy.rateLimit.maxRequests} req/${operatorAccess.matchedPolicy.rateLimit.windowSeconds}s`
    );
  }

  // Scenario 2: User-delegated agent requesting inference
  console.log('\n--- Scenario 2: User-Delegated Agent ---\n');

  const userAgent = createUserDelegatedAgent({
    issuer: 'https://assistant.example.com',
    agentId: 'agent:assistant-001',
    userId: 'user:alice-opaque-id',
    delegationChain: ['user:alice', 'app:myapp'],
    capabilities: ['inference', 'search'],
  });

  console.log('1. Agent creates attestation:');
  console.log(`   - Agent ID: ${userAgent.evidence.agent_id}`);
  console.log(`   - Control Type: ${userAgent.evidence.control_type}`);
  console.log(`   - User ID: ${userAgent.evidence.user_id}`);
  console.log(`   - Delegation Chain: ${userAgent.evidence.delegation_chain?.join(' -> ')}`);
  console.log(`   - Capabilities: ${userAgent.evidence.capabilities?.join(', ')}`);

  const userVerification = verifyAgentIdentity(userAgent);
  console.log('\n2. Publisher verifies identity:');
  console.log(`   - Valid: ${userVerification.valid}`);
  console.log(`   - Agent ID: ${userVerification.agentId}`);
  console.log(`   - Control Type: ${userVerification.controlType}`);

  const userAccess = evaluateAccess(userVerification, publisherPolicies);
  console.log('\n3. Publisher evaluates access:');
  console.log(`   - Decision: ${userAccess.decision}`);
  if (userAccess.matchedPolicy?.rateLimit) {
    console.log(
      `   - Rate Limit: ${userAccess.matchedPolicy.rateLimit.maxRequests} req/${userAccess.matchedPolicy.rateLimit.windowSeconds}s`
    );
  }

  // Scenario 3: Expired attestation
  console.log('\n--- Scenario 3: Expired Attestation ---\n');

  const expiredAttestation = {
    type: 'peac/agent-identity' as const,
    issuer: 'https://old.example.com',
    issued_at: '2020-01-01T00:00:00Z',
    expires_at: '2020-01-02T00:00:00Z',
    evidence: {
      agent_id: 'bot:old-bot',
      control_type: 'operator' as const,
    },
  };

  console.log('1. Agent presents expired attestation:');
  console.log(`   - Issued: ${expiredAttestation.issued_at}`);
  console.log(`   - Expires: ${expiredAttestation.expires_at}`);

  const expiredVerification = verifyAgentIdentity(expiredAttestation);
  console.log('\n2. Publisher verifies identity:');
  console.log(`   - Valid: ${expiredVerification.valid}`);
  console.log(`   - Error: ${expiredVerification.error}`);
  console.log(`   - Error Code: ${expiredVerification.errorCode}`);

  const expiredAccess = evaluateAccess(expiredVerification, publisherPolicies);
  console.log('\n3. Publisher evaluates access:');
  console.log(`   - Decision: ${expiredAccess.decision}`);

  console.log('\n=============================================');
  console.log('              Demo Complete');
  console.log('=============================================\n');
}

runDemo();
