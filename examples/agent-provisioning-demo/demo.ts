/**
 * Concrete sanitized provisioning lifecycle demo.
 *
 * An external CLI is observed performing a small provisioning workflow
 * (init -> add a managed resource -> rotate its credentials). The
 * caller reads the upstream JSON envelopes, hashes upstream artifacts
 * via JCS (RFC 8785), and emits one signed PEAC record per observed
 * event using the canonical
 * `org.peacprotocol/provisioning-lifecycle` extension namespace and
 * the four corresponding `*-observed` type URIs.
 *
 * The fixtures under fixtures/ are vendor-neutral synthetic JSON
 * envelopes that follow the shape an upstream provisioning CLI
 * typically produces. There are no live account identifiers, secrets,
 * or domains.
 *
 * Run: pnpm demo
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeypair, jcsHash } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';
import { PROVISIONING_LIFECYCLE_EXTENSION_KEY, validateProvisioningLifecycle } from '@peac/schema';

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8')) as T;
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

const TYPE_CATALOG = 'org.peacprotocol/provisioning-catalog-observed';
const TYPE_RESOURCE = 'org.peacprotocol/provisioning-resource-observed';
const TYPE_CREDENTIAL = 'org.peacprotocol/provisioning-credential-observed';

const ISSUER = 'https://provisioning-audit.example.com';
const KID = 'agent-provisioning-demo';

const PROVIDER_REF = 'urn:peac:provider:provider-x';
const ACCOUNT_REF = 'urn:peac:account:tenant-001';
const RESOURCE_REF = 'urn:peac:resource:primary-db';
const CREDENTIAL_STORE_REF = 'urn:peac:provider:secret-store-x';
const CREDENTIAL_SURFACE_REF = 'urn:peac:secret:primary-db-credentials';

async function main(): Promise<void> {
  console.log('=== Agent Provisioning Demo ===\n');

  const { privateKey, publicKey } = await generateKeypair();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const occurredAt = new Date(nowSeconds * 1000).toISOString();

  const records: Array<{ label: string; type: string; jws: string }> = [];

  async function issueOne(
    label: string,
    type: string,
    extension: Record<string, unknown>
  ): Promise<void> {
    const validation = validateProvisioningLifecycle(extension);
    if (!validation.ok) {
      console.error(`[FAIL] ${label}: extension validation failed`);
      for (const err of validation.errors) {
        const where = err.path ? ` (${err.path})` : '';
        console.error(`  - ${err.code}${where}: ${err.message}`);
      }
      throw new Error(`extension validation failed for ${label}`);
    }

    const result = await issue({
      iss: ISSUER,
      kind: 'evidence',
      type,
      pillars: ['provenance'],
      occurred_at: occurredAt,
      privateKey,
      kid: KID,
      extensions: {
        [PROVISIONING_LIFECYCLE_EXTENSION_KEY]: extension,
      },
    });
    records.push({ label, type, jws: result.jws });
    console.log(`[OK]   ${label} -> ${type} (${result.jws.length} bytes)`);
  }

  // 1. Caller observed the upstream CLI initializing the workspace.
  //    Records the catalog scope: an entry digest of the post-init
  //    workspace state plus the retrieval time.
  console.log('--- 1. Catalog observed (workspace init) ---');
  const initEntryDigest = `sha256:${await jcsHash(stateAfterInit)}`;
  await issueOne('catalog-init', TYPE_CATALOG, {
    event_kind: 'provisioning-catalog-observed',
    observed_at: occurredAt,
    observed_by_ref: 'urn:peac:agent:demo-observer',
    catalog: {
      service_id: 'provider-x/managed-database',
      retrieved_at: occurredAt,
      entry_digest: initEntryDigest,
    },
    provider: {
      provider_ref: PROVIDER_REF,
    },
  });

  // 2. Caller observed a managed-database resource being provisioned.
  //    The CLI add-response is bound into the record via
  //    upstream_artifact_digest; the post-add workspace state digest is
  //    computed and printed for operator inspection but is not bound
  //    into a separate field of this record (the schema's resource
  //    scope does not carry a workspace-state digest).
  console.log('--- 2. Resource observed (provisioned) ---');
  const addArtifactDigest = `sha256:${await jcsHash(cliAddResponse.data)}`;
  const stateAfterAddDigest = `sha256:${await jcsHash(stateAfterAdd)}`;
  await issueOne('resource-add', TYPE_RESOURCE, {
    event_kind: 'provisioning-resource-observed',
    observed_at: occurredAt,
    observed_by_ref: 'urn:peac:agent:demo-observer',
    upstream_artifact_digest: addArtifactDigest,
    provider: {
      provider_ref: PROVIDER_REF,
      account_ref: ACCOUNT_REF,
    },
    resource: {
      kind: 'managed-database',
      resource_ref: RESOURCE_REF,
      sub_event: 'provisioned',
    },
  });
  console.log(
    `     state-after-add digest (operator note, not bound into the record): ${stateAfterAddDigest}`
  );

  // 3. Caller observed a credential being issued alongside the new
  //    resource. The credential material is never captured; the
  //    storage_surface block records only the abstract storage kind
  //    plus opaque references.
  console.log('--- 3. Credential observed (issued) ---');
  await issueOne('credential-issue', TYPE_CREDENTIAL, {
    event_kind: 'provisioning-credential-observed',
    observed_at: occurredAt,
    observed_by_ref: 'urn:peac:agent:demo-observer',
    upstream_artifact_digest: addArtifactDigest,
    provider: {
      provider_ref: PROVIDER_REF,
    },
    credential: {
      sub_event: 'issued',
      issuer_ref: PROVIDER_REF,
      subject_ref: RESOURCE_REF,
      storage_surface: {
        kind: 'external_secret_store',
        provider_ref: CREDENTIAL_STORE_REF,
        surface_ref: CREDENTIAL_SURFACE_REF,
        material_redaction: 'never_capture',
      },
    },
  });

  // 4. Caller observed the same credential being rotated.
  console.log('--- 4. Credential observed (rotated) ---');
  const rotateArtifactDigest = `sha256:${await jcsHash(cliRotateResponse.data)}`;
  await issueOne('credential-rotate', TYPE_CREDENTIAL, {
    event_kind: 'provisioning-credential-observed',
    observed_at: occurredAt,
    observed_by_ref: 'urn:peac:agent:demo-observer',
    upstream_artifact_digest: rotateArtifactDigest,
    provider: {
      provider_ref: PROVIDER_REF,
    },
    credential: {
      sub_event: 'rotated',
      issuer_ref: PROVIDER_REF,
      subject_ref: RESOURCE_REF,
      storage_surface: {
        kind: 'external_secret_store',
        provider_ref: CREDENTIAL_STORE_REF,
        surface_ref: CREDENTIAL_SURFACE_REF,
        material_redaction: 'never_capture',
      },
    },
  });

  // Verify all records offline.
  console.log('\n=== Verification ===\n');
  let allValid = true;
  for (const { label, type, jws } of records) {
    const result = await verifyLocal(jws, publicKey);
    if (result.valid) {
      console.log(`[VALID] ${label} (${type})`);
    } else {
      const reason = 'message' in result ? result.message : 'invalid';
      console.log(`[INVALID] ${label} (${type}): ${reason}`);
      allValid = false;
    }
  }

  console.log(`\n${records.length} records issued and verified.`);
  if (!allValid) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
