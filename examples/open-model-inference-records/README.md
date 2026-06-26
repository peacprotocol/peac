# Records for open-model inference calls

> **Outcome:** Issue a portable signed PEAC record for an open-model inference call and verify it offline, without exposing the prompt or the response. The record binds digests of the request and the response through an inference observation manifest, so a downstream reviewer can verify what was reported across organizational and runtime boundaries.
>
> **Audience:** Someone running an open model (locally or behind an OpenAI-compatible endpoint) who wants a portable, tamper-evident record of model use.
>
> **Time:** About 5 minutes from a clean clone.

## The problem

Open models are often strong on creation transparency: documented weights, training data, and methods. Once a model is deployed and used, the operational question is different: which model answered, through which provider, under what policy, with what request and response, and can that be verified later without sharing the raw prompt or output?

PEAC records what an open-model inference call reported. It binds digests of the request and response into one signed record, verifiable offline.

## What PEAC records (and what it does not)

PEAC models the inference call as the existing `org.peacprotocol/agent-action-invoked-observed` record. The model identity, provider, and request/response digests are carried through an **inference observation manifest** whose digest is bound into the record's existing `upstream_artifact_digest` field. No new receipt type, extension group, schema field, wire format, signing envelope, or public API is introduced.

| Record field               | Value                                        | Notes                                                                         |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| `agent_ref`                | `urn:peac:agent:inference-client`            | the caller/agent (opaque ref)                                                 |
| `action_ref`               | `urn:peac:model:open-model-sample`           | model invocation identity (opaque ref)                                        |
| `caller_ref`               | `urn:peac:provider:local-openai-compatible`  | provider/deployment descriptor (opaque ref)                                   |
| `upstream_artifact_ref`    | `urn:peac:inference-manifest:offline-sample` | opaque ref to the manifest                                                    |
| `upstream_artifact_digest` | `sha256:<hex>`                               | digest of the inference observation manifest; binds both request and response |
| `policy_ref`               | `https://issuer.example/usage-policy`        | optional usage/deployment policy reference                                    |
| `observed_at`              | timestamp                                    | reported time of the call                                                     |

The inference observation manifest is plain JSON the example builds; it contains only opaque refs and `sha256:<hex>` digests:

```json
{
  "model_ref": "urn:peac:model:open-model-sample",
  "provider_ref": "urn:peac:provider:local-openai-compatible",
  "request_digest": "sha256:<hex>",
  "response_digest": "sha256:<hex>",
  "policy_ref": "https://issuer.example/usage-policy",
  "observed_at": "2026-01-15T10:00:00Z"
}
```

PEAC does **not** serve models, route requests, enforce policy, certify compliance, or imply adoption or endorsement by any model project or provider. The raw prompt and raw response are never placed in the manifest, the record, or any output file.

## Run it (offline sample, no network)

From the repository root:

```bash
pnpm install
pnpm --filter @peac/example-open-model-inference-records demo:write
```

This writes the public key, the manifest, and the records under `out/`:

- `out/pubkey.json` - a public Ed25519 JWK (no private key is ever written to disk)
- `out/manifest.json` - the inference observation manifest (refs and digests only)
- `out/valid/inference-record.jws` - the signed record
- `out/tampered/inference-record.jws` - a record whose payload was altered after signing

## Verify offline

```bash
peac verify examples/open-model-inference-records/out/valid/inference-record.jws \
  --public-key examples/open-model-inference-records/out/pubkey.json
# -> Signature valid (offline).
```

## Tamper beat

```bash
peac verify examples/open-model-inference-records/out/tampered/inference-record.jws \
  --public-key examples/open-model-inference-records/out/pubkey.json
# -> Verification failed (exit 1), code E_INVALID_SIGNATURE
```

A second, content-level check: if a value behind the manifest changes after signing, the recomputed manifest digest no longer matches the digest bound in the record, so the binding is detectably broken even when the signature itself still parses.

## Other input modes

The same flow applies to a real endpoint. Point at a local OpenAI-compatible server (for example a `/v1/chat/completions` endpoint), compute the request and response digests with the same JSON canonicalization, and feed them into the manifest. The example ships the deterministic offline sample so the demo and test require no network; the local and hosted modes are documented in `fixtures/` as input descriptors.

## What this proves (and what it does not)

- Proves: a portable, offline-verifiable record that a specific open model, through a specific provider, under a referenced policy, reported a request and a response with the given digests at the given time.
- Does not prove: anything about the content of the prompt or output (only their digests travel), nor that the deployment is compliant with any framework, nor any relationship with a model project or provider.

---

This is an independent PEAC-side worked example. A real open model it maps to is, for example, `swiss-ai/Apertus-*`; naming it here is illustrative and does not imply adoption, endorsement, partnership, or support by that project.[^1]

[^1]: Inclusion of a real open-model name is descriptive only. PEAC records model use; it does not serve, certify, or endorse any model.
