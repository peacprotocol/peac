# Cloudflare composition: policy + x402 terms + PEAC binding

> **Outcome:** A site delivered by Cloudflare advertises x402 PR-1986 `terms` in four representations and binds them (alongside its `peac-policy/0.1` document) into PEAC interaction records that any consumer can verify offline.
>
> **Audience:** Operator of a Cloudflare-fronted API or content service that wants to compose with x402 PR-1986 terms and AI Crawl Control without taking a dependency on any single provider.
>
> **Time:** About 5 minutes from a clean clone using the runnable demo; longer for a real Cloudflare deployment.

## The problem

The Cloudflare ecosystem operationalises three adjacent surfaces:

- **Markdown for Agents** delivers content with `Accept: text/markdown` content negotiation, `vary: accept`, and `content-signal` response headers.
- **AI Crawl Control** controls who reaches what; pay-per-crawl is in private beta.
- **x402 SDKs** wire payment rails into agent flows.

None of these produce a verifiable record of what was surfaced and bound. PEAC fills that gap as the records layer: it binds the policy and terms a publisher exposes and emits portable signed records that survive organizational boundaries.

## What you'll use

PEAC packages:

- `@peac/protocol`: issuance, offline verification, document binding.
- `@peac/adapter-x402`: x402 mappers including `computeX402TermsDigest`.
- `@peac/policy-kit`: optional, for compiling `peac-policy/0.1` source documents.
- `@peac/crypto`: signing.

Adjacent surfaces (operator's choice):

- Cloudflare Workers / Cloudflare Pages for the delivery side.
- Cloudflare AI Crawl Control for crawler-side enforcement.
- An x402 SDK (`@x402/fetch`, `x402-hono`, `agents/x402`) for payment.
- Any compatible reference verifier: this repo ships [`surfaces/reference-verifier/`](../../surfaces/reference-verifier/) Dockerfile, docker-compose, and Cloudflare Worker variants.

Prerequisites: Node 22+, pnpm 8+, a Cloudflare account if you intend to deploy. The runnable demo is offline.

## Recipe

### 1. Author the policy and terms

Author the `peac-policy/0.1` source document and the four x402 PR-1986 representations (`uri`, `markdown`, `plaintext`, `json`). The runnable example under [`examples/cf-policy-x402-terms/`](../../examples/cf-policy-x402-terms/) is the canonical template.

### 2. Compute and bind the policy digest

Compute the JCS+SHA-256 digest of the policy document and bind it into the issued receipt's `policy.digest` field via `issue()`. Verifiers compute the same digest locally and report `policy_binding = 'verified'` on a match.

### 3. Compute per-representation terms digests

For each of the four x402 `terms` representations the publisher exposes, compute the corresponding digest with `computeX402TermsDigest`. Each representation envelope is its own binding identity.

```ts
import { computeX402TermsDigest } from '@peac/adapter-x402';

const mdDigest = await computeX402TermsDigest({
  representation: 'markdown',
  bytes: markdownBytes,
});
const jsonDigest = await computeX402TermsDigest({
  representation: 'json',
  value: termsObject,
});
// uri without bytes returns 'unavailable'
const uriDigest = await computeX402TermsDigest({
  representation: 'uri',
  uri: 'https://api.example.com/.well-known/peac-terms.txt',
});
```

### 4. Compose with Cloudflare Markdown for Agents

When Cloudflare serves the markdown representation via `Accept: text/markdown`, the bytes returned are the binding identity. The PEAC binding still applies: the consumer hashes the bytes it received and compares against the publisher digest. Cloudflare's `vary: accept` and `content-signal` headers are observable inputs the consumer MAY also project into a PEAC record via `@peac/mappings-content-signals`.

### 5. Compose with x402 PR-1986

x402 PR-1986 advertises the `terms` field but does not define consent or binding. PEAC adds the binding/proof layer: the same publisher who advertises the terms also issues PEAC records that bind the digest and prove what was surfaced. See the upstream comment trail on [x402 PR #1986](https://github.com/x402-foundation/x402/pull/1986) for the alignment.

### 6. Verify offline

```ts
import { verifyLocal, checkDocumentBinding, computeTextDocumentDigestUtf8 } from '@peac/protocol';

const verifierTermsDigest = await computeTextDocumentDigestUtf8(markdownBytes, 'markdown');
const termsBinding = {
  ref: 'terms.md',
  representation: 'markdown' as const,
  status: checkDocumentBinding(publisherTermsDigest, verifierTermsDigest),
};

const report = await verifyLocal(jws, publicKey, {
  issuer,
  policyDigest,
  bindings: { terms: termsBinding },
});
```

The verifier never performs network I/O on the URI representation. If the consumer needs to bind the URI envelope, they fetch the bytes under their own SSRF / redirect / timeout policy and call the helper with `bytes` populated.

## Validated with

- Runnable demo: [`examples/cf-policy-x402-terms/demo.ts`](../../examples/cf-policy-x402-terms/demo.ts).
- Document-binding helpers: [`packages/protocol/src/document-binding.ts`](../../packages/protocol/src/document-binding.ts).
- Test fixtures: [`packages/protocol/__tests__/document-binding.test.ts`](../../packages/protocol/__tests__/document-binding.test.ts).
- x402 terms helper tests: [`packages/adapters/x402/tests/terms.test.ts`](../../packages/adapters/x402/tests/terms.test.ts).

## Cross-references

- [docs/specs/DOCUMENT-BINDING.md](../specs/DOCUMENT-BINDING.md): normative binding semantics.
- [docs/specs/X402-PROFILE.md](../specs/X402-PROFILE.md): x402 profile.
- [docs/specs/AIPREF-COMPOSITION.md](../specs/AIPREF-COMPOSITION.md): composing AIPREF content-use signals into PEAC records.
- [docs/specs/SCITT-COMPOSITION.md](../specs/SCITT-COMPOSITION.md): wrapping a PEAC record as a SCITT Signed Statement.
- [docs/privacy/](../privacy/README.md): privacy-aware deployment guidance for Cloudflare-fronted PEAC deployments.

## What this recipe does NOT do

- Does not replace Cloudflare AI Crawl Control. PEAC records what was bound and verified; AI Crawl Control records who reached it.
- Does not replace the x402 payment rail. PEAC records the terms binding; x402 handles the payment.
- Does not perform network I/O from the binding layer. Callers fetch under their own SSRF / redirect / timeout policy.
- Does not stamp `terms` digests into the emitted receipt or envelope. The digest is verifier-report-only; see [DOCUMENT-BINDING.md](../specs/DOCUMENT-BINDING.md) §6.
