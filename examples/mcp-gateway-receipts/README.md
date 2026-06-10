# MCP Gateway Receipts

Signed records for gateway-mediated MCP tool calls: policy decisions, content digests, redaction facts, and a signed tool-definition manifest, all verifiable offline with the issuer public key.

Large MCP deployments route tool calls through a gateway that applies policy, redacts sensitive output, and mediates access to many backing servers. The gateway sees every call, which makes it a natural sign-point: the whole fleet gets records and individual servers do not change. This example shows what the gateway should sign and how a counterparty verifies it without access to the gateway's logs.

## What it demonstrates

1. **A signed tool-definition record.** The gateway signs a manifest of the tool definitions it exposes (`org.peacprotocol/provenance-record`). Every per-call record references it via `tool_definition_ref`, so a verifier can check exactly which definitions were in force when a call happened. This makes after-the-fact definition changes detectable.
2. **Policy decisions as evidence.** Allow and deny both produce records (`org.peacprotocol/access-decision` with the registered `org.peacprotocol/access` extension). A gateway that can prove what it refused is as useful as one that can prove what it allowed.
3. **Content digests, never payloads.** The record binds `sha256` digests of the input and the (redacted) result. A verifier detects a modified result even though the record's signature still verifies, because the delivered content no longer matches the bound digest.
4. **Redaction as a recorded fact.** The gateway redacts PII before hashing and the record states `redaction_applied`, so the verifier knows what the digest covers and raw PII never enters the record.
5. **Offline verification.** The verifying side uses exactly one thing from the issuer: a public key.

## Run

```bash
pnpm install
pnpm demo               # issue, carry in _meta, verify offline, deny record
pnpm demo:tamper        # two tamper checks (digest mismatch, bad signature)
pnpm demo:show-record   # print the decoded record header and payload
```

## Expected output (abridged)

```
1. Gateway publishes a signed tool-definition record:
   tool_definition_ref = sha256:...
2. Tool call via gateway: read_customer_profile({"customer_id":"cus_1042"})
   policy pii.redact.v1: decision = allow, redaction applied (email masked)
3. Record attached via top-level _meta carrier keys:
   org.peacprotocol/receipt_ref = sha256:...
   org.peacprotocol/receipt_jws = eyJ0eXAiOiJpbnRlcmFjdGlv...
4. Counterparty verification (offline, public key only):
   signature valid = true
   decision = allow, policy = pii.redact.v1, redaction_applied = true
   delivered result digest matches bound result_sha256 = true
   tool_definition_ref matches published manifest record = true
5. Denied call is also evidence: deploy_config_change
   decision = deny, signed deny record verified = true
```

With `--tamper`, two independent detections:

```
6. Tamper check 1 (modify the delivered result, keep the record):
   signature still valid = true
   delivered result digest matches bound result_sha256 = false
7. Tamper check 2 (modify the record payload, keep signature):
   valid = false
   code  = E_INVALID_SIGNATURE
```

Tamper check 1 is the important lesson: a valid signature proves the record was not modified; it says nothing about content the record did not bind. Binding digests is what extends the proof to the content. Claim only what the record binds.

## Notes

- Demo keys are generated in-process; nothing here is production key management. In production, keys are `kid`-scoped and discovered via the issuer configuration (`/.well-known/peac-issuer.json`).
- The demo hashes `JSON.stringify` output for brevity. Production profiles should hash a canonical serialization so independently produced JSON verifies identically.
- Gateway-specific facts travel in an integrator-defined extension group (`com.example/gateway`). Verification preserves unknown extension groups and surfaces an informational `unknown_extension_preserved` warning; nothing fails silently.
- See `docs/SOLUTIONS/mcp-gateway-receipts.md` for the pattern write-up, and `examples/mcp-tool-call` for the minimal single-server carrier flow.
