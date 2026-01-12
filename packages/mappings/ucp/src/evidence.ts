/**
 * @peac/mappings-ucp - Evidence YAML generation
 *
 * Generates deterministic YAML for UCP webhook evidence.
 * Uses fixed key ordering (manual string building) for byte-stable output.
 *
 * Key design principles:
 * 1. Cannot be misinterpreted as executable policy (peac_bundle_metadata_version first)
 * 2. Stores both raw and JCS payload representations for reproducible verification
 * 3. Includes full signature header value for offline replay
 * 4. Records all verification attempts for debugging
 * 5. Timestamps are injected, not generated, for deterministic fixtures
 */

import type {
  UcpWebhookEvidence,
  PayloadEvidence,
  SignatureEvidence,
  ProfileSnapshot,
  WebhookEventMeta,
  LinkedReceipt,
  VerificationAttempt,
  UcpSigningKey,
} from './types.js';
import { UCP_EVIDENCE_VERSION } from './types.js';
import { sha256Hex, sha256Bytes, base64urlEncode, jcsCanonicalizeSync } from './util.js';

/**
 * Maximum body size to include as base64url in evidence (256KB).
 */
const DEFAULT_MAX_BODY_EVIDENCE_BYTES = 256 * 1024;

/**
 * Options for creating UCP webhook evidence.
 */
export interface CreateEvidenceOptions {
  /** HTTP method */
  method: string;

  /** Request path */
  path: string;

  /** When request was received (ISO 8601) - REQUIRED for determinism */
  received_at: string;

  /** Payload evidence */
  payload: PayloadEvidence;

  /** Signature evidence */
  signature: SignatureEvidence;

  /** Profile snapshot */
  profile: ProfileSnapshot;

  /** Event metadata (optional) */
  event?: WebhookEventMeta;

  /** Linked receipts (optional) */
  linked_receipts?: LinkedReceipt[];
}

/**
 * Create UCP webhook evidence object.
 * Use serializeEvidenceYaml() to convert to deterministic YAML string.
 */
export function createUcpWebhookEvidence(options: CreateEvidenceOptions): UcpWebhookEvidence {
  const { method, path, received_at, payload, signature, profile, event, linked_receipts } =
    options;

  return {
    peac_bundle_metadata_version: UCP_EVIDENCE_VERSION,
    kind: 'evidence_attachment',
    scope: 'ucp_webhook',
    request: {
      method,
      path,
      received_at,
    },
    payload,
    signature,
    ...(event && { event }),
    profile,
    ...(linked_receipts && linked_receipts.length > 0 && { linked_receipts }),
  };
}

/**
 * Serialize evidence to deterministic YAML string.
 * Uses fixed key ordering for byte-stable output.
 *
 * IMPORTANT: Do NOT use a YAML serializer library as they may reorder keys.
 */
export function serializeEvidenceYaml(evidence: UcpWebhookEvidence): string {
  const lines: string[] = [];

  // Header comment
  lines.push('# PEAC UCP Webhook Evidence');
  lines.push('# This file is evidence data, NOT executable policy');
  lines.push('');

  // Top-level metadata (prevents misinterpretation as policy)
  lines.push(`peac_bundle_metadata_version: "${evidence.peac_bundle_metadata_version}"`);
  lines.push(`kind: "${evidence.kind}"`);
  lines.push(`scope: "${evidence.scope}"`);
  lines.push('');

  // Request section
  lines.push('request:');
  lines.push(`  method: "${evidence.request.method}"`);
  lines.push(`  path: "${escapeYamlString(evidence.request.path)}"`);
  lines.push(`  received_at: "${evidence.request.received_at}"`);
  lines.push('');

  // Payload section
  lines.push('payload:');
  lines.push(`  raw_sha256_hex: "${evidence.payload.raw_sha256_hex}"`);
  if (evidence.payload.raw_bytes_b64url) {
    lines.push(`  raw_bytes_b64url: "${evidence.payload.raw_bytes_b64url}"`);
  }
  if (evidence.payload.jcs_sha256_hex) {
    lines.push(`  jcs_sha256_hex: "${evidence.payload.jcs_sha256_hex}"`);
  }
  if (evidence.payload.jcs_text) {
    lines.push('  jcs_text: |');
    const jcsLines = evidence.payload.jcs_text.split('\n');
    for (const line of jcsLines) {
      lines.push(`    ${line}`);
    }
  }
  lines.push(`  json_parseable: ${evidence.payload.json_parseable}`);
  lines.push('');

  // Signature section
  lines.push('signature:');
  lines.push(`  header_value: "${escapeYamlString(evidence.signature.header_value)}"`);
  lines.push(`  kid: "${evidence.signature.kid}"`);
  lines.push(`  alg: "${evidence.signature.alg}"`);
  lines.push(`  b64: ${evidence.signature.b64 === null ? 'null' : evidence.signature.b64}`);
  if (evidence.signature.crit && evidence.signature.crit.length > 0) {
    lines.push('  crit:');
    for (const c of evidence.signature.crit) {
      lines.push(`    - "${c}"`);
    }
  }
  lines.push(`  verified: ${evidence.signature.verified}`);
  if (evidence.signature.verification_mode_used) {
    lines.push(`  verification_mode_used: "${evidence.signature.verification_mode_used}"`);
  }
  lines.push('  verification_attempts:');
  for (const attempt of evidence.signature.verification_attempts) {
    lines.push(`    - mode: "${attempt.mode}"`);
    lines.push(`      success: ${attempt.success}`);
    if (attempt.error_code) {
      lines.push(`      error_code: "${attempt.error_code}"`);
    }
    if (attempt.error_message) {
      lines.push(`      error_message: "${escapeYamlString(attempt.error_message)}"`);
    }
  }
  lines.push('');

  // Event section (optional)
  if (evidence.event) {
    lines.push('event:');
    lines.push(`  type: "${evidence.event.type}"`);
    if (evidence.event.resource_id) {
      lines.push(`  resource_id: "${evidence.event.resource_id}"`);
    }
    if (evidence.event.timestamp) {
      lines.push(`  timestamp: "${evidence.event.timestamp}"`);
    }
    lines.push('');
  }

  // Profile section
  lines.push('profile:');
  lines.push(`  url: "${evidence.profile.url}"`);
  lines.push(`  fetched_at: "${evidence.profile.fetched_at}"`);
  lines.push(`  profile_jcs_sha256_hex: "${evidence.profile.profile_jcs_sha256_hex}"`);
  if (evidence.profile.key_thumbprint) {
    lines.push(`  key_thumbprint: "${evidence.profile.key_thumbprint}"`);
  }
  if (evidence.profile.key_jwk) {
    lines.push('  key_jwk:');
    lines.push(`    kty: "${evidence.profile.key_jwk.kty}"`);
    lines.push(`    crv: "${evidence.profile.key_jwk.crv}"`);
    lines.push(`    kid: "${evidence.profile.key_jwk.kid}"`);
    lines.push(`    x: "${evidence.profile.key_jwk.x}"`);
    lines.push(`    y: "${evidence.profile.key_jwk.y}"`);
    if (evidence.profile.key_jwk.alg) {
      lines.push(`    alg: "${evidence.profile.key_jwk.alg}"`);
    }
    if (evidence.profile.key_jwk.use) {
      lines.push(`    use: "${evidence.profile.key_jwk.use}"`);
    }
  }
  lines.push('');

  // Linked receipts (optional)
  if (evidence.linked_receipts && evidence.linked_receipts.length > 0) {
    lines.push('linked_receipts:');
    for (const lr of evidence.linked_receipts) {
      lines.push(`  - receipt_id: "${lr.receipt_id}"`);
      lines.push(`    relationship: "${lr.relationship}"`);
    }
  }

  // Remove trailing empty lines and ensure exactly one trailing newline (LF)
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n') + '\n';
}

/**
 * Escape special characters in YAML string values.
 */
function escapeYamlString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Create payload evidence from raw request body.
 */
export function createPayloadEvidence(
  bodyBytes: Uint8Array,
  options: {
    maxBodyEvidenceBytes?: number;
    includeJcsText?: boolean;
  } = {}
): PayloadEvidence {
  const { maxBodyEvidenceBytes = DEFAULT_MAX_BODY_EVIDENCE_BYTES, includeJcsText = false } =
    options;

  // Compute raw hash
  const rawSha256Hex = sha256Hex(bodyBytes);

  // Include raw bytes if under size limit
  let rawBytesB64url: string | undefined;
  if (bodyBytes.length <= maxBodyEvidenceBytes) {
    rawBytesB64url = base64urlEncode(bodyBytes);
  }

  // Try to parse as JSON and compute JCS hash
  let jcsSha256Hex: string | undefined;
  let jcsText: string | undefined;
  let jsonParseable = false;

  try {
    const bodyText = new TextDecoder().decode(bodyBytes);
    const parsed = JSON.parse(bodyText);
    jsonParseable = true;

    // JCS canonicalize
    const canonicalized = jcsCanonicalizeSync(parsed);
    jcsSha256Hex = sha256Hex(new TextEncoder().encode(canonicalized));

    if (includeJcsText) {
      jcsText = canonicalized;
    }
  } catch {
    // Not valid JSON, that's fine
  }

  return {
    raw_sha256_hex: rawSha256Hex,
    ...(rawBytesB64url && { raw_bytes_b64url: rawBytesB64url }),
    ...(jcsSha256Hex && { jcs_sha256_hex: jcsSha256Hex }),
    ...(jcsText && { jcs_text: jcsText }),
    json_parseable: jsonParseable,
  };
}

/**
 * Create signature evidence from verification result.
 */
export function createSignatureEvidence(
  headerValue: string,
  header: { kid: string; alg: string; b64?: boolean; crit?: string[] },
  verified: boolean,
  attempts: VerificationAttempt[],
  modeUsed?: 'raw' | 'jcs'
): SignatureEvidence {
  return {
    header_value: headerValue,
    kid: header.kid,
    alg: header.alg as SignatureEvidence['alg'],
    b64: header.b64 === undefined ? null : header.b64,
    ...(header.crit && header.crit.length > 0 && { crit: header.crit }),
    verified,
    ...(modeUsed && { verification_mode_used: modeUsed }),
    verification_attempts: attempts,
  };
}

/**
 * Create profile snapshot from fetched profile.
 */
export function createProfileSnapshot(
  url: string,
  profile: Record<string, unknown>,
  keyUsed: UcpSigningKey,
  fetchedAt: string
): ProfileSnapshot {
  // JCS canonicalize the profile
  const canonicalized = jcsCanonicalizeSync(profile);
  const profileJcsSha256Hex = sha256Hex(new TextEncoder().encode(canonicalized));

  // Compute JWK thumbprint (SHA-256 of JCS-canonicalized required members)
  const thumbprintInput = {
    crv: keyUsed.crv,
    kty: keyUsed.kty,
    x: keyUsed.x,
    y: keyUsed.y,
  };
  const thumbprint = base64urlEncode(
    sha256Bytes(new TextEncoder().encode(jcsCanonicalizeSync(thumbprintInput)))
  );

  return {
    url,
    fetched_at: fetchedAt,
    profile_jcs_sha256_hex: profileJcsSha256Hex,
    key_thumbprint: thumbprint,
    key_jwk: keyUsed,
  };
}

// Re-export utilities for backwards compatibility
export { sha256Hex, sha256Bytes, base64urlEncode, jcsCanonicalizeSync } from './util.js';
