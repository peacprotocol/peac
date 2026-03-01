/**
 * Content Signals Observation Demo
 *
 * Demonstrates the three-state content signal observation model:
 * 1. Parse signals from robots.txt, Content-Usage header, and tdmrep.json
 * 2. Resolve conflicts using source precedence (tdmrep > Content-Usage > robots.txt)
 * 3. Issue a PEAC receipt recording the observation
 * 4. Verify the receipt offline
 *
 * Run: pnpm demo
 */

import { generateKeypair } from '@peac/crypto';
import { createObservation, resolveSignals, parseRobotsTxt, type ContentSignalObservation } from '@peac/mappings-content-signals';
import { issue, verifyLocal } from '@peac/protocol';

// --- Sample signal sources (pre-fetched; no network I/O per DD-55) ---

const robotsTxt = `
User-agent: *
Disallow: /private/

# Content signal directives
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Allow: /public/
`;

const contentUsageHeader = 'train-ai=n, search=y';

const tdmrepJson = JSON.stringify({
  'tdm-reservation': 0,
  'tdm-policy': 'https://publisher.example/terms',
});

// --- 1. Create observation from all sources ---

const observation: ContentSignalObservation = createObservation({
  target_uri: 'https://publisher.example/article/2026-03-01',
  robots_txt: robotsTxt,
  content_usage: contentUsageHeader,
  tdmrep_json: tdmrepJson,
});

console.log('=== Content Signal Observation ===\n');
console.log('Target:', observation.target_uri);
console.log('Observed at:', observation.observed_at);
console.log('Sources checked:', observation.sources_checked.join(', '));
console.log('\nResolved signals:');
for (const signal of observation.signals) {
  console.log(`  ${signal.purpose}: ${signal.decision} (source: ${signal.source})`);
}

// --- 2. Demonstrate standalone robots.txt parsing ---

console.log('\n=== Robots.txt Parse (standalone) ===\n');
const robotsSignals = parseRobotsTxt(robotsTxt);
for (const signal of robotsSignals) {
  console.log(`  ${signal.purpose}: ${signal.decision}`);
}

// --- 3. Demonstrate precedence resolution ---

console.log('\n=== Precedence Resolution ===\n');
const resolved = resolveSignals([...robotsSignals, ...observation.signals]);
for (const signal of resolved) {
  console.log(`  ${signal.purpose}: ${signal.decision} (winning source: ${signal.source})`);
}

// --- 4. Issue a receipt recording the observation ---

console.log('\n=== Receipt Issuance ===\n');

const { publicKey, privateKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://gateway.example.com',
  aud: 'https://publisher.example',
  amt: 0,
  cur: 'USD',
  rail: 'none',
  reference: 'content-signal-observation',
  privateKey,
  kid: 'demo-key-2026-03',
});

console.log('Receipt JWS:', jws.slice(0, 60) + '...');

// --- 5. Verify the receipt offline ---

const result = await verifyLocal(jws, publicKey);

console.log('Valid:', result.valid);
if (result.valid) {
  console.log('Issuer:', result.claims.iss);
  console.log('Audience:', result.claims.aud);
}

console.log('\n=== Three-State Summary ===\n');
console.log('The observation model records what was found (allow/deny/unspecified).');
console.log('It never enforces policy. Downstream systems decide what action to take.');
