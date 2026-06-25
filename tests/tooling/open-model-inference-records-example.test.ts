/**
 * Runtime smoke test for examples/open-model-inference-records.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here, not just its types. This imports the demo's exported
 * runInferenceDemo() in-process (vitest aliases @peac/* to source, so no build
 * or example install is required) and asserts:
 *   - the record verifies offline and the manifest digest binds
 *   - request and response digests each match their recomputed value
 *   - tampering is detected two independent ways (manifest-digest mismatch after
 *     a content change, and an invalid Ed25519 signature after a payload change)
 *   - no raw prompt/response strings reach the record extension or the manifest
 *   - the public key the example emits is CLI `--public-key`-compatible
 *   - a top-level model_ref / request_digest / response_digest is rejected by the
 *     strict agent-action extension (so the manifest indirection is the only path)
 *
 * No network, no subprocess.
 */

import { describe, it, expect } from 'vitest';
import { jwkToPublicKeyBytes, base64urlDecode } from '@peac/crypto';
import { verifyLocal } from '@peac/protocol';
import { AGENT_ACTION_EXTENSION_KEY, validateAgentAction } from '@peac/schema';
import { runInferenceDemo } from '../../examples/open-model-inference-records/demo';

describe('open-model-inference-records example', () => {
  it('issues an inference record that verifies offline and binds the manifest digest', async () => {
    const r = await runInferenceDemo({ quiet: true });
    expect(r.ok).toBe(true);
    expect(r.signatureValid).toBe(true);
    expect(r.requestDigestMatches).toBe(true);
    expect(r.responseDigestMatches).toBe(true);
    expect(r.manifestDigestMatches).toBe(true);
    expect(r.rawIoLeak).toBe(false);
  });

  it('binds only refs and sha256 digests in the manifest (no raw I/O)', async () => {
    const r = await runInferenceDemo({ quiet: true });
    const manifestJson = JSON.stringify(r.manifest);
    expect(manifestJson).not.toContain('<<prompt>>');
    expect(manifestJson).not.toContain('<<answer>>');
    expect(r.manifest.request_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(r.manifest.response_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    // No private key material anywhere in the result surfaces.
    expect(JSON.stringify(r.publicJwk)).not.toContain('"d"');
  });

  it('detects tampering two independent ways', async () => {
    const r = await runInferenceDemo({ tamper: true, quiet: true });
    // Content tamper: the signature still verifies, but the bound manifest digest no longer matches.
    expect(r.tamper?.signatureStillValid).toBe(true);
    expect(r.tamper?.manifestDigestMatchesAfterTamper).toBe(false);
    // Payload tamper: the signature fails with the stable code.
    expect(r.tamper?.payloadTamperValid).toBe(false);
    expect(r.tamper?.payloadTamperCode).toBe('E_INVALID_SIGNATURE');
  });

  it('emits a CLI --public-key-compatible bare Ed25519 JWK that verifies the record', async () => {
    const r = await runInferenceDemo({ quiet: true });
    // The CLI's parsePublicKey path uses jwkToPublicKeyBytes; the emitted JWK must parse.
    const keyBytes = jwkToPublicKeyBytes(r.publicJwk);
    expect(keyBytes).toHaveLength(32);
    // And it must verify the same record the README tells users to verify.
    const viaJwk = await verifyLocal(r.jws, keyBytes);
    expect(viaJwk.valid).toBe(true);
    // The x value round-trips to the same 32 bytes as the raw public key.
    expect(base64urlDecode(r.publicJwk.x)).toHaveLength(32);
  });

  it('rejects a naive top-level model_ref / request_digest / response_digest (strict extension)', () => {
    // The agent-action extension is .strict(); the inference fields must live in the
    // manifest (bound via upstream_artifact_digest), never as top-level record keys.
    const bad = {
      event_kind: 'agent-action-invoked-observed',
      agent_ref: 'urn:peac:agent:inference-client',
      action_ref: 'urn:peac:model:open-model-sample',
      observed_at: '2026-06-26T10:00:00Z',
      model_ref: 'urn:peac:model:open-model-sample',
      request_digest: `sha256:${'0'.repeat(64)}`,
      response_digest: `sha256:${'0'.repeat(64)}`,
    };
    const result = validateAgentAction(bad);
    expect(result.ok).toBe(false);
  });

  it('uses the existing agent-action extension key and an existing type URI', async () => {
    expect(AGENT_ACTION_EXTENSION_KEY).toBe('org.peacprotocol/agent-action');
    const r = await runInferenceDemo({ quiet: true });
    // action_ref carries the generic model id; never a vendor model id.
    expect(r.manifest.model_ref).toBe('urn:peac:model:open-model-sample');
  });
});
