#!/usr/bin/env node
/**
 * Build requirement registry from manually curated requirement definitions.
 * This script computes source_fragment_hash values and validates the registry
 * against the JSON Schema.
 *
 * Usage: node scripts/conformance/build-registry.mjs
 *
 * The registry source data is defined inline; the script computes hashes
 * and writes specs/conformance/requirement-ids.json.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

function hash(fragment) {
  return 'sha256:' + createHash('sha256').update(fragment, 'utf-8').digest('hex');
}

const VERSION = '0.12.1';

// Section slug mapping (markdown anchor format)
const SECTION_ANCHORS = {
  2: 'media-type',
  3: 'envelope-structure',
  4: 'compatibility-contract',
  5: 'kind-semantics',
  6: 'type-grammar',
  7: 'pillar-taxonomy',
  8: 'issuer-canonical-form',
  9: 'occurred-at-semantics',
  10: 'jws-header-constraints',
  11: 'policy-binding',
  12: 'extension-groups',
  13: 'challenge-body',
  14: 'warning-plumbing',
  15: 'dual-stack-compatibility',
  16: 'strictness-profiles',
  18: 'identifier-stack-and-token-confusion',
  19: 'verifier-validation-algorithm',
  20: 'replay-prevention',
};

// Section ID prefixes
const SECTION_PREFIXES = {
  2: 'MEDIA',
  3: 'ENV',
  4: 'COMPAT',
  5: 'KIND',
  6: 'TYPE',
  7: 'PILLAR',
  8: 'ISS',
  9: 'OCC',
  10: 'JOSE',
  11: 'POLICY',
  12: 'EXT',
  13: 'CHAL',
  14: 'WARN',
  15: 'DUAL',
  16: 'STRICT',
  18: 'IDENT',
  19: 'VALID',
  20: 'REPLAY',
};

// prettier-ignore
const REQUIREMENTS = [
  // ===== Section 2: Media Type =====
  { section: 2, keyword: 'MUST', summary: 'Issuers MUST emit compact form typ value', source_fragment: 'Issuers MUST emit this form', enforcement_class: 'issuance' },
  { section: 2, keyword: 'MUST', summary: 'Verifiers MUST accept full media type form', source_fragment: 'Verifiers MUST accept; normalized to compact form', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 2, keyword: 'MUST', summary: 'Full media type MUST be normalized to compact form', source_fragment: 'The full media type form `application/interaction-record+jwt` is accepted by verifiers and MUST be normalized to the compact form `interaction-record+jwt` before returning the decoded header.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 2, keyword: 'MUST NOT', summary: 'Issuers MUST NOT emit full media type form', source_fragment: 'Issuers MUST NOT emit the full media type form.', enforcement_class: 'issuance' },
  { section: 2, keyword: 'MUST', summary: 'Verifiers MUST enforce typ/peac_version coherence', source_fragment: 'Verifiers MUST enforce coherence between the JWS `typ` header and the `peac_version` payload claim', enforcement_class: 'hard_fail', error_code: 'E_WIRE_VERSION_MISMATCH' },
  { section: 2, keyword: 'MUST', summary: 'Strict mode: typ MUST be present', source_fragment: '**Strict** (default): `typ` MUST be present and MUST match `interaction-record+jwt`', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 2, keyword: 'MUST', summary: 'Strict mode: typ MUST match interaction-record+jwt', source_fragment: '`typ` MUST be present and MUST match `interaction-record+jwt` (or its full media type form)', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },

  // ===== Section 3: Envelope Structure =====
  { section: 3, keyword: 'MUST', summary: 'Unknown top-level fields MUST be rejected', source_fragment: 'unknown top-level fields MUST be rejected', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 3, keyword: 'REQUIRED', summary: 'peac_version is REQUIRED', source_fragment: '`peac_version`     | `"0.2"` (literal)             | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 3, keyword: 'REQUIRED', summary: 'kind is REQUIRED', source_fragment: '`kind`             | `"evidence"` or `"challenge"` | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 3, keyword: 'REQUIRED', summary: 'type is REQUIRED', source_fragment: '`type`             | string                        | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 3, keyword: 'REQUIRED', summary: 'iss is REQUIRED', source_fragment: '`iss`              | string                        | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 3, keyword: 'REQUIRED', summary: 'iat is REQUIRED', source_fragment: '`iat`              | integer                       | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 3, keyword: 'REQUIRED', summary: 'jti is REQUIRED', source_fragment: '`jti`              | string (1 to 256 chars)       | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 3, keyword: 'OPTIONAL', summary: 'sub is OPTIONAL', source_fragment: '`sub`              | string                        | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'pillars is OPTIONAL', source_fragment: '`pillars`          | array of EvidencePillar       | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'actor is OPTIONAL', source_fragment: '`actor`            | ActorBinding                  | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'policy is OPTIONAL', source_fragment: '`policy`           | PolicyBlock                   | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'representation is OPTIONAL', source_fragment: '`representation`   | RepresentationFields          | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'occurred_at is OPTIONAL (evidence kind only)', source_fragment: '`occurred_at`      | string (ISO 8601 / RFC 3339)  | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'purpose_declared is OPTIONAL', source_fragment: '`purpose_declared` | string                        | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'extensions is OPTIONAL', source_fragment: '`extensions`       | `Record<string, unknown>`     | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'MUST', summary: 'Every Wire 0.2 receipt MUST include 6 required fields', source_fragment: 'Every Wire 0.2 receipt MUST include `peac_version`, `kind`, `type`, `iss`, `iat`, and `jti`.', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 3, keyword: 'REQUIRED', summary: 'policy.digest is REQUIRED when policy block present', source_fragment: '`digest`  | string       | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 3, keyword: 'OPTIONAL', summary: 'policy.uri is OPTIONAL', source_fragment: '`uri`     | string (URL) | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'policy.version is OPTIONAL', source_fragment: '`version` | string       | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'MUST', summary: 'policy.uri MUST start with https://', source_fragment: 'MUST start with `https://`', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 3, keyword: 'MUST NOT', summary: 'Implementations MUST NOT auto-fetch policy.uri', source_fragment: 'Implementations MUST NOT trigger automatic fetch on encountering this URL (DD-55: no implicit network I/O).', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'representation.content_hash is OPTIONAL', source_fragment: '`content_hash`   | string  | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'representation.content_type is OPTIONAL', source_fragment: '`content_type`   | string  | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'OPTIONAL', summary: 'representation.content_length is OPTIONAL', source_fragment: '`content_length` | integer | OPTIONAL', enforcement_class: 'advisory' },
  { section: 3, keyword: 'REQUIRED', summary: 'actor.id is REQUIRED', source_fragment: '`id`          | string       | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 3, keyword: 'REQUIRED', summary: 'actor.proof_type is REQUIRED', source_fragment: '`proof_type`  | string       | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 3, keyword: 'REQUIRED', summary: 'actor.origin is REQUIRED', source_fragment: '`origin`      | string (URL) | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },

  // ===== Section 4: Compatibility Contract =====
  { section: 4, keyword: 'MUST', summary: 'Implementations MUST preserve unrecognized open field values', source_fragment: 'Implementations MUST preserve unrecognized but well-formed values.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 4, keyword: 'MUST', summary: 'Pillars array MUST be sorted ascending lexicographic', source_fragment: 'The `pillars` array MUST be sorted in ascending lexicographic order with no duplicates.', enforcement_class: 'hard_fail', error_code: 'E_PILLARS_NOT_SORTED' },

  // ===== Section 5: Kind Semantics =====
  { section: 5, keyword: 'MUST NOT', summary: 'occurred_at MUST NOT appear on challenge receipts', source_fragment: 'The `occurred_at` field MUST NOT appear on challenge receipts. Its presence produces `E_OCCURRED_AT_ON_CHALLENGE`.', enforcement_class: 'hard_fail', error_code: 'E_OCCURRED_AT_ON_CHALLENGE' },
  { section: 5, keyword: 'SHOULD', summary: 'Challenges SHOULD include the challenge extension group', source_fragment: 'Challenges SHOULD include the challenge extension group (Section 13) with a `challenge_type` and an RFC 9457 `problem` body.', enforcement_class: 'advisory' },
  { section: 5, keyword: 'MAY', summary: 'A single type MAY appear with either kind', source_fragment: 'A single `type` MAY appear with either kind.', enforcement_class: 'advisory' },

  // ===== Section 6: Type Grammar =====
  { section: 6, keyword: 'MUST', summary: 'type domain MUST contain at least one dot', source_fragment: 'MUST contain at least one dot', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 6, keyword: 'MUST', summary: 'type domain MUST match domain character pattern', source_fragment: 'MUST match /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 6, keyword: 'MUST', summary: 'type segment MUST be non-empty', source_fragment: 'MUST be non-empty', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 6, keyword: 'MUST', summary: 'type segment MUST match segment character pattern', source_fragment: 'MUST match /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 6, keyword: 'MUST', summary: 'type domain MUST start with alphanumeric', source_fragment: 'MUST start with an alphanumeric character. MUST contain at least one dot', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 6, keyword: 'MUST', summary: 'type segment MUST start with alphanumeric', source_fragment: 'MUST start with an alphanumeric character. Underscores are permitted', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 6, keyword: 'SHOULD', summary: 'Reverse-DNS type values SHOULD be lowercase ASCII', source_fragment: 'Reverse-DNS `type` values SHOULD be lowercase ASCII.', enforcement_class: 'warning_only', warning_code: 'type_casing' },
  { section: 6, keyword: 'MAY', summary: 'Verifiers MAY emit warning for uppercase reverse-DNS type', source_fragment: 'Verifiers MAY emit a warning when a reverse-DNS form `type` contains uppercase characters.', enforcement_class: 'advisory' },

  // ===== Section 7: Pillar Taxonomy =====
  { section: 7, keyword: 'MUST', summary: 'Unknown pillar values MUST be rejected', source_fragment: 'Unknown values MUST be rejected.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 7, keyword: 'MUST', summary: 'Pillars array MUST contain at least one element when present', source_fragment: 'When present, the array MUST contain at least one element.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 7, keyword: 'MUST', summary: 'Pillar values MUST be in ascending lexicographic order', source_fragment: 'Values MUST be in ascending lexicographic order. Implementations MUST verify that each element is strictly greater than the preceding element.', enforcement_class: 'hard_fail', error_code: 'E_PILLARS_NOT_SORTED' },
  { section: 7, keyword: 'MUST', summary: 'Duplicate pillar values MUST be rejected', source_fragment: 'Duplicate values MUST be rejected.', enforcement_class: 'hard_fail', error_code: 'E_PILLARS_NOT_SORTED' },
  { section: 7, keyword: 'MAY', summary: 'Receipt MAY have type not corresponding to any single pillar', source_fragment: 'A receipt MAY have a type that does not directly correspond to any single pillar', enforcement_class: 'advisory' },
  { section: 7, keyword: 'MAY', summary: 'Receipt MAY have multiple pillars for a single type', source_fragment: 'MAY have multiple pillars for a single type', enforcement_class: 'advisory' },

  // ===== Section 8: Issuer Canonical Form =====
  { section: 8, keyword: 'MUST', summary: 'iss scheme MUST be lowercase https', source_fragment: 'Scheme MUST be lowercase `https`.', enforcement_class: 'hard_fail', error_code: 'E_ISS_NOT_CANONICAL' },
  { section: 8, keyword: 'MUST', summary: 'iss host MUST be lowercase ASCII', source_fragment: 'Host MUST be lowercase ASCII. Raw Unicode hostnames are rejected; punycode (`xn--` labels) is accepted.', enforcement_class: 'hard_fail', error_code: 'E_ISS_NOT_CANONICAL' },
  { section: 8, keyword: 'MUST NOT', summary: 'Default port 443 MUST NOT appear explicitly', source_fragment: 'The default port 443 MUST NOT appear explicitly (`:443` is rejected).', enforcement_class: 'hard_fail', error_code: 'E_ISS_NOT_CANONICAL' },
  { section: 8, keyword: 'MUST', summary: 'iss MUST equal reconstructed origin exactly', source_fragment: 'iss MUST equal the reconstructed origin exactly', enforcement_class: 'hard_fail', error_code: 'E_ISS_NOT_CANONICAL' },
  { section: 8, keyword: 'MUST', summary: 'DID method MUST be lowercase letters and digits only', source_fragment: 'Method: lowercase letters and digits only (`[a-z0-9]+`).', enforcement_class: 'hard_fail', error_code: 'E_ISS_NOT_CANONICAL' },
  { section: 8, keyword: 'MUST NOT', summary: 'DID method-specific-id MUST NOT contain path/query/fragment chars', source_fragment: 'Method-specific-id: non-empty, MUST NOT contain `/`, `?`, or `#`.', enforcement_class: 'hard_fail', error_code: 'E_ISS_NOT_CANONICAL' },
  { section: 8, keyword: 'MUST', summary: 'All non-https/did schemes produce E_ISS_NOT_CANONICAL', source_fragment: 'All schemes other than `https` and `did` produce `E_ISS_NOT_CANONICAL`.', enforcement_class: 'hard_fail', error_code: 'E_ISS_NOT_CANONICAL' },
  { section: 8, keyword: 'MUST', summary: 'Callers MUST always provide publicKey directly', source_fragment: 'callers MUST always provide the `publicKey: Uint8Array` parameter directly.', enforcement_class: 'advisory' },

  // ===== Section 9: Occurred-at Semantics =====
  { section: 9, keyword: 'MUST', summary: 'occurred_at value MUST be valid ISO 8601/RFC 3339 datetime', source_fragment: 'The value MUST be a valid ISO 8601 / RFC 3339 datetime string with a timezone offset.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },

  // ===== Section 10: JWS Header Constraints =====
  { section: 10, keyword: 'MUST', summary: 'alg MUST be EdDSA; all others rejected', source_fragment: 'Ed25519 only (RFC 8032); all other algorithms MUST be rejected', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 10, keyword: 'REQUIRED', summary: 'kid is REQUIRED in JWS header', source_fragment: 'REQUIRED; identifies the signing key in the issuer JWKS', enforcement_class: 'hard_fail', error_code: 'E_JWS_MISSING_KID' },
  { section: 10, keyword: 'MUST', summary: 'Embedded key jwk MUST cause hard error', source_fragment: 'Presence of any of the following MUST cause a hard error:', enforcement_class: 'hard_fail', error_code: 'E_JWS_EMBEDDED_KEY' },
  { section: 10, keyword: 'MUST', summary: 'crit header MUST be rejected', source_fragment: '`crit`                | `E_JWS_CRIT_REJECTED`', enforcement_class: 'hard_fail', error_code: 'E_JWS_CRIT_REJECTED' },
  { section: 10, keyword: 'MUST', summary: 'b64:false MUST be rejected', source_fragment: '`b64` (value `false`) | `E_JWS_B64_REJECTED`', enforcement_class: 'hard_fail', error_code: 'E_JWS_B64_REJECTED' },
  { section: 10, keyword: 'MUST', summary: 'zip header MUST be rejected', source_fragment: '`zip`                 | `E_JWS_ZIP_REJECTED`', enforcement_class: 'hard_fail', error_code: 'E_JWS_ZIP_REJECTED' },
  { section: 10, keyword: 'MUST', summary: 'kid MUST be present and non-empty', source_fragment: '`kid` MUST be present and non-empty. Absent or empty `kid` produces `E_JWS_MISSING_KID`.', enforcement_class: 'hard_fail', error_code: 'E_JWS_MISSING_KID' },
  { section: 10, keyword: 'MUST NOT', summary: 'kid MUST NOT exceed 256 characters', source_fragment: '`kid` MUST NOT exceed 256 characters (DoS safety).', enforcement_class: 'hard_fail', error_code: 'E_JWS_MISSING_KID' },
  { section: 10, keyword: 'MUST NOT', summary: 'JWS compact serialization MUST NOT exceed 256 KB', source_fragment: 'The total JWS compact serialization MUST NOT exceed 262,144 bytes (256 KB).', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },

  // ===== Section 11: Policy Binding =====
  { section: 11, keyword: 'MUST', summary: 'policyDigest option MUST match sha256:<64hex> format', source_fragment: 'The option value MUST match the format `sha256:<64 lowercase hex>` or it is rejected with `E_INVALID_FORMAT`.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 11, keyword: 'MUST', summary: 'policy.uri MUST be https:// URL', source_fragment: 'The `policy.uri` field MUST be an `https://` URL.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 11, keyword: 'MUST NOT', summary: 'Implementations MUST NOT auto-fetch policy URI', source_fragment: 'Implementations MUST NOT auto-fetch the policy document based on this URI', enforcement_class: 'advisory' },

  // ===== Section 12: Extension Groups =====
  { section: 12, keyword: 'MUST', summary: 'Extension keys MUST conform to domain/segment grammar', source_fragment: 'Extension keys MUST conform to the grammar: `<domain>/<segment>`.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_KEY' },
  { section: 12, keyword: 'MUST', summary: 'Extension key domain MUST have at least one dot', source_fragment: 'At least one dot (single-label domains are rejected).', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_KEY' },
  { section: 12, keyword: 'MUST NOT', summary: 'Extension key domain label MUST NOT exceed 63 chars', source_fragment: 'MUST NOT exceed 63 characters', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_KEY' },
  { section: 12, keyword: 'MUST', summary: 'Extension key segment MUST be non-empty', source_fragment: 'The segment MUST be non-empty.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_KEY' },
  { section: 12, keyword: 'MUST', summary: 'Extension key segment MUST match lowercase pattern', source_fragment: 'Matches `[a-z0-9][a-z0-9_-]*` (lowercase only).', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_KEY' },
  { section: 12, keyword: 'REQUIRED', summary: 'Commerce: payment_rail is REQUIRED', source_fragment: '`payment_rail` | string               | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'REQUIRED', summary: 'Commerce: amount_minor is REQUIRED', source_fragment: '`amount_minor` | string               | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'REQUIRED', summary: 'Commerce: currency is REQUIRED', source_fragment: '`currency`     | string               | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'MUST', summary: 'amount_minor MUST be base-10 integer string', source_fragment: 'The `amount_minor` field MUST be a base-10 integer string.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'SHOULD', summary: 'Issuers SHOULD use distinct type for negative amounts', source_fragment: 'Issuers SHOULD use a distinct receipt `type`', enforcement_class: 'advisory' },
  { section: 12, keyword: 'REQUIRED', summary: 'Access: resource is REQUIRED', source_fragment: '`resource` | string                             | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'REQUIRED', summary: 'Access: action is REQUIRED', source_fragment: '`action`   | string                             | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'REQUIRED', summary: 'Access: decision is REQUIRED', source_fragment: '`decision` | `"allow"`, `"deny"`, or `"review"` | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'MUST', summary: 'trace_id MUST match 32 lowercase hex chars', source_fragment: '`trace_id` MUST match `/^[0-9a-f]{32}$/` (exactly 32 lowercase hex characters).', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'MUST', summary: 'span_id MUST match 16 lowercase hex chars', source_fragment: '`span_id` MUST match `/^[0-9a-f]{16}$/` (exactly 16 lowercase hex characters).', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 12, keyword: 'MUST', summary: 'Unknown extension keys MUST be preserved', source_fragment: 'MUST be preserved (not silently dropped).', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 12, keyword: 'MUST', summary: 'Unknown extension keys MUST trigger warning', source_fragment: 'MUST trigger an `unknown_extension_preserved` warning at the protocol layer', enforcement_class: 'warning_only', warning_code: 'unknown_extension_preserved' },
  { section: 12, keyword: 'MUST NOT', summary: 'Unknown extension keys MUST NOT cause validation error', source_fragment: 'MUST NOT cause a validation error.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },

  // ===== Section 13: Challenge Body =====
  { section: 13, keyword: 'REQUIRED', summary: 'Challenge problem.status is REQUIRED', source_fragment: '`status`   | integer      | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 13, keyword: 'REQUIRED', summary: 'Challenge problem.type is REQUIRED', source_fragment: '`type`     | string (URL) | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_EXTENSION_FORMAT' },
  { section: 13, keyword: 'OPTIONAL', summary: 'Challenge problem.title is OPTIONAL', source_fragment: '`title`    | string       | OPTIONAL', enforcement_class: 'advisory' },
  { section: 13, keyword: 'OPTIONAL', summary: 'Challenge problem.detail is OPTIONAL', source_fragment: '`detail`   | string       | OPTIONAL', enforcement_class: 'advisory' },
  { section: 13, keyword: 'OPTIONAL', summary: 'Challenge problem.instance is OPTIONAL', source_fragment: '`instance` | string       | OPTIONAL', enforcement_class: 'advisory' },
  { section: 13, keyword: 'OPTIONAL', summary: 'Challenge resource is OPTIONAL', source_fragment: '`resource`     | string                    | OPTIONAL', enforcement_class: 'advisory' },
  { section: 13, keyword: 'OPTIONAL', summary: 'Challenge action is OPTIONAL', source_fragment: '`action`       | string                    | OPTIONAL', enforcement_class: 'advisory' },

  // ===== Section 14: Warning Plumbing =====
  { section: 14, keyword: 'REQUIRED', summary: 'Warning code is REQUIRED', source_fragment: '`code`    | string | REQUIRED | Stable warning code identifier', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 14, keyword: 'REQUIRED', summary: 'Warning message is REQUIRED', source_fragment: '`message` | string | REQUIRED | Human-readable description', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 14, keyword: 'MUST NOT', summary: 'Warning message MUST NOT be used for conformance testing', source_fragment: 'MUST NOT be used for conformance testing', enforcement_class: 'advisory' },
  { section: 14, keyword: 'MAY', summary: 'New warning codes MAY be added in future', source_fragment: 'New warning codes MAY be added in future versions.', enforcement_class: 'advisory' },
  { section: 14, keyword: 'MUST NOT', summary: 'Existing warning codes MUST NOT be removed or renamed', source_fragment: 'Existing warning codes MUST NOT be removed or renamed.', enforcement_class: 'advisory' },
  { section: 14, keyword: 'MUST', summary: 'Consumers MUST tolerate unknown warning codes', source_fragment: 'Consumers MUST tolerate unknown warning codes gracefully.', enforcement_class: 'advisory' },
  { section: 14, keyword: 'MUST', summary: 'Warnings MUST be sorted by (pointer, code)', source_fragment: 'Warnings MUST be sorted by `(pointer ascending, code ascending)`.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 14, keyword: 'MUST', summary: 'Conformance MUST assert on code and pointer only', source_fragment: 'Conformance implementations MUST assert on `code` and `pointer` fields only.', enforcement_class: 'advisory' },
  { section: 14, keyword: 'MUST NOT', summary: 'message MUST NOT be used for conformance testing (14.5)', source_fragment: 'The `message` field is implementation-defined and MUST NOT be used for conformance testing.', enforcement_class: 'advisory' },

  // ===== Section 15: Dual-Stack Compatibility =====
  { section: 15, keyword: 'MUST', summary: 'Implementations MUST verify typ/peac_version coherence after routing', source_fragment: 'implementations MUST verify coherence between the JWS `typ` and the payload `peac_version` field', enforcement_class: 'hard_fail', error_code: 'E_WIRE_VERSION_MISMATCH' },
  { section: 15, keyword: 'MUST NOT', summary: 'Wire 0.1 route payload MUST NOT contain peac_version 0.2', source_fragment: 'Wire 0.1 route: payload MUST NOT contain `peac_version: "0.2"`.', enforcement_class: 'hard_fail', error_code: 'E_WIRE_VERSION_MISMATCH' },
  { section: 15, keyword: 'MUST', summary: 'Wire 0.2 route payload MUST contain peac_version 0.2', source_fragment: 'Wire 0.2 route: payload MUST contain `peac_version: "0.2"`.', enforcement_class: 'hard_fail', error_code: 'E_WIRE_VERSION_MISMATCH' },

  // ===== Section 16: Strictness Profiles =====
  { section: 16, keyword: 'MUST', summary: 'Strict: JWS typ MUST be present', source_fragment: 'JWS `typ` MUST be present.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 16, keyword: 'MUST', summary: 'Strict: typ MUST be a recognized value', source_fragment: '`typ` MUST be a recognized value', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 16, keyword: 'SHOULD', summary: 'Production deployments SHOULD use strict mode', source_fragment: 'Production deployments SHOULD use strict mode.', enforcement_class: 'advisory' },

  // ===== Section 18: Identifier Stack and Token Confusion =====
  { section: 18, keyword: 'MUST', summary: 'Issuers MUST emit compact form typ (18.3)', source_fragment: 'Compact form: `interaction-record+jwt` (canonical; issuers MUST emit this form)', enforcement_class: 'issuance' },
  { section: 18, keyword: 'MUST', summary: 'Verifiers MUST accept media-type form (18.3)', source_fragment: 'Media-type form: `application/interaction-record+jwt` (verifiers MUST accept)', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 18, keyword: 'MUST NOT', summary: 'MUST NOT perform content-type parameter parsing', source_fragment: 'Implementations MUST NOT perform content-type parameter parsing', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 18, keyword: 'MUST', summary: 'typ and peac_version MUST agree (18.4)', source_fragment: 'The `typ` header and `peac_version` payload claim MUST agree.', enforcement_class: 'hard_fail', error_code: 'E_WIRE_VERSION_MISMATCH' },
  { section: 18, keyword: 'SHOULD', summary: 'Production SHOULD use strict mode (18.5)', source_fragment: 'Production deployments SHOULD use strict mode, which rejects missing `typ`.', enforcement_class: 'advisory' },
  { section: 18, keyword: 'MAY', summary: 'Future implementations MAY relax unknown minor version', source_fragment: 'Future implementations MAY relax this to process unknown minor versions with a warning', enforcement_class: 'advisory' },
  { section: 18, keyword: 'MAY', summary: 'Multiple package versions MAY implement same wire version', source_fragment: 'Multiple package versions MAY implement the same wire format version.', enforcement_class: 'advisory' },

  // ===== Section 19: Verifier Validation Algorithm =====
  { section: 19, keyword: 'MUST', summary: 'Steps MUST be performed in specified order', source_fragment: 'Implementations MUST perform steps in the order specified.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 19, keyword: 'MUST', summary: 'Hard error MUST terminate validation immediately', source_fragment: 'A step that produces a hard error MUST terminate validation immediately', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 19, keyword: 'MUST NOT', summary: 'Verifier MUST NOT continue after hard error', source_fragment: 'the verifier MUST NOT continue to subsequent steps.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 19, keyword: 'REQUIRED', summary: 'jws input is REQUIRED', source_fragment: '`jws`          | string     | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 19, keyword: 'REQUIRED', summary: 'publicKey input is REQUIRED', source_fragment: '`publicKey`    | Uint8Array | REQUIRED', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 19, keyword: 'MUST', summary: 'Step 1: alg MUST be EdDSA', source_fragment: 'The `alg` header parameter MUST be `EdDSA`.', enforcement_class: 'hard_fail', error_code: 'E_INVALID_FORMAT' },
  { section: 19, keyword: 'MUST', summary: 'Step 3: kernel constraints fail-closed', source_fragment: 'Kernel constraints are structural limits (field lengths, array sizes) enforced before schema parsing. Failure is fail-closed: return `E_CONSTRAINT_VIOLATION`.', enforcement_class: 'hard_fail', error_code: 'E_CONSTRAINT_VIOLATION' },
  { section: 19, keyword: 'MUST NOT', summary: 'Step 9: iat MUST NOT exceed now + maxClockSkew', source_fragment: '`iat` MUST NOT exceed `now + maxClockSkew`.', enforcement_class: 'hard_fail', error_code: 'E_NOT_YET_VALID' },
  { section: 19, keyword: 'REQUIRED', summary: 'Step 10a: jti is REQUIRED (enforced by schema)', source_fragment: 'The `jti` claim is REQUIRED (enforced by schema validation in Step 4).', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 19, keyword: 'SHOULD', summary: 'Step 10b: Verifiers with replay cache SHOULD reject duplicates', source_fragment: 'Verifiers that maintain a replay cache SHOULD reject duplicate `jti`', enforcement_class: 'advisory' },
  { section: 19, keyword: 'MAY', summary: 'Step 10b: Verifiers without cache MAY skip replay check', source_fragment: 'Verifiers without a replay cache MAY skip this step', enforcement_class: 'advisory' },
  { section: 19, keyword: 'SHOULD', summary: 'HTTP mapping SHOULD use 400 Bad Request', source_fragment: 'implementations SHOULD map these to HTTP 400 Bad Request', enforcement_class: 'advisory' },

  // ===== Section 20: Replay Prevention =====
  { section: 20, keyword: 'REQUIRED', summary: 'jti claim is REQUIRED on all Wire 0.2 receipts', source_fragment: 'The `jti` claim is REQUIRED on all Wire 0.2 receipts.', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 20, keyword: 'MUST', summary: 'Issuers MUST ensure jti uniqueness', source_fragment: 'Issuers MUST ensure `jti` uniqueness across all receipts they produce.', enforcement_class: 'issuance' },
  { section: 20, keyword: 'MUST', summary: 'jti MUST be 1 to 256 characters', source_fragment: 'The `jti` value MUST be a non-empty string of 1 to 256 characters.', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
  { section: 20, keyword: 'SHOULD', summary: 'Implementations SHOULD use 128+ bits of entropy for jti', source_fragment: 'Implementations SHOULD use at least 128 bits of entropy', enforcement_class: 'advisory' },
  { section: 20, keyword: 'SHOULD', summary: 'Verifiers with cache SHOULD reject duplicate jti per iss', source_fragment: 'Verifiers that maintain a replay cache SHOULD reject duplicate `jti` from the same `iss`', enforcement_class: 'advisory' },
  { section: 20, keyword: 'MAY', summary: 'Verifiers without cache MAY skip replay detection', source_fragment: 'Verifiers without a replay cache (stateless deployments, edge functions, serverless) MAY skip replay detection.', enforcement_class: 'advisory' },
  { section: 20, keyword: 'SHOULD', summary: 'Replay caches SHOULD use iat-based expiry', source_fragment: 'Use `iat`-based expiry.', enforcement_class: 'advisory' },
  { section: 20, keyword: 'RECOMMENDED', summary: 'RECOMMENDED cache window is 2x tolerance (600s)', source_fragment: 'A RECOMMENDED window is 2x `OCCURRED_AT_TOLERANCE_SECONDS` (600 seconds).', enforcement_class: 'advisory' },
  { section: 20, keyword: 'SHOULD', summary: 'Caches SHOULD be scoped per iss', source_fragment: 'Caches SHOULD be scoped per `iss`', enforcement_class: 'advisory' },
  { section: 20, keyword: 'MAY', summary: 'Implementations MAY use probabilistic structures', source_fragment: 'Implementations MAY use bloom filters or probabilistic data structures', enforcement_class: 'advisory' },
  { section: 20, keyword: 'OPTIONAL', summary: 'aud claim is OPTIONAL in Wire 0.2', source_fragment: 'The `aud` claim is OPTIONAL in Wire 0.2.', enforcement_class: 'advisory' },
  { section: 20, keyword: 'SHOULD', summary: 'Verifiers checking aud SHOULD reject unaddressed receipts', source_fragment: 'Verifiers that check `aud` SHOULD reject receipts not addressed to them.', enforcement_class: 'advisory' },
  { section: 20, keyword: 'MUST', summary: 'Each receipt in bundle MUST have unique jti', source_fragment: 'Each receipt in an evidence bundle MUST have a unique `jti`.', enforcement_class: 'hard_fail', error_code: 'E_MISSING_REQUIRED_CLAIM' },
];

// Build the registry
const sectionMap = new Map();

for (const req of REQUIREMENTS) {
  if (!sectionMap.has(req.section)) {
    sectionMap.set(req.section, []);
  }
  sectionMap.get(req.section).push(req);
}

const sections = [];
for (const [sectionNum, reqs] of [...sectionMap.entries()].sort((a, b) => a[0] - b[0])) {
  const prefix = SECTION_PREFIXES[sectionNum];
  const sectionTitle = {
    2: 'Media Type',
    3: 'Envelope Structure',
    4: 'Compatibility Contract',
    5: 'Kind Semantics',
    6: 'Type Grammar',
    7: 'Pillar Taxonomy',
    8: 'Issuer Canonical Form',
    9: 'Occurred-at Semantics',
    10: 'JWS Header Constraints',
    11: 'Policy Binding',
    12: 'Extension Groups',
    13: 'Challenge Body',
    14: 'Warning Plumbing',
    15: 'Dual-Stack Compatibility',
    16: 'Strictness Profiles',
    18: 'Identifier Stack and Token Confusion',
    19: 'Verifier Validation Algorithm',
    20: 'Replay Prevention',
  }[sectionNum];

  const requirements = reqs.map((req, idx) => {
    const id = `WIRE02-${prefix}-${String(idx + 1).padStart(3, '0')}`;
    const entry = {
      id,
      keyword: req.keyword,
      summary: req.summary,
      source_fragment: req.source_fragment,
      source_fragment_hash: hash(req.source_fragment),
      enforcement_class: req.enforcement_class,
      introduced_in: VERSION,
      last_reviewed_in: VERSION,
    };
    if (req.error_code) entry.error_code = req.error_code;
    if (req.warning_code) entry.warning_code = req.warning_code;
    return entry;
  });

  sections.push({
    section_number: sectionNum,
    section_title: sectionTitle,
    section_anchor: SECTION_ANCHORS[sectionNum],
    requirements,
  });
}

const registry = {
  $schema: 'https://www.peacprotocol.org/schemas/conformance/requirement-registry.schema.json',
  version: VERSION,
  spec_file: 'docs/specs/WIRE-0.2.md',
  generated_at: new Date().toISOString(),
  sections,
};

const outPath = join(ROOT, 'specs/conformance/requirement-ids.json');
writeFileSync(outPath, JSON.stringify(registry, null, 2) + '\n');

const totalReqs = sections.reduce((sum, s) => sum + s.requirements.length, 0);
console.log(`Registry written: ${outPath}`);
console.log(`Total requirements: ${totalReqs}`);
console.log(`Sections: ${sections.length}`);
for (const s of sections) {
  console.log(`  Section ${s.section_number} (${s.section_title}): ${s.requirements.length} requirements`);
}
