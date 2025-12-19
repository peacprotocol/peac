/**
 * Pay-Per-Crawl Example
 *
 * Demonstrates the complete PEAC flow for AI crawlers:
 * 1. Publisher defines policy (peac-policy.yaml)
 * 2. Policy compiles to peac.txt for discovery
 * 3. Crawler evaluates policy to determine access requirements
 * 4. Crawler obtains receipt if payment required
 * 5. Publisher verifies receipt before granting access
 *
 * This example uses local stubs - no external services required.
 */

import {
  parsePolicy,
  evaluate,
  compilePeacTxt,
  compileRobotsSnippet,
  type PolicyDocument,
  type EvaluationContext,
} from '@peac/policy-kit';
import { issue } from '@peac/protocol';
import { generateKeypair, verify } from '@peac/crypto';
import { toCoreClaims, PEACReceiptClaims } from '@peac/schema';

console.log('\n=== PEAC Pay-Per-Crawl Demo ===\n');

// ============================================================================
// Step 1: Publisher defines policy
// ============================================================================
console.log('1. Publisher defines policy\n');

const policyYaml = `
version: "peac-policy/0.1"

defaults:
  decision: deny
  reason: No matching rule found

rules:
  # Allow authenticated subscribers
  - name: subscribed-agents
    subject:
      type: agent
      labels:
        - subscribed
    purpose: crawl
    decision: allow
    reason: Subscribed agents have unlimited access

  # Require payment for unauthenticated AI crawlers
  - name: ai-crawler-pay
    subject:
      type: agent
      labels:
        - ai-crawler
    purpose: crawl
    licensing_mode: pay_per_crawl
    decision: allow
    reason: Pay-per-crawl access granted

  # Allow search engines to index (no payment)
  - name: search-engine-index
    subject:
      type: agent
      labels:
        - search-engine
    purpose: index
    decision: allow
    reason: Search engine indexing permitted

  # Deny training without explicit agreement
  - name: deny-training
    purpose: train
    decision: deny
    reason: Training not permitted without explicit agreement
`;

const policy: PolicyDocument = parsePolicy(policyYaml, 'yaml');
console.log(`   Policy version: ${policy.version}`);
console.log(`   Default decision: ${policy.defaults.decision}`);
console.log(`   Rules: ${policy.rules.length}`);

// ============================================================================
// Step 2: Compile to peac.txt
// ============================================================================
console.log('\n2. Compile to peac.txt\n');

const peacTxt = compilePeacTxt(policy, {
  contact: 'https://publisher.example.com/contact',
  attribution: 'required',
});

console.log('   --- peac.txt ---');
console.log(
  peacTxt
    .split('\n')
    .map((line) => `   ${line}`)
    .join('\n')
);
console.log('   -----------------');

// ============================================================================
// Step 3: Generate robots.txt snippet
// ============================================================================
console.log('\n3. Generate robots.txt snippet\n');

const robotsSnippet = compileRobotsSnippet(policy);
console.log('   --- robots.txt snippet ---');
console.log(
  robotsSnippet
    .split('\n')
    .map((line) => `   ${line}`)
    .join('\n')
);
console.log('   ---------------------------');

// ============================================================================
// Step 4: Crawler evaluates policy
// ============================================================================
console.log('\n4. Crawler evaluates policy\n');

// Scenario A: AI crawler without subscription
const contextA: EvaluationContext = {
  subject: { type: 'agent', labels: ['ai-crawler'] },
  purpose: 'crawl',
  licensing_mode: 'pay_per_crawl',
};

const resultA = evaluate(policy, contextA);
console.log('   Scenario A: AI crawler (no subscription)');
console.log(`     Subject: ${contextA.subject?.type} [${contextA.subject?.labels?.join(', ')}]`);
console.log(`     Purpose: ${contextA.purpose}`);
console.log(`     Decision: ${resultA.decision}`);
console.log(`     Matched rule: ${resultA.matched_rule ?? '(default)'}`);
console.log(`     Reason: ${resultA.reason ?? 'N/A'}`);
console.log(
  `     -> ${resultA.decision === 'allow' ? 'Access allowed (payment via licensing_mode)' : 'Access denied'}`
);

// Scenario B: Subscribed agent
const contextB: EvaluationContext = {
  subject: { type: 'agent', labels: ['subscribed'] },
  purpose: 'crawl',
};

const resultB = evaluate(policy, contextB);
console.log('\n   Scenario B: Subscribed agent');
console.log(`     Subject: ${contextB.subject?.type} [${contextB.subject?.labels?.join(', ')}]`);
console.log(`     Purpose: ${contextB.purpose}`);
console.log(`     Decision: ${resultB.decision}`);
console.log(`     Matched rule: ${resultB.matched_rule ?? '(default)'}`);
console.log(
  `     -> ${resultB.decision === 'allow' ? 'Access granted (no payment needed)' : 'Unexpected'}`
);

// Scenario C: Training request (denied)
const contextC: EvaluationContext = {
  subject: { type: 'agent', labels: ['ai-crawler'] },
  purpose: 'train',
};

const resultC = evaluate(policy, contextC);
console.log('\n   Scenario C: Training request');
console.log(`     Subject: ${contextC.subject?.type} [${contextC.subject?.labels?.join(', ')}]`);
console.log(`     Purpose: ${contextC.purpose}`);
console.log(`     Decision: ${resultC.decision}`);
console.log(`     Matched rule: ${resultC.matched_rule ?? '(default)'}`);
console.log(`     -> ${resultC.decision === 'deny' ? 'Access denied' : 'Unexpected'}`);

// ============================================================================
// Step 5: Crawler obtains and presents receipt
// ============================================================================
console.log('\n5. Crawler obtains and presents receipt\n');

async function demonstrateReceiptFlow() {
  const { privateKey, publicKey } = await generateKeypair();

  // Crawler issues receipt (in real scenario, this comes from payment provider)
  const receiptResult = await issue({
    iss: 'https://payment.example.com',
    aud: 'https://publisher.example.com/content/article-123',
    amt: 100, // $1.00
    cur: 'USD',
    rail: 'stripe',
    reference: 'cs_crawl_demo_123',
    asset: 'USD',
    env: 'test',
    evidence: { purpose: 'crawl' },
    privateKey,
    kid: 'demo-key-2025',
  });

  console.log(`   Receipt issued (${receiptResult.jws.length} chars)`);

  // Publisher verifies receipt
  const { valid, payload } = await verify<PEACReceiptClaims>(receiptResult.jws, publicKey);
  if (!valid) {
    throw new Error('Receipt verification failed');
  }
  console.log('   Receipt verified successfully');

  // Extract core claims for logging/audit
  const core = toCoreClaims(payload);
  console.log('   Core claims:');
  console.log(`     iss: ${core.iss}`);
  console.log(`     aud: ${core.aud}`);
  console.log(`     amt: ${core.amt} ${core.cur}`);

  // Decision: allow access
  console.log('\n   -> Access granted with valid receipt');
}

await demonstrateReceiptFlow();

console.log('\n=== Demo Complete ===\n');
