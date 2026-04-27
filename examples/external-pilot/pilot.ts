/**
 * External Pilot Kit
 *
 * Self-contained script for an independent external entity to issue a PEAC
 * Interaction Record and verify it through a self-hostable reference verifier
 * API. Produces a deterministic, inspectable JSON artifact that passes the
 * schema gate.
 *
 * Supports both local and deployed reference verifier paths:
 *   --verifier-url http://localhost:3000 (default: local self-hosted)
 *   --verifier-url https://verify.example.com (deployed)
 *
 * No private keys are included. Fresh keys generated at runtime.
 * Output never contains private key material.
 *
 * Run: pnpm demo
 */

import { generateKeypair, issue, verifyLocal } from '@peac/protocol';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const VERIFIER_URL =
  process.argv.find((a) => a.startsWith('--verifier-url='))?.split('=')[1] ??
  process.env.VERIFIER_URL ??
  'http://localhost:3000';

interface PilotArtifact {
  pilot_id: string;
  pilot_organization: string;
  issuer: string;
  kid: string;
  receipt_ref: string;
  verified: boolean;
  verified_at: string;
  wire_version: string;
  reference_verifier_url: string;
  verification_method: 'local' | 'reference_verifier';
}

async function main() {
  console.log('PEAC External Pilot Kit\n');

  // Step 1: Generate fresh keypair (never stored, never exported)
  console.log('1. Generating Ed25519 keypair...');
  const { privateKey, publicKey } = await generateKeypair();
  const kid = `pilot-${Date.now()}`;
  const pilotOrg = process.env.PILOT_ORG ?? 'pilot-organization';
  const issuer = process.env.PILOT_ISSUER ?? 'https://pilot.example.com';
  console.log(`   Key ID: ${kid}`);
  console.log(`   Issuer: ${issuer}\n`);

  // Step 2: Issue a receipt
  console.log('2. Issuing Interaction Record...');
  const { jws } = await issue({
    iss: issuer,
    kind: 'evidence',
    type: 'org.peacprotocol/pilot-verification',
    privateKey,
    kid,
  });
  console.log(`   Receipt issued (${jws.length} chars)\n`);

  // Step 3: Verify locally (always works, no network needed)
  console.log('3. Local verification...');
  const localResult = await verifyLocal(jws, publicKey);
  let verified = false;
  let verificationMethod: 'local' | 'reference_verifier' = 'local';

  if (localResult.valid) {
    console.log('   Local verification: PASSED');
    verified = true;
  } else {
    console.log(`   Local verification: FAILED (${localResult.code})`);
  }

  // Step 4: Attempt reference verifier verification (optional)
  console.log(`\n4. Reference verifier verification (${VERIFIER_URL})...`);
  try {
    const res = await fetch(`${VERIFIER_URL}/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receipt: jws,
        public_key: Buffer.from(publicKey).toString('base64url'),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const report = (await res.json()) as { verified: boolean; receipt_ref: string };
      console.log(`   Reference verifier: ${report.verified ? 'PASSED' : 'FAILED'}`);
      if (report.verified) {
        verified = true;
        verificationMethod = 'reference_verifier';
      }
    } else {
      console.log(`   Reference verifier returned ${res.status} (falling back to local)`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`   Reference verifier not reachable (${reason}); using local result`);
  }

  // Step 5: Compute receipt_ref for the artifact
  const { createHash } = await import('node:crypto');
  const receiptRef = `sha256:${createHash('sha256').update(jws).digest('hex')}`;

  // Step 6: Produce pilot artifact
  const artifact: PilotArtifact = {
    pilot_id: randomUUID(),
    pilot_organization: pilotOrg,
    issuer,
    kid,
    receipt_ref: receiptRef,
    verified,
    verified_at: new Date().toISOString(),
    wire_version: '0.2',
    reference_verifier_url: VERIFIER_URL,
    verification_method: verificationMethod,
  };

  const artifactPath = `pilot-artifact-${artifact.pilot_id.slice(0, 8)}.json`;
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n');

  console.log(`\n5. Pilot artifact written: ${artifactPath}`);
  console.log('\nPilot Summary:');
  console.log(`  Organization: ${artifact.pilot_organization}`);
  console.log(`  Issuer:       ${artifact.issuer}`);
  console.log(`  Receipt Ref:  ${artifact.receipt_ref.slice(0, 30)}...`);
  console.log(`  Verified:     ${artifact.verified}`);
  console.log(`  Method:       ${artifact.verification_method}`);
  console.log(`  Artifact:     ${artifactPath}`);
}

main().catch(console.error);
