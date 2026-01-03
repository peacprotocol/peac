/**
 * Agent Identity Example - Agent Side
 *
 * This example demonstrates how an agent creates identity attestations
 * for both operator-verified and user-delegated scenarios.
 */

import {
  createAgentIdentityAttestation,
  type AgentIdentityAttestation,
  type ControlType,
} from '@peac/schema';

/**
 * Create an operator-verified bot attestation.
 *
 * Operator bots are controlled by an organization (e.g., search crawlers).
 */
export function createOperatorBot(options: {
  issuer: string;
  agentId: string;
  operator: string;
  capabilities?: string[];
  keyId?: string;
  keyDirectoryUrl?: string;
}): AgentIdentityAttestation {
  return createAgentIdentityAttestation({
    issuer: options.issuer,
    agent_id: options.agentId,
    control_type: 'operator',
    operator: options.operator,
    capabilities: options.capabilities,
    key_directory_url: options.keyDirectoryUrl,
    proof: options.keyId
      ? {
          method: 'http-message-signature',
          key_id: options.keyId,
          alg: 'EdDSA',
        }
      : undefined,
  });
}

/**
 * Create a user-delegated agent attestation.
 *
 * User-delegated agents act on behalf of human users (e.g., AI assistants).
 */
export function createUserDelegatedAgent(options: {
  issuer: string;
  agentId: string;
  userId?: string;
  delegationChain?: string[];
  capabilities?: string[];
}): AgentIdentityAttestation {
  return createAgentIdentityAttestation({
    issuer: options.issuer,
    agent_id: options.agentId,
    control_type: 'user-delegated',
    user_id: options.userId,
    delegation_chain: options.delegationChain,
    capabilities: options.capabilities,
  });
}

// Example usage when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== Operator Bot Attestation ===\n');
  const operatorBot = createOperatorBot({
    issuer: 'https://crawler.example.com',
    agentId: 'bot:crawler-prod-001',
    operator: 'Example Crawler Inc.',
    capabilities: ['crawl', 'index'],
    keyId: 'key-2026-01',
    keyDirectoryUrl: 'https://crawler.example.com/.well-known/jwks.json',
  });
  console.log(JSON.stringify(operatorBot, null, 2));

  console.log('\n=== User-Delegated Agent Attestation ===\n');
  const userAgent = createUserDelegatedAgent({
    issuer: 'https://assistant.example.com',
    agentId: 'agent:assistant-001',
    userId: 'user:alice-opaque-id',
    delegationChain: ['user:alice', 'app:myapp'],
    capabilities: ['inference', 'search'],
  });
  console.log(JSON.stringify(userAgent, null, 2));
}
