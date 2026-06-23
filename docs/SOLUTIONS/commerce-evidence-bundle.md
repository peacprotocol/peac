# Commerce evidence bundle

> **Outcome:** Build a portable, signed bundle of commerce observations across x402, ACP, and paymentauth / MPP so auditors, counterparties, or downstream settlement systems can verify what each rail attested — without PEAC synthesizing payment finality.
>
> **Audience:** Agentic commerce operator.
>
> **Time:** About 10 minutes from a clean clone.

## The problem

A single agentic commerce flow may cross several systems: an x402 offer and settlement proof, an ACP delegated-payment session, a paymentauth / MPP payment-attempt and settlement, maybe a Stripe SPT observation. Each system emits its own attestation. An auditor, counterparty, or downstream reconciler needs the **observations** in a portable, signed, verifiable form — and specifically does **not** want a PEAC record that claims finality the upstream never attested.

PEAC adapters carry each rail's attestations verbatim. A bundle composes the observations into a portable audit package. A mapper-boundary guard (`assertExplicitFinality`) refuses to emit commerce records that would synthesize payment finality from non-payment artifacts.

## What you'll use

PEAC packages:

- `@peac/adapter-core` — mapper-boundary finality guard (`assertExplicitFinality`, `MapperBoundaryError`).
- `@peac/adapter-x402` — x402 v1 and v2 settlement-proof extractor (dual-header precedence `PEAC-Receipt` > `PAYMENT-RESPONSE` > `X-PAYMENT-RESPONSE`).
- `@peac/mappings-acp` — ACP delegated-payment observation mapper (`artifact_kind` discriminator).
- `@peac/mappings-paymentauth` — paymentauth / MPP payment-attempt and settlement mappers.
- `@peac/protocol` — record issuance.
- `@peac/crypto` — key generation and the public-key JWKS the bundle travels with.
- `@peac/audit` — signed dispute-bundle builder and offline bundle verifier.

Prerequisites: Node 22+, pnpm 8+. The shipped conformance fixtures cover positive and negative vectors for each rail; no external rail is required to exercise this recipe.

## Step-by-step

1. Install dependencies:

   ```bash
   pnpm add @peac/adapter-core @peac/adapter-x402 @peac/mappings-acp @peac/mappings-paymentauth @peac/protocol @peac/crypto @peac/audit
   ```

2. Map each rail's observation into a PEAC record. Each mapper preserves the upstream artifact verbatim under `upstream_artifact` and labels the observed state with the rail's own closed enum:

   ```typescript
   import { fromX402SettlementObservation } from '@peac/adapter-x402';
   import { fromACPDelegatedPaymentObservation } from '@peac/mappings-acp';
   import { fromMPPSettlement } from '@peac/mappings-paymentauth';
   import { issue } from '@peac/protocol';

   const x402Claims = fromX402SettlementObservation(x402Response, {
     issuer: 'https://commerce.example.com',
   });
   const acpClaims = fromACPDelegatedPaymentObservation(acpEvent, {
     issuer: 'https://commerce.example.com',
   });
   const mppClaims = fromMPPSettlement(mppSettlementArtifact, {
     issuer: 'https://commerce.example.com',
   });

   const x402Jws = await issue(x402Claims, privateKey);
   const acpJws = await issue(acpClaims, privateKey);
   const mppJws = await issue(mppClaims, privateKey);
   ```

3. Attempt a finality synthesis and watch the guard refuse it:

   ```typescript
   import { assertExplicitFinality, MapperBoundaryError } from '@peac/adapter-core';

   try {
     // Non-payment artifact trying to claim settled state.
     assertExplicitFinality(acpClaims.ext.commerce, {
       artifact_kind: 'session_lifecycle',
       attempted_event: 'settled',
     });
   } catch (err) {
     if (err instanceof MapperBoundaryError) {
       console.log(err.code); // 'commerce.finality_synthesis_blocked'
     }
   }
   ```

4. Build a signed dispute bundle from the three records. The bundle travels with the
   public-key JWKS, so a counterparty can verify it offline without contacting the issuer:

   ```typescript
   import { createDisputeBundle } from '@peac/audit';
   import { writeFile } from 'node:fs/promises';

   // `jwks` is a JWKS document containing the public half of the issuing key
   // (for example built from `@peac/crypto` `generateKeypair()` + `base64urlEncode`).
   const bundleResult = await createDisputeBundle({
     refs: [{ type: 'dispute', id: 'dispute_cross_ecosystem_demo' }],
     created_by: 'https://commerce.example.com',
     receipts: [x402Jws, acpJws, mppJws],
     keys: jwks,
     // Sign the bundle itself so the counterparty can confirm its integrity offline.
     signing_key: privateKey,
     signing_kid: 'commerce-evidence-key-2026',
   });

   if (!bundleResult.ok) throw new Error(bundleResult.error.code);

   // Write the portable, signed audit package.
   await writeFile('commerce-evidence.peac-bundle', bundleResult.value);
   ```

5. Verify the bundle offline with only the bundled public key:

   ```typescript
   import { verifyBundle } from '@peac/audit';

   const report = await verifyBundle(bundleResult.value, { offline: true });
   if (!report.ok) throw new Error(report.error.code);

   const { summary } = report.value;
   console.log(`${summary.valid}/${summary.total_receipts} receipts valid`);
   console.log('recommendation:', report.value.auditor_summary.recommendation);
   ```

   To inspect the bundle's manifest and receipts without verifying them, import
   `readDisputeBundle` from `@peac/audit`.

## Evidence of output

A decoded x402 settlement-observation record carries the upstream artifact verbatim and the observed state from the x402 closed enum (never synthesized):

```json
{
  "iss": "https://commerce.example.com",
  "iat": 1781609600,
  "kind": "evidence",
  "type": "org.peacprotocol/x402-settlement",
  "pillars": ["commerce"],
  "peac_version": "0.2",
  "schema": "interaction-record+jwt",
  "ext": {
    "commerce": {
      "rail": "x402",
      "observed_state": "settled",
      "upstream_artifact_ref": "sha256:...",
      "scheme": "...",
      "settlement_proof": "..."
    }
  }
}
```

An ACP delegated-payment session record carries `artifact_kind: "session_lifecycle"` and an ACP-scoped `observed_payment_state` from the ACP closed enum. It does NOT say "settled" unless the upstream ACP artifact explicitly attested settlement. An attempted finality synthesis raises `MapperBoundaryError` with code `commerce.finality_synthesis_blocked`.

## Validated with

```bash
pnpm install && pnpm build
pnpm verify:examples-commerce
pnpm --filter @peac/adapter-core test
pnpm --filter @peac/adapter-x402 test
pnpm --filter @peac/mappings-acp test
pnpm --filter @peac/mappings-paymentauth test
```

The `verify:examples-commerce` workspace script runs the shipped commerce examples (`paymentauth-evidence`, `paymentauth-jsonrpc`, `acp-session-lifecycle`, `stripe-spt-evidence`, `commerce-evidence-bundle`, `x402-dual-header-read`) build-and-demo. The `@peac/adapter-core` test suite exercises `assertExplicitFinality` / `MapperBoundaryError` with representative synthesis-blocking vectors.

## Where to go from here

- [`docs/compatibility/commerce-protocol-coverage.md`](../compatibility/commerce-protocol-coverage.md) — x402 v1 / v2 Stable, MPP Experimental, ACP Beta.
- [`docs/profiles/acp-delegated-payment.md`](../profiles/acp-delegated-payment.md) — ACP profile.
- [`docs/profiles/mpp-payment-evidence.md`](../profiles/mpp-payment-evidence.md) — MPP profile.
- [`docs/specs/X402-V2-PROFILE.md`](../specs/X402-V2-PROFILE.md) — x402 v2 profile (see §8 dual-header precedence).
- [`docs/WHERE-IT-FITS.md`](../WHERE-IT-FITS.md) — PEAC vs payment rails boundary.
- [Examples `commerce-evidence-bundle`, `acp-delegated-checkout`, `mpp-payment-attempt`, `x402-upto-evidence`](../../examples/) — runnable per-rail demos.
