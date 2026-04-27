/**
 * Stripe Projects provisioning audit trail example.
 *
 * Demonstrates the observer pattern: read sanitized captures from real
 * `stripe projects <cmd> --json` runs, hash artifacts via JCS (RFC 8785),
 * and emit typed Wire records with evidence for each observed action.
 *
 * Fixtures under fixtures/ are sanitized real captures from Stripe Projects
 * CLI v0.0.53 (Stripe CLI v1.39.0).
 * In production: replace fixture reads with child_process.execFile calls.
 *
 * Receipt type strings are experimental and subject to change if and when
 * they are formally registered.
 *
 * Run: npx tsx examples/stripe-projects-provisioning/demo.ts
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeypair, jcsHash } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixture loading (sanitized real captures from Stripe Projects CLI)
// ---------------------------------------------------------------------------

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as T;
}

interface CliResponse {
  ok: boolean;
  command: string;
  version: string;
  data: Record<string, unknown>;
  meta: { authenticated: boolean; project_initialized: boolean };
}

const stateAfterInit = loadFixture<Record<string, unknown>>('state-after-init.json');
const stateAfterAdd = loadFixture<Record<string, unknown>>('state-after-add.json');
const cliAddResponse = loadFixture<CliResponse>('cli-add-response.json');
const cliRotateResponse = loadFixture<CliResponse>('cli-rotate-response.json');
const cliLlmContextResponse = loadFixture<CliResponse>('cli-llm-context-response.json');

// ---------------------------------------------------------------------------
// Evidence type vocabulary (experimental; not formally registered)
// ---------------------------------------------------------------------------

const TYPES = {
  INIT: 'org.peacprotocol.stripe-projects/provisioning.init',
  ADD: 'org.peacprotocol.stripe-projects/provisioning.add',
  ROTATE: 'org.peacprotocol.stripe-projects/credential.rotate',
  CONTEXT: 'org.peacprotocol.stripe-projects/context.generate',
} as const;

const EXT_KEY = 'org.peacprotocol.stripe-projects/v1';

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Stripe Projects Provisioning Audit Trail Demo ===\n');

  const { privateKey, publicKey } = await generateKeypair();
  const kid = `demo-${new Date().toISOString()}`;
  const iss = 'https://api.example.com';

  // Floor to current second so occurred_at is never after iat (which issue()
  // computes via Math.floor(Date.now() / 1000)). Avoids occurred_at_skew warning.
  const nowSeconds = Math.floor(Date.now() / 1000);
  const now = new Date(nowSeconds * 1000).toISOString();

  const receipts: Array<{ label: string; jws: string }> = [];

  // -------------------------------------------------------------------------
  // 1. Project init: topology change from empty to initialized
  // -------------------------------------------------------------------------
  console.log('--- 1. Project Init ---');
  const initStateHash = await jcsHash(stateAfterInit);
  console.log('State hash (JCS + SHA-256):', initStateHash);

  const initResult = await issue({
    iss,
    kind: 'evidence',
    type: TYPES.INIT,
    pillars: ['provenance'],
    occurred_at: now,
    privateKey,
    kid,
    extensions: {
      [EXT_KEY]: {
        command: 'stripe projects init',
        project_name: 'my-project',
        state_hash_after: initStateHash,
        observer_role: 'developer',
      },
    },
  });
  receipts.push({ label: 'provisioning.init', jws: initResult.jws });
  console.log('Issued:', TYPES.INIT, `(${initResult.jws.length} bytes)\n`);

  // -------------------------------------------------------------------------
  // 2. Service add: Neon Postgres provisioned
  // -------------------------------------------------------------------------
  console.log('--- 2. Service Add (neon/postgres) ---');
  const addArtifactHash = await jcsHash(cliAddResponse.data);
  const addStateHash = await jcsHash(stateAfterAdd);
  console.log('CLI artifact hash:', addArtifactHash);
  console.log('State hash after:', addStateHash);

  const addService = cliAddResponse.data.service as Record<string, unknown>;
  const addResult = await issue({
    iss,
    kind: 'evidence',
    type: TYPES.ADD,
    pillars: ['access', 'provenance'],
    occurred_at: now,
    privateKey,
    kid,
    extensions: {
      [EXT_KEY]: {
        command: 'stripe projects add neon/postgres --name primary-db',
        provider: addService.provider,
        service_id: addService.service_id,
        resource_name: addService.name,
        resource_status: addService.status,
        artifact_hash: addArtifactHash,
        state_hash_after: addStateHash,
        observer_role: 'developer',
      },
    },
  });
  receipts.push({ label: 'provisioning.add', jws: addResult.jws });
  console.log('Issued:', TYPES.ADD, `(${addResult.jws.length} bytes)\n`);

  // -------------------------------------------------------------------------
  // 3. Credential rotate: credentials cycled for primary-db
  // -------------------------------------------------------------------------
  console.log('--- 3. Credential Rotate (primary-db) ---');
  const rotateArtifactHash = await jcsHash(cliRotateResponse.data);
  console.log('CLI artifact hash:', rotateArtifactHash);

  const rotateResult = await issue({
    iss,
    kind: 'evidence',
    type: TYPES.ROTATE,
    pillars: ['provenance'],
    occurred_at: now,
    privateKey,
    kid,
    extensions: {
      [EXT_KEY]: {
        command: 'stripe projects rotate primary-db',
        provider: 'Neon',
        service_id: 'postgres',
        resource_name: 'primary-db',
        resource_status: cliRotateResponse.data.status,
        artifact_hash: rotateArtifactHash,
        observer_role: 'developer',
      },
    },
  });
  receipts.push({ label: 'credential.rotate', jws: rotateResult.jws });
  console.log('Issued:', TYPES.ROTATE, `(${rotateResult.jws.length} bytes)\n`);

  // -------------------------------------------------------------------------
  // 4. LLM context generation: agent context observed
  // -------------------------------------------------------------------------
  console.log('--- 4. LLM Context Generation ---');
  const contextArtifactHash = await jcsHash(cliLlmContextResponse.data);
  console.log('LLM context artifact hash:', contextArtifactHash);

  const llmProviders = cliLlmContextResponse.data.providers as Array<Record<string, unknown>>;
  const contextResult = await issue({
    iss,
    kind: 'evidence',
    type: TYPES.CONTEXT,
    pillars: ['provenance'],
    occurred_at: now,
    privateKey,
    kid,
    extensions: {
      [EXT_KEY]: {
        command: 'stripe projects llm-context',
        project_name: 'my-project',
        providers_with_context: llmProviders.length,
        artifact_hash: contextArtifactHash,
        observer_role: 'agent',
      },
    },
  });
  receipts.push({ label: 'context.generate', jws: contextResult.jws });
  console.log('Issued:', TYPES.CONTEXT, `(${contextResult.jws.length} bytes)\n`);

  // -------------------------------------------------------------------------
  // Verify all receipts offline
  // -------------------------------------------------------------------------
  console.log('=== Verification ===\n');
  let allValid = true;

  for (const { label, jws } of receipts) {
    const result = await verifyLocal(jws, publicKey);
    if (result.valid && result.variant === 'wire-02') {
      console.log(
        `[VALID] ${label}: kind=${result.claims.kind}, pillars=${(result.claims.pillars ?? []).join(',')}`
      );
      if (result.warnings.length > 0) {
        for (const w of result.warnings) {
          console.log(`  warning: ${w.code} (${w.pointer ?? 'n/a'})`);
        }
      }
    } else {
      console.log(`[INVALID] ${label}:`, result.valid ? 'unexpected variant' : result.message);
      allValid = false;
    }
  }

  // Expected warnings for experimental types:
  //   unknown_extension_preserved: unregistered extension key (not yet in registry)
  //   type_unregistered: receipt type not in registered type registry
  console.log(`\n${receipts.length} receipts issued and verified.`);
  if (!allValid) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
