/**
 * Content Signals Observation Demo
 *
 * Demonstrates the three-state content signal observation model (DD-136):
 * 1. Parse signals from robots.txt, Content-Usage header, and tdmrep.json
 * 2. Resolve conflicts using DD-137 source precedence:
 *    tdmrep.json > Content-Signal > Content-Usage > robots.txt
 *    (Content-Signal parser reserved for future; 3 of 4 sources implemented)
 * 3. Issue a PEAC receipt with the observation attached via extensions
 * 4. Verify the receipt offline
 *
 * All content is pre-fetched (no network I/O per DD-55).
 *
 * Run: pnpm demo
 */

import { generateKeypair } from '@peac/crypto';
import {
  createObservation,
  resolveSignals,
  parseRobotsTxt,
  type ContentSignalObservation,
} from '@peac/mappings-content-signals';
import { issueWire02, verifyLocal } from '@peac/protocol';

// --- Sample signal sources (pre-fetched; no network I/O per DD-55) ---

const robotsTxt = `
User-agent: *
Disallow: /private/

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Allow: /public/
`;

// Content-Usage header (AIPREF draft, Structured Fields Dictionary per RFC 9651).
// Values are tokens: y = allow, n = deny.
const contentUsageHeader = 'train-ai=n, search=y';

// tdmrep.json (EU TDM Directive 2019/790, Art. 4).
// Single-object form supported; applies site-wide.
// Array form (path-specific rules) reserved for future implementation.
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

// --- 4. Issue a Wire 0.2 receipt with observation attached via extensions ---

console.log('\n=== Receipt Issuance ===\n');

const { publicKey, privateKey } = await generateKeypair();

const { jws } = await issueWire02({
  iss: 'https://gateway.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol.receipt.content_signal',
  privateKey,
  kid: 'demo-key-2026-03',
  extensions: {
    'org.peacprotocol/content_signal': {
      target_uri: observation.target_uri,
      observed_at: observation.observed_at,
      sources_checked: observation.sources_checked,
      signals: observation.signals.map((s) => ({
        purpose: s.purpose,
        decision: s.decision,
        source: s.source,
      })),
    },
  },
});

console.log('Receipt JWS:', jws.slice(0, 60) + '...');
console.log('Observation attached via extensions["org.peacprotocol/content_signal"]');

// --- 5. Verify the receipt offline ---

const result = await verifyLocal(jws, publicKey);

console.log('\nValid:', result.valid);
if (result.valid) {
  console.log('Issuer:', result.claims.iss);
  console.log('Kind:', result.claims.kind);
  console.log('Type:', result.claims.type);

  // Confirm observation is present in extensions
  const csExt = result.claims.extensions?.['org.peacprotocol/content_signal'] as
    | Record<string, unknown>
    | undefined;
  if (csExt) {
    console.log('Content signal ext: target_uri =', csExt.target_uri);
    console.log('Content signal ext: signals =', JSON.stringify(csExt.signals));
  }
}

console.log('\n=== Three-State Summary ===\n');
console.log('The observation model records what was found (allow/deny/unspecified).');
console.log('It never enforces policy. Downstream systems decide what action to take.');
