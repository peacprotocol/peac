/**
 * Hosted Verify error catalog.
 *
 * Maps kernel-canonical error codes (specs/kernel/errors.json) to RFC 9457
 * Problem Details shapes with buyer-grade detail strings. Every hosted-exposed
 * error code MUST exist here; the completeness test enforces this.
 *
 * Detail templates support {field} interpolation for contextual messages.
 */

const BASE_TYPE_URI = 'https://www.peacprotocol.org/problems';

export interface CatalogEntry {
  code: string;
  httpStatus: number;
  typeUri: string;
  title: string;
  detailTemplate: string;
  retryable: boolean;
}

/**
 * Hosted error catalog. Every entry uses kernel-canonical codes.
 * The detail template supports {field} interpolation.
 */
const CATALOG_ENTRIES: CatalogEntry[] = [
  {
    code: 'E_INVALID_FORMAT',
    httpStatus: 400,
    typeUri: `${BASE_TYPE_URI}/invalid-format`,
    title: 'Invalid Format',
    detailTemplate:
      'Input is not a valid compact JWS. Expected three base64url segments separated by dots.',
    retryable: false,
  },
  {
    code: 'E_JWS_MISSING_KID',
    httpStatus: 400,
    typeUri: `${BASE_TYPE_URI}/missing-kid`,
    title: 'Missing Key ID',
    detailTemplate:
      'JWS header is missing a `kid` field. Add a key identifier to the protected header.',
    retryable: false,
  },
  {
    code: 'E_UNSUPPORTED_WIRE_VERSION',
    httpStatus: 400,
    typeUri: `${BASE_TYPE_URI}/unsupported-wire-version`,
    title: 'Unsupported Wire Version',
    detailTemplate:
      'Wire version `{version}` is not supported. This endpoint accepts `interaction-record+jwt`.',
    retryable: false,
  },
  {
    code: 'E_INVALID_SIGNATURE',
    httpStatus: 422,
    typeUri: `${BASE_TYPE_URI}/invalid-signature`,
    title: 'Invalid Signature',
    detailTemplate: 'Ed25519 signature does not match the payload and key `{kid}`.',
    retryable: false,
  },
  {
    code: 'E_ISS_NOT_CANONICAL',
    httpStatus: 422,
    typeUri: `${BASE_TYPE_URI}/iss-not-canonical`,
    title: 'Issuer Not Canonical',
    detailTemplate:
      'The `iss` field `{issuer}` is not canonical. Must start with `https://` or `did:`.',
    retryable: false,
  },
  {
    code: 'E_CONSTRAINT_VIOLATION',
    httpStatus: 422,
    typeUri: `${BASE_TYPE_URI}/constraint-violation`,
    title: 'Constraint Violation',
    detailTemplate: '{count} validation error(s) in claims.',
    retryable: false,
  },
  {
    code: 'E_POLICY_BINDING_FAILED',
    httpStatus: 422,
    typeUri: `${BASE_TYPE_URI}/policy-binding-failed`,
    title: 'Policy Binding Failed',
    detailTemplate: 'Policy binding failed. Receipt digest does not match local digest.',
    retryable: false,
  },
  {
    code: 'E_EXPIRED',
    httpStatus: 422,
    typeUri: `${BASE_TYPE_URI}/expired`,
    title: 'Receipt Expired',
    detailTemplate: 'Receipt expired at {exp}. Current time is {now}.',
    retryable: false,
  },
  {
    code: 'E_NOT_YET_VALID',
    httpStatus: 422,
    typeUri: `${BASE_TYPE_URI}/not-yet-valid`,
    title: 'Not Yet Valid',
    detailTemplate: 'Receipt not valid until {nbf}. Current time is {now}.',
    retryable: true,
  },
  {
    code: 'E_JWKS_FETCH_FAILED',
    httpStatus: 502,
    typeUri: `${BASE_TYPE_URI}/jwks-fetch-failed`,
    title: 'JWKS Fetch Failed',
    detailTemplate: 'Could not resolve JWKS for issuer `{issuer}`. {reason}',
    retryable: true,
  },
  {
    code: 'E_VERIFY_ISSUER_CONFIG_MISSING',
    httpStatus: 502,
    typeUri: `${BASE_TYPE_URI}/issuer-config-missing`,
    title: 'Issuer Config Missing',
    detailTemplate: 'Issuer configuration not found at `{url}`.',
    retryable: true,
  },
  {
    code: 'E_VERIFY_ISSUER_CONFIG_INVALID',
    httpStatus: 502,
    typeUri: `${BASE_TYPE_URI}/issuer-config-invalid`,
    title: 'Issuer Config Invalid',
    detailTemplate: 'Issuer configuration at `{url}` is malformed. {reason}',
    retryable: false,
  },
  {
    code: 'E_KEY_NOT_FOUND',
    httpStatus: 400,
    typeUri: `${BASE_TYPE_URI}/key-not-found`,
    title: 'Key Not Found',
    detailTemplate: 'No key with `kid` `{kid}` found in JWKS for issuer `{issuer}`.',
    retryable: false,
  },
  {
    code: 'E_RATE_LIMITED',
    httpStatus: 429,
    typeUri: `${BASE_TYPE_URI}/rate-limited`,
    title: 'Rate Limited',
    detailTemplate: 'Rate limit exceeded. Retry after {retry_after} seconds.',
    retryable: true,
  },
  {
    code: 'E_PAYLOAD_TOO_LARGE',
    httpStatus: 413,
    typeUri: `${BASE_TYPE_URI}/payload-too-large`,
    title: 'Payload Too Large',
    detailTemplate: 'Request body exceeds {limit} bytes.',
    retryable: false,
  },
];

/** Map for O(1) lookup by code */
const CATALOG_MAP = new Map<string, CatalogEntry>(CATALOG_ENTRIES.map((e) => [e.code, e]));

/** All hosted error codes (for completeness testing) */
export const HOSTED_ERROR_CODES = new Set(CATALOG_ENTRIES.map((e) => e.code));

/**
 * RFC 9457 Problem Details response shape with PEAC extensions.
 */
export interface HostedProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  peac_error_code: string;
  peac_trace_id?: string;
  errors?: Array<{ pointer: string; detail: string }>;
}

/**
 * Build an RFC 9457 Problem Details response from a kernel error code.
 *
 * Interpolates {field} placeholders in the detail template with provided params.
 * Falls back to generic 500 for unknown codes.
 */
export function toProblemDetails(
  code: string,
  params?: Record<string, string>,
  instance?: string,
  traceId?: string
): HostedProblemDetails {
  const entry = CATALOG_MAP.get(code);
  if (!entry) {
    return {
      type: `${BASE_TYPE_URI}/processing-error`,
      title: 'Processing Error',
      status: 500,
      detail: 'An internal error occurred while processing the request.',
      instance,
      peac_error_code: code,
      peac_trace_id: traceId,
    };
  }

  let detail = entry.detailTemplate;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      detail = detail.replaceAll(`{${key}}`, value);
    }
  }

  return {
    type: entry.typeUri,
    title: entry.title,
    status: entry.httpStatus,
    detail,
    instance,
    peac_error_code: code,
    peac_trace_id: traceId,
  };
}

/**
 * Get catalog entry by code (for status code lookup without building full response).
 */
export function getCatalogEntry(code: string): CatalogEntry | undefined {
  return CATALOG_MAP.get(code);
}
