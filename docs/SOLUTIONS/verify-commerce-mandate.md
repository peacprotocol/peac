# Verify commerce-mandate records

> **Outcome:** A payment system, merchant integration, or recovery service observed a commerce-lifecycle event (mandate, authorization, capture, void, refund, settlement, budget) and emitted signed PEAC records. You want to verify those records offline as an auditor, counterparty, or downstream reviewer, without calling the rail that produced them.
>
> **Audience:** Auditor / counterparty / downstream reviewer.
>
> **Time:** About 5 minutes from a clean clone, using the shipped fixtures.

## The problem

Payment rails, mandate frameworks, and processor systems already maintain internal records of every commerce-lifecycle event. Those records are private to each system. A reviewer outside the system has no portable way to verify a signed report that a mandate event, authorization, capture, void, refund, settlement state, or budget event was observed without trusting one rail's read-only view of its own ledger.

PEAC turns each observed event into a signed record using the canonical `org.peacprotocol/commerce-mandate` extension namespace and a `*-observed` type URI per event kind. Authorization, processing, settlement, mandate enforcement, finality computation, budget evaluation, and rail validation remain upstream responsibilities. PEAC produces a portable, signed record of what the caller reported observing.

This recipe walks through verifying those records offline.

## What you'll use

PEAC packages:

- `@peac/protocol`: issuance and offline verification.
- `@peac/schema`: `validateCommerceMandate` and the canonical extension key.
- `@peac/crypto`: Ed25519 signing.

Examples and fixtures:

- [`examples/commerce-mandate-records/`](../../examples/commerce-mandate-records/): generic, vendor-neutral demo with one fixture per `*-observed` event kind (mandate, authorization, capture, void, refund, settlement, budget).

Prerequisites: Node 22+, pnpm 8+. No external service required.

## Step-by-step

1. Install dependencies and build the workspace.

   ```bash
   pnpm install
   pnpm build
   ```

2. Issue signed records from the generic fixtures. The script reads each fixture, validates the extension content through `validateCommerceMandate`, signs an interaction record per fixture using the `commerce` pillar, and writes the records and the public key to `examples/commerce-mandate-records/out/`.

   ```bash
   cd examples/commerce-mandate-records
   pnpm issue
   ```

   You should see one `[OK]` line per `*-observed` event kind.

3. Verify the records offline. The verifier loads the public key plus the signed records and runs `verifyLocal` for each. The private key is not required.

   ```bash
   pnpm verify
   ```

   Each record prints `[OK]`; the summary reports `Verified <count>/<count>`.

4. (Optional) Verify the records through a reference verifier deployment. The reference verifier in [`surfaces/reference-verifier/`](../../surfaces/reference-verifier/) includes local and edge-deployment recipes. Each deployment runs the same offline verification. Treat the deployment as informative; the protocol behavior is the same as the local `verifyLocal` call in step 3.

## When to use this

- An auditor needs portable proof that a mandate was reportedly bound for a merchant and payer.
- A counterparty needs to verify that an authorization, capture, a refund was reported, or a settlement state was reported without calling the rail's API.
- A reviewer needs to verify a signed record reporting a settlement state (pending, completed, failed, reversed, partial) tied to a specific mandate.
- A finance team needs evidence that a budget event (limit set, threshold crossed, etc.) was reportedly observed against a specific mandate.

## Expected failure modes

`validateCommerceMandate` rejects with stable error codes:

- `commerce.mandate.inline_payment_data_blocked`: a forbidden top-level payment-data key (card_number, pan, cvv, token, bearer_token, api_key, secret, private_key, credential, password, connection_string, iban, bank_account, etc.) was present at the extension top level.
- `commerce.mandate.opaque_ref_grammar_violation` / `commerce.mandate.ref_must_be_string`: `*_ref` field grammar or type mismatch.
- `commerce.mandate.missing_required_field`: `event_kind`, `mandate_ref`, `observed_at`, or a per-kind required field was absent.
- `commerce.mandate.invalid_event_kind`: the `event_kind` value was not one of the seven recognized kinds.
- `commerce.mandate.invalid_amount_minor`: an amount field was not a non-negative `AmountMinorStringSchema` base-10 integer string (numeric, decimal, comma-formatted, empty, or negative values reject).
- `commerce.mandate.invalid_currency`: a `currency` value failed the bounded grammar `[A-Z0-9_-]{1,16}`.
- `commerce.mandate.invalid_observed_at`: a timestamp was not RFC 3339 with timezone.
- `commerce.mandate.invalid_settlement_state`: `settlement_state` was not one of `pending` / `completed` / `failed` / `reversed` / `partial`.
- `commerce.mandate.finality_synthesis_blocked`: `settlement_state` was present on any event kind other than `commerce-settlement-observed`. This is the canonical finality-synthesis boundary: settlement finality may only be reported via the dedicated settlement event kind.
- `commerce.mandate.invalid_scheme_id` / `commerce.mandate.scheme_conflict`: bounded `scheme_id` grammar violation or both `scheme_id` and `scheme_ref` set.

`verifyLocal` rejects when the signature does not verify against the supplied public key.

## Privacy and security notes

- Fixture data is synthetic. Real records will carry caller-controlled mandate and payer identifiers; treat them as PII unless your operator policy says otherwise.
- The 20 forbidden top-level payment-data keys keep raw payment-card data, raw tokens, raw credentials, raw API keys, raw private keys, and raw bank-account information off the wire by construction. If your operator needs to bind a record to upstream payment material, use opaque references (`*_ref` fields) or `upstream_artifact_digest` (sha256-hex).
- The money-boundary invariant rejects JavaScript numbers, decimals, comma-formatted values, empty strings, and negative values for amount fields. Use bounded decimal strings only (e.g. `"1999"` for 19.99 USD). This prevents precision loss above `Number.MAX_SAFE_INTEGER` and prevents downstream numeric casts from silently corrupting amounts.
- The finality-synthesis boundary prevents a caller from claiming settlement finality at the wrong event kind. An auditor reading a commerce-authorization-observed record cannot accidentally interpret it as proof of settlement.

## Boundary

PEAC records what the caller reports. PEAC does not authorize payments, process payments, settle funds, enforce mandates, compute payment finality, evaluate budgets, validate payment rails, or vouch for the legal validity of any commerce decision. Commerce decisions are reported by the caller; the record describes what the caller observed, not what PEAC decided.

## Related

- Profile spec: [`docs/specs/COMMERCE-MANDATE-RECORDS.md`](../specs/COMMERCE-MANDATE-RECORDS.md)
- Generic example: [`examples/commerce-mandate-records/`](../../examples/commerce-mandate-records/)
- Parity corpus: [`specs/conformance/parity-corpus/commerce-mandate/`](../../specs/conformance/parity-corpus/commerce-mandate/)
