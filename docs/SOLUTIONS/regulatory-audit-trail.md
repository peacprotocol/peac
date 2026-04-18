# Regulatory audit trail

> **Outcome:** Build a portable, signed audit trail suitable for EU AI Act Annex IV review, NIST AI RMF mapping, and ISO 42001 Clause 8 interaction logging. Records carry the policy, config, and runtime observations that auditors consistently ask for, and survive organizational boundaries.
>
> **Audience:** Compliance / audit lead, or platform operator preparing for audit.
>
> **Time:** About 15 minutes from a clean clone.

## The problem

Compliance reviewers under EU AI Act Annex IV, NIST AI RMF, and ISO 42001 Clause 8 ask for evidence that an AI system's interactions were logged, that the policy in force at the time is identifiable, and that the audit trail can be produced later without depending on the original runtime still being online. Local logs do not satisfy those three properties at once.

PEAC records carry policy digests, config digests, and runtime observations in a single signed artifact. A bundle preserves the records plus the JWKS snapshot needed to verify them offline months or years later.

## What you'll use

PEAC packages:

- `@peac/protocol` — issuance and offline verification, with three-state policy binding (`verified` / `failed` / `unavailable`).
- `@peac/adapter-runtime-governance` — runtime-governance observation mapper.
- `@peac/audit` — bundle builder and reconciliation tooling.
- `@peac/cli` — `peac conformance run`, `peac reconcile`.

Optional adjacent systems: a policy store (URI + version + digest), a config store (URI + digest), an identity layer (DID or HTTPS issuer). Any runtime that already emits decision events feeds this trail via the adapter layer.

Prerequisites: Node 22+, pnpm 8+.

## Step-by-step

1. Install dependencies:

   ```bash
   pnpm add @peac/protocol @peac/adapter-runtime-governance @peac/audit
   ```

2. Bind every record to the policy and config in force at the time. The policy-binding check returns a three-state result that auditors can trace:

   ```typescript
   import { issue, computePolicyDigestJcs, checkPolicyBinding } from '@peac/protocol';

   const policyDoc = await fetchPolicyDocument();
   const policyDigest = computePolicyDigestJcs(policyDoc);

   const jws = await issue(
     {
       iss: 'https://runtime.example.com',
       kind: 'evidence',
       type: 'org.peacprotocol/runtime-governance/decision',
       pillars: ['compliance', 'safety'],
       peac: {
         policy: {
           uri: policyDoc.uri,
           version: policyDoc.version,
           digest: policyDigest,
         },
       },
       ext: {
         runtime_governance: {
           decision: 'allow',
           policy_ref: policyDoc.uri,
           config_digest: configDigest,
           upstream_artifact_ref: 'sha256:...',
         },
       },
     },
     privateKey
   );
   ```

3. Verify a record with policy binding. The verifier reports a three-state policy-binding result auditors can point at:

   ```typescript
   import { verifyLocal } from '@peac/protocol';

   const result = await verifyLocal(jws, publicKey, {
     issuer: 'https://runtime.example.com',
     policy: policyDoc,
   });

   console.log(result.valid, result.policy_binding);
   // policy_binding: "verified" | "failed" | "unavailable"
   ```

4. Build a long-lived audit bundle that includes the JWKS snapshot:

   ```typescript
   import { buildBundle } from '@peac/audit';

   const bundle = await buildBundle({
     records: allRecords,
     jwks_snapshot: currentJwksDocument,
     policy: { uri: policyDoc.uri, version: policyDoc.version, digest: policyDigest },
     captured_at: new Date().toISOString(),
   });

   await writeFile(`audit-${quarter}.peac-bundle`, bundle.bytes);
   ```

5. Re-verify the bundle months later without needing the runtime online:

   ```typescript
   import { openBundle } from '@peac/audit';
   import { verifyLocal } from '@peac/protocol';

   const open = await openBundle(await readFile('audit-Q1.peac-bundle'));
   for (const record of open.records) {
     const result = await verifyLocal(record, open.jwks, {
       issuer: open.manifest.issuer,
       policy: open.policy,
     });
     // Record, policy binding, and issuer JWKS all travel with the bundle.
   }
   ```

6. Reconcile two bundles (for example a runtime-side bundle and an auditor-side bundle) to check they carry the same set of records:

   ```bash
   pnpm exec peac reconcile runtime.peac-bundle auditor.peac-bundle
   ```

## Evidence of output

A decoded audit-trail record carries the policy binding and the runtime-governance observation in one signed artifact:

```json
{
  "iss": "https://runtime.example.com",
  "iat": 1781609600,
  "jti": "019676d0-0000-7000-8000-000000000000",
  "kind": "evidence",
  "type": "org.peacprotocol/runtime-governance/decision",
  "pillars": ["compliance", "safety"],
  "peac_version": "0.2",
  "schema": "interaction-record+jwt",
  "peac": {
    "policy": {
      "uri": "https://runtime.example.com/policies/enterprise",
      "version": "2026-04-15",
      "digest": "sha256:..."
    }
  },
  "ext": {
    "runtime_governance": {
      "decision": "allow",
      "policy_ref": "https://runtime.example.com/policies/enterprise",
      "config_digest": "sha256:...",
      "upstream_artifact_ref": "sha256:..."
    }
  }
}
```

The verifier report (DD-210 shape) carries `policy_binding: "verified"` when the verifier's supplied policy document matches the record's `peac.policy.digest`. That three-state result is what an auditor points at to confirm the record was bound to the expected policy at the time.

## Validated with

```bash
pnpm install && pnpm build
pnpm --filter @peac/protocol test
pnpm --filter @peac/audit test
pnpm exec peac conformance run
```

The `@peac/protocol` test suite covers the three-state policy-binding result; the `@peac/audit` test suite covers bundle build and open round-trips; `peac conformance run` exercises the shipped conformance vectors.

## Where to go from here

- [`docs/governance/`](../governance/) — mapping from PEAC record fields to EU AI Act Annex IV, NIST AI RMF, and ISO 42001 Clause 8 controls. Formal mapping docs publish in a near-term release; the directory is the forward link.
- [`docs/specs/EVIDENCE-CARRIER-CONTRACT.md`](../specs/EVIDENCE-CARRIER-CONTRACT.md) — bundle format and carrier contracts.
- [`docs/specs/PROTOCOL-BEHAVIOR.md`](../specs/PROTOCOL-BEHAVIOR.md) — normative policy-binding three-state result.
- [`docs/KEY-CUSTODY-AND-TENANCY.md`](../KEY-CUSTODY-AND-TENANCY.md) — key custody, tenancy, and procurement detail.
- [`packages/cli/`](../../packages/cli/) — `peac reconcile`, `peac policy`, `peac conformance run`.
