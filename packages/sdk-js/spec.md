# PEAC Protocol Core Specification (v0.9)

PEAC (Programmable Economic Access, Attribution & Consent) Protocol is a standardized framework for managing access to web content, applicable to all agents—human, AI, bots, or M2M.

## Core

- Identity: Verifiable via EIP-712 signatures, DIDs, or mTLS.
- Terms: Defined in pricing.txt (YAML/JSON format) at domain root, with fallback to .well-known/peac.json.
- Flows: Agent fetches terms → signs request → server checks access/attribution/payment → responds (200/402/403). Use X-PEAC-Signature for signed requests.

Example terms:
protocol: peac
version: 0.9
default_access: deny
agent_rules:
  - agent_type: research
    access: free
    attribution:
      required: true
      format: url
      value: https://example.com/attribution
    metadata:
      custom: any_value
  - agent_type: commercial
    access: $0.01/page
    max_requests_per_day: 100000
    contact: licensing@provider.com
pricing_proof: https://example.com/terms-hash

## Security Model

- HTTPS required (default for all fetches; override via .peacrc allowHttp: true).
- Signature: EIP-712 for recoverable identity verification.
- Audit Hash: SHA256 on canonical JSON via getTermsHash().
- Attribution: Required headers (e.g., X-PEAC-Attribution-Consent) enforced in checkAccess().
- Expiry: ISO 8601 for valid_until or duration for expires_in, validated in checkAccess().

## Fallback Discovery

Fallback order for terms discovery:
1. /pricing.txt (YAML)
2. /.well-known/peac.yaml
3. /.well-known/peac.json
4. Link header rel="peac-terms"

While pricing.txt is the canonical default, PEAC-compliant agents should check .well-known/peac.yaml or JSON where possible.

## Header Behavior

Headers used in PEAC:
- X-PEAC-Attribution-Consent: Boolean, required if attribution_required is true.
- X-PEAC-Attribution-URL: Optional URL for attribution credit.
- X-PEAC-Signature: EIP-712 signature.
- X-PEAC-Agent-ID: Agent identifier.
- X-PEAC-User-ID: User identifier.
- X-PEAC-Deal-ID: Metadata deal identifier.
- X-402-Payment-Required: Fallback for x402 compatibility.

## Compliance Mapping Table

| Field | Mandatory | Optional | Description |
|-------|-----------|----------|-------------|
| protocol | Yes | No | Must be 'peac' |
| version | Yes | No | Must be '0.9' |
| attribution_required | No | Yes | Boolean for attribution enforcement |
| expires_in | No | Yes | Session duration |
| tiers | No | Yes | Pricing tiers array |

## Threats

- MITM: Mandate HTTPS for all interactions.
- DDoS: Rate-limits in terms (e.g., max_requests_per_day).
- Spoofing: Signature verification required; deny unsigned requests.
- Attribution Spoofing: Validate X-PEAC-Attribution-* headers; log failures.
- Privacy: Use ZK proofs for logs in future extensions.

## Extensions

- Payments: HTTP 402 base; x402/h402 for crypto; fiat fallbacks (e.g., Stripe).
- Robots.txt Compat: Map deny rules to robots.txt directives.
- Media Units: Per-byte/request/second (see units.md).
- Attribution Formats: URL/text/JSON; integrate with C2PA/CC-BY.

- ## Extension Slots

Metadata fields can be extended with custom keys, e.g., dispute_url in metadata for dispute resolution.

## Attribution Enforcement

Attribution is a programmable condition for consent-based access, enabling non-monetary compliance.

- Required Fields: required (bool), format (enum: url/text/json), value (string).
- Enforcement: Servers validate X-PEAC-Attribution-* headers; log cryptographically for provenance.
- Compliance Mappings: Ties to EU AI Act (provenance), DMCA (credit), W3C Verifiable Credentials (tracking).
- Example Curl: curl -H "X-PEAC-Attribution-Consent: true" -H "X-PEAC-Attribution-URL: https://example.com/credit" -H "X-PEAC-Deal-ID: abc123" https://example.com/content
- Future: Table for C2PA/CC-BY/TOS; SDK validateAttribution() for agents.
- Negotiation Support: Use metadata.deal_id for pre-approved terms; validate via X-PEAC-Deal-ID header. metadata.negotiated_at for timestamp; metadata.session_id for binding; metadata.dispute_url for resolution URI.

Example Validation:
If attribution.required and no X-PEAC-Attribution-Consent, return 403.

## Compliance

- EU AI Act: Logs for data provenance, no untargeted scraping.
- DMCA/GDPR: Consent mappings via attribution/terms.
- Global: Extensible to India DPDP/China PIPL via COMPLIANCE.md.