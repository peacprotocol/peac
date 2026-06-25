/**
 * Open-model inference records: in-process demo.
 *
 * Issues a signed PEAC record for an open-model inference call and verifies it
 * offline, by reusing the existing `org.peacprotocol/agent-action-invoked-observed`
 * record and binding an "inference observation manifest" digest through the
 * existing `upstream_artifact_digest` field. No new receipt type, extension group,
 * schema field, wire, signing, or public API is introduced.
 *
 * The manifest carries only opaque refs and `sha256:<hex>` digests. Raw prompt,
 * raw response, secrets, headers, API keys, user data, and logs are never placed
 * in the manifest, the record, or any output file.
 *
 * Boundary: PEAC records what an open-model inference call reported. PEAC does not
 * serve models, route requests, enforce policy, certify compliance, or imply
 * adoption or endorsement by any model project or provider.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeypair, base64urlEncode, jcsHash } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';
import { AGENT_ACTION_EXTENSION_KEY, validateAgentAction } from '@peac/schema';

const ISSUER = 'https://issuer.example';
const KID = 'open-model-demo-key-1';
const RECORD_TYPE = 'org.peacprotocol/agent-action-invoked-observed';

/**
 * A generic, vendor-neutral request/response pair used for the offline sample.
 * These stand in for the real request and response bodies; only their digests are
 * bound into the manifest, so the exact wire shape does not matter here. The
 * placeholder content strings are scanned out by the no-leak test to prove the
 * raw bodies never reach the record or the manifest.
 */
const SAMPLE_REQUEST = {
  model: 'open-model-sample',
  input: '<<prompt>>',
} as const;

const SAMPLE_RESPONSE = {
  id: 'cmpl-offline-sample',
  output: '<<answer>>',
} as const;

/** The inference observation manifest: refs + digests only. Never raw I/O. */
export interface InferenceObservationManifest {
  model_ref: string;
  provider_ref: string;
  request_digest: string;
  response_digest: string;
  policy_ref?: string;
  policy_digest?: string;
  observed_at: string;
}

export interface InferenceDemoResult {
  ok: boolean;
  signatureValid: boolean;
  /** manifest.request_digest equals the recomputed request digest. */
  requestDigestMatches: boolean;
  /** manifest.response_digest equals the recomputed response digest. */
  responseDigestMatches: boolean;
  /** record.upstream_artifact_digest equals the recomputed manifest digest. */
  manifestDigestMatches: boolean;
  /** true if any raw prompt/response string appears in the record ext or manifest. */
  rawIoLeak: boolean;
  /** the signed record (compact JWS) and the manifest, for the writer scripts. */
  jws: string;
  manifest: InferenceObservationManifest;
  publicKeyB64u: string;
  /** a CLI `--public-key`-compatible bare Ed25519 public JWK. */
  publicJwk: { kty: 'OKP'; crv: 'Ed25519'; x: string };
  tamper?: {
    /** content tamper: signature still verifies, but the manifest digest no longer matches. */
    signatureStillValid: boolean;
    manifestDigestMatchesAfterTamper: boolean;
    /** payload tamper: signature fails. */
    payloadTamperValid: boolean;
    payloadTamperCode?: string;
  };
}

/** Build the agent-action-invoked-observed extension that binds the manifest digest. */
function buildExtension(manifest: InferenceObservationManifest, manifestDigest: string) {
  return {
    event_kind: 'agent-action-invoked-observed' as const,
    agent_ref: 'urn:peac:agent:inference-client',
    action_ref: manifest.model_ref,
    observed_at: manifest.observed_at,
    caller_ref: manifest.provider_ref,
    upstream_artifact_ref: 'urn:peac:inference-manifest:offline-sample',
    upstream_artifact_digest: manifestDigest,
    policy_ref: manifest.policy_ref,
  };
}

/** Flip a byte of the JWS payload, keeping the signature, so verification fails. */
function tamperPayload(jws: string): string {
  const [header, payload, signature] = jws.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  decoded.iss = 'https://attacker.example.com';
  const reEncoded = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
  return `${header}.${reEncoded}.${signature}`;
}

export interface RunOptions {
  /** also produce the tamper beats. */
  tamper?: boolean;
  /** suppress console output. */
  quiet?: boolean;
}

export async function runInferenceDemo(opts: RunOptions = {}): Promise<InferenceDemoResult> {
  const { tamper = false, quiet = false } = opts;
  const log = (m: string) => {
    if (!quiet) console.log(m);
  };

  const { privateKey, publicKey } = await generateKeypair();

  // Offline-sample mode: deterministic request/response, no network.
  const requestDigest = `sha256:${await jcsHash(SAMPLE_REQUEST)}`;
  const responseDigest = `sha256:${await jcsHash(SAMPLE_RESPONSE)}`;

  const manifest: InferenceObservationManifest = {
    model_ref: 'urn:peac:model:open-model-sample',
    provider_ref: 'urn:peac:provider:local-openai-compatible',
    request_digest: requestDigest,
    response_digest: responseDigest,
    policy_ref: 'https://issuer.example/usage-policy',
    observed_at: '2026-01-15T10:00:00Z',
  };
  const manifestDigest = `sha256:${await jcsHash(manifest)}`;

  const ext = buildExtension(manifest, manifestDigest);
  const validation = validateAgentAction(ext);
  if (!validation.ok) {
    const detail = validation.errors.map((e) => `${e.code}: ${e.message}`).join('; ');
    throw new Error(`agent-action extension validation failed: ${detail}`);
  }

  // occurred_at is the issuance time (must be ~now; verifyLocal rejects future
  // timestamps). observed_at, carried in the manifest + extension, is the reported
  // event time and stays independent of issuance.
  const occurredAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  const { jws } = await issue({
    iss: ISSUER,
    kind: 'evidence',
    type: RECORD_TYPE,
    pillars: ['provenance'],
    occurred_at: occurredAt,
    privateKey,
    kid: KID,
    extensions: { [AGENT_ACTION_EXTENSION_KEY]: ext },
  });

  const verify = await verifyLocal(jws, publicKey);
  log(`[issue]  record signed (${jws.length} bytes); offline verify: ${verify.valid}`);

  // Digest checks: recompute and compare to the bound values.
  const requestDigestMatches =
    `sha256:${await jcsHash(SAMPLE_REQUEST)}` === manifest.request_digest;
  const responseDigestMatches =
    `sha256:${await jcsHash(SAMPLE_RESPONSE)}` === manifest.response_digest;
  const manifestDigestMatches =
    `sha256:${await jcsHash(manifest)}` === ext.upstream_artifact_digest;

  // No-leak scan: the raw prompt/answer must not appear in the record ext or manifest.
  const surfaces = JSON.stringify(ext) + JSON.stringify(manifest);
  const rawIoLeak = surfaces.includes('<<prompt>>') || surfaces.includes('<<answer>>');

  const publicKeyB64u = base64urlEncode(publicKey);
  const publicJwk = { kty: 'OKP' as const, crv: 'Ed25519' as const, x: publicKeyB64u };

  const result: InferenceDemoResult = {
    ok: verify.valid === true && manifestDigestMatches && !rawIoLeak,
    signatureValid: verify.valid === true,
    requestDigestMatches,
    responseDigestMatches,
    manifestDigestMatches,
    rawIoLeak,
    jws,
    manifest,
    publicKeyB64u,
    publicJwk,
  };

  if (tamper) {
    // Content tamper: change a recorded value AFTER signing -> manifest digest mismatch.
    const tamperedManifest: InferenceObservationManifest = {
      ...manifest,
      response_digest: `sha256:${'0'.repeat(64)}`,
    };
    const reVerify = await verifyLocal(jws, publicKey);
    const manifestDigestMatchesAfterTamper =
      `sha256:${await jcsHash(tamperedManifest)}` === ext.upstream_artifact_digest;

    // Payload tamper: flip the record payload, keep the signature -> verification fails.
    const tamperedJws = tamperPayload(jws);
    const tamperedVerify = await verifyLocal(tamperedJws, publicKey);

    result.tamper = {
      signatureStillValid: reVerify.valid === true,
      manifestDigestMatchesAfterTamper,
      payloadTamperValid: tamperedVerify.valid === true,
      payloadTamperCode: tamperedVerify.valid ? undefined : tamperedVerify.code,
    };
    log(
      `[tamper] payload tamper verify: ${result.tamper.payloadTamperValid} (${result.tamper.payloadTamperCode ?? 'n/a'}); ` +
        `manifest digest after content tamper matches: ${result.tamper.manifestDigestMatchesAfterTamper}`
    );
  }

  return result;
}

/**
 * Write the demo outputs to `out/` for the README walkthrough and the CLI command.
 * Only PUBLIC material is written: the public-key JWK, the manifest (refs + digests),
 * and the valid + tampered records as individual compact-JWS files. No private key
 * is ever written to disk.
 */
export async function writeOutputs(outDir: string): Promise<void> {
  const result = await runInferenceDemo({ tamper: true, quiet: true });
  mkdirSync(join(outDir, 'valid'), { recursive: true });
  mkdirSync(join(outDir, 'tampered'), { recursive: true });

  // CLI `--public-key`-compatible bare Ed25519 public JWK (no private `d`).
  writeFileSync(join(outDir, 'pubkey.json'), JSON.stringify(result.publicJwk, null, 2) + '\n');
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(result.manifest, null, 2) + '\n');
  writeFileSync(join(outDir, 'valid', 'inference-record.jws'), result.jws + '\n');

  // A separate tampered record (payload flipped, signature kept) for the tamper beat.
  const tamperedJws = (() => {
    const [header, payload, signature] = result.jws.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    decoded.iss = 'https://attacker.example.com';
    const reEncoded = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    return `${header}.${reEncoded}.${signature}`;
  })();
  writeFileSync(join(outDir, 'tampered', 'inference-record.jws'), tamperedJws + '\n');
}

// Run as a script: `tsx demo.ts` (print summary) or `tsx demo.ts --write` (write out/).
const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const write = process.argv.includes('--write');
  const here = dirname(fileURLToPath(import.meta.url));
  if (write) {
    await writeOutputs(join(here, 'out'));
    console.log('Wrote out/pubkey.json, out/manifest.json, out/valid/*.jws, out/tampered/*.jws');
  } else {
    const r = await runInferenceDemo({ tamper: true });
    console.log(
      JSON.stringify({ ok: r.ok, signatureValid: r.signatureValid, tamper: r.tamper }, null, 2)
    );
  }
}
